import { toSignal } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { VerlassenSchutz } from '../../../kern/verlassen-schutz';
import { Ladeanzeige } from '../../../kern/zustand/ladeanzeige';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { Meldung } from '../../../kern/zustand/meldung';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { AufbauBaum, EinheitNeu } from '../../components/aufbau-baum/aufbau-baum';
import {
  EinheitAenderung,
  EinheitDetail,
  EintragAenderung,
  KistePositionAenderung,
  KistePositionEntfernung,
  KistePositionNeu,
} from '../../components/einheit-detail/einheit-detail';
import { ZettelVorschau } from '../../components/zettel-vorschau/zettel-vorschau';
import { AUFBAU_GRENZEN } from '../../models/aufbau.model';
import { Einsatz } from '../../models/einsatz.model';
import { pruefeAufbau } from '../../services/aufbau-abgleich';
import {
  alleEinheiten,
  artikelHinzufuegen,
  eintragAendern,
  eintragEntfernen,
  einheitAendern,
  einheitEntfernen,
  einheitHinzufuegen,
  findeEinheit,
  freieKisteHinzufuegen,
  freienArtikelHinzufuegen,
  kisteAbgleichen,
  kistePositionAendern,
  kistePositionEntfernen,
  kistePositionHinzufuegen,
  kisteHinzufuegen,
  mitNeuenIds,
} from '../../services/aufbau-bearbeiten';
import { AufbauEditorStoreService } from '../../services/aufbau-editor-store.service';
import { AufbauVorlagenStoreService } from '../../services/aufbau-vorlagen-store.service';
import { AufbauDruckDienst } from '../../services/aufbau-druck';
import { leiteZettelAb, sortiereAushang } from '../../services/aufbau-zettel';
import { LaufzettelLayoutWahl } from '../../services/laufzettel-layout-wahl';
import { STREIFEN_WAHL } from '../../services/laufzettel-platz';
import { EinsatzStoreService } from '../../services/einsatz-store.service';
import { StammdatenStoreService } from '../../services/stammdaten-store.service';

type Modus = 'aufbau' | 'vorlage';

/**
 * Aufbau-Editor: bearbeitet die Packliste eines Einsatzes (`aufbau`) oder eine Aufbau-Vorlage
 * (`vorlage`). Links der Baum aus Fahrzeugen, Wagen, Kisten und losen Artikeln, rechts die gewählte
 * Einheit, darunter Zettelvorschau, Prüfung und Reihenfolge des Aushangs. Die Seite hält nur Auswahl
 * und Sortierung; der Arbeitsstand liegt im `AufbauEditorStoreService`, Zettel und Prüfung werden
 * daraus abgeleitet und nie gespeichert.
 */
@Component({
  selector: 'app-aufbau-editor',
  imports: [
    AufbauBaum,
    EinheitDetail,
    Ladeanzeige,
    Leerzustand,
    MatButtonModule,
    MatButtonToggleModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTooltipModule,
    Meldung,
    RouterLink,
    Seitenkopf,
    ZettelVorschau,
  ],
  templateUrl: './aufbau-editor.html',
  styleUrl: './aufbau-editor.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AufbauEditor {
  protected readonly store = inject(AufbauEditorStoreService);
  protected readonly stammdaten = inject(StammdatenStoreService);
  protected readonly vorlagen = inject(AufbauVorlagenStoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly einsatzStore = inject(EinsatzStoreService);
  private readonly druck = inject(AufbauDruckDienst);
  protected readonly layout = inject(LaufzettelLayoutWahl);
  protected readonly streifenWahl = STREIFEN_WAHL;

  protected readonly modus: Modus =
    this.route.snapshot.data['modus'] === 'vorlage' ? 'vorlage' : 'aufbau';
  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });

  protected readonly einsatz = signal<Einsatz | null>(null);
  protected readonly gewaehltId = signal<string | null>(null);
  protected readonly druckLaeuft = signal(false);
  /** Reihenfolge am Aushang; dieselbe Wahl gilt für den Druck (`LaufzettelLayoutWahl`). */
  protected readonly sortierung = computed(() =>
    this.layout.sortierung() === 'lager' ? 'lager' : 'nummer',
  );
  protected readonly maxTitel = 200;
  protected readonly maxAnweisungen = AUFBAU_GRENZEN.anweisungen;

  protected readonly zurueckZiel = computed(() =>
    this.modus === 'vorlage' ? '/verwaltung/einsatz-vorlagen' : '/einsatzplanung',
  );
  protected readonly zurueckText =
    this.modus === 'vorlage' ? 'Zurück zu den Vorlagen' : 'Zurück zur Einsatzübersicht';
  protected readonly kopfTitel = computed(() =>
    this.modus === 'vorlage' ? this.store.titel().trim() || 'Neue Aufbau-Vorlage' : 'Aufbau',
  );
  protected readonly untertitel = computed(() => {
    if (this.modus === 'vorlage') return '';
    const teile: string[] = [];
    const einsatz = this.einsatz();
    if (einsatz) teile.push(einsatz.titel);
    const stand = this.store.entwurf();
    if (stand?.vorlageId) teile.push(`Kopie einer Vorlage (Version ${stand.vorlageVersion})`);
    return teile.join(' · ');
  });

  private readonly daten = computed(() => ({
    lager: this.stammdaten.lager(),
    artikel: this.stammdaten.artikel(),
    kisten: this.stammdaten.kisten(),
  }));

  protected readonly zettel = computed(() => {
    const inhalt = this.store.inhalt();
    return inhalt ? leiteZettelAb(inhalt, this.daten()) : [];
  });
  protected readonly aushang = computed(() =>
    sortiereAushang(this.zettel(), this.sortierung(), this.stammdaten.lager()),
  );
  protected readonly probleme = computed(() => {
    const inhalt = this.store.inhalt();
    return inhalt ? pruefeAufbau(inhalt, this.daten()) : [];
  });
  protected readonly fehler = computed(() => this.probleme().filter((p) => p.schwere === 'fehler'));

  /** Gewählte Einheit; ohne (oder bei verschwundener) Wahl die erste. */
  protected readonly aktiv = computed(() => {
    const inhalt = this.store.inhalt();
    if (!inhalt) return null;
    const gewaehlt = this.gewaehltId();
    const einheit =
      (gewaehlt ? findeEinheit(inhalt, gewaehlt) : undefined) ?? alleEinheiten(inhalt)[0];
    if (!einheit) return null;
    return { einheit, oberste: inhalt.einheiten.some((e) => e.id === einheit.id) };
  });
  protected readonly aktiverZettel = computed(() => {
    const aktiv = this.aktiv();
    return aktiv ? (this.zettel().find((z) => z.einheitId === aktiv.einheit.id) ?? null) : null;
  });

  protected readonly kannSpeichern = computed(
    () => this.store.geaendert() && !this.store.speichertGerade(),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) untracked(() => void this.oeffnen(id));
    });
    inject(VerlassenSchutz).registrieren(() => this.hatUngespeichertes());
    inject(DestroyRef).onDestroy(() => this.store.zuruecksetzen());
  }

  /** Für den Route-Guard: ungespeicherte Änderungen im Entwurf. */
  hatUngespeichertes(): boolean {
    return this.store.geaendert();
  }

  private async oeffnen(id: string): Promise<void> {
    void this.stammdaten.laden();
    if (this.modus === 'vorlage') {
      // Nach dem ersten Speichern ersetzt die Seite „neu“ durch die echte Id; dann nichts neu laden.
      const schonDa = this.store.modus() === 'vorlage' && !!this.store.entwurf();
      if (id === 'neu' ? !schonDa : !(schonDa && this.store.vorlageId() === id)) {
        await this.store.ladeVorlage(id);
      }
      return;
    }
    const einsatzLaden = this.einsatzStore.einsatzLaden(id);
    if (!(
      this.store.modus() === 'aufbau' &&
      this.store.einsatzId() === id &&
      this.store.entwurf()
    )) {
      await this.store.ladeAufbau(id);
      if (this.store.nichtGefunden()) void this.vorlagen.laden();
    }
    const einsatz = await einsatzLaden;
    if (this.id() === id) this.einsatz.set(einsatz?.daten ?? null);
  }

  protected erneutLaden(): void {
    const id = this.id();
    if (!id) return;
    void (this.modus === 'vorlage' ? this.store.ladeVorlage(id) : this.store.ladeAufbau(id));
  }

  // ------------------------------------------------------------------ Anlegen und Speichern

  protected async leerAnlegen(): Promise<void> {
    await this.anlegen(null);
  }

  protected async ausVorlageAnlegen(vorlageId: string): Promise<void> {
    const vorlage = await this.vorlagen.vorlageLaden(vorlageId);
    if (!vorlage) {
      this.meldungen.fehler(this.vorlagen.fehler() || 'Die Vorlage wurde nicht gefunden.');
      return;
    }
    await this.anlegen(vorlage);
  }

  private async anlegen(
    vorlage: Parameters<AufbauEditorStoreService['anlegen']>[1],
  ): Promise<void> {
    const id = this.id();
    if (!id) return;
    if (await this.store.anlegen(id, vorlage)) {
      this.meldungen.erfolg('Aufbau angelegt.');
    } else {
      this.meldungen.fehler(
        this.store.speicherFehler() || 'Der Aufbau konnte nicht angelegt werden.',
      );
    }
  }

  protected async speichern(): Promise<void> {
    const warNeu = this.store.istNeu();
    if (!(await this.store.speichern())) return;
    if (this.modus === 'vorlage' && warNeu) {
      const id = this.store.vorlageId();
      if (id) {
        await this.router.navigate(['/einsatzplanung/aufbau-vorlagen', id], { replaceUrl: true });
      }
    }
    this.meldungen.erfolg(
      this.modus === 'vorlage' ? 'Vorlage gespeichert.' : 'Aufbau gespeichert.',
    );
  }

  protected async alsNeueVorlage(): Promise<void> {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const vorgabe =
      this.modus === 'vorlage'
        ? `${this.store.titel()} (Kopie)`.slice(0, this.maxTitel)
        : (this.einsatz()?.titel ?? '');
    const titel = await this.dialogDienst.eingabe(
      'Aus dem aktuellen Stand wird eine neue Vorlage angelegt. Dieser Einsatz und andere Vorlagen bleiben unverändert.',
      'Als neue Vorlage speichern',
      'Titel der Vorlage',
      { wert: vorgabe, bestaetigenLabel: 'Anlegen', maxLaenge: this.maxTitel },
    );
    if (titel === null) return;
    const version = await this.vorlagen.anlegen({
      id: crypto.randomUUID(),
      titel,
      inhalt: mitNeuenIds(inhalt),
    });
    if (version !== null) this.meldungen.erfolg(`Vorlage „${titel}“ angelegt.`);
    else
      this.meldungen.fehler(this.vorlagen.fehler() || 'Die Vorlage konnte nicht angelegt werden.');
  }

  protected titelAendern(ereignis: Event): void {
    this.store.titelSetzen((ereignis.target as HTMLInputElement).value);
  }

  protected anweisungenAendern(ereignis: Event): void {
    const inhalt = this.store.inhalt();
    if (inhalt) {
      this.store.aendern({
        ...inhalt,
        anweisungen: (ereignis.target as HTMLTextAreaElement).value,
      });
    }
  }

  protected sortierungWaehlen(wert: 'lager' | 'nummer'): void {
    this.layout.setzeSortierung(wert === 'lager' ? 'lager' : 'abschnitt');
  }

  protected drucken(): Promise<void> {
    return this.ausgeben('drucken');
  }

  protected herunterladen(): Promise<void> {
    return this.ausgeben('herunterladen');
  }

  private async ausgeben(weg: 'drucken' | 'herunterladen'): Promise<void> {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const einsatz = this.einsatz();
    this.druckLaeuft.set(true);
    try {
      await this.druck[weg](
        {
          titel:
            this.modus === 'vorlage'
              ? this.store.titel() || 'Aufbau'
              : (einsatz?.titel ?? 'Aufbau'),
          beginn: einsatz?.beginn ?? null,
          ende: einsatz?.ende ?? null,
          ort: einsatz?.ort ?? null,
        },
        inhalt,
        this.daten(),
      );
    } catch (ursache) {
      this.meldungen.fehler(
        ursache instanceof Error && ursache.message
          ? ursache.message
          : 'Der Druck konnte nicht erstellt werden.',
      );
    } finally {
      this.druckLaeuft.set(false);
    }
  }

  protected async neuLaden(): Promise<void> {
    if (
      this.store.geaendert() &&
      !(await this.dialogDienst.bestaetigen(
        'Die lokalen Änderungen gehen dabei verloren.',
        'Aktuellen Stand laden',
        'Verwerfen und laden',
      ))
    ) {
      return;
    }
    this.erneutLaden();
  }

  // ------------------------------------------------------------------ Bearbeiten

  protected einheitNeu(neu: EinheitNeu): void {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const ergebnis = einheitHinzufuegen(inhalt, neu.typ, '', neu.inFahrzeugId);
    this.store.aendern(ergebnis.inhalt);
    this.gewaehltId.set(ergebnis.id);
  }

  protected einheitGeaendert(id: string, aenderung: EinheitAenderung): void {
    const inhalt = this.store.inhalt();
    if (inhalt) this.store.aendern(einheitAendern(inhalt, id, aenderung));
  }

  protected async einheitEntfernen(id: string): Promise<void> {
    const inhalt = this.store.inhalt();
    const einheit = inhalt ? findeEinheit(inhalt, id) : undefined;
    if (!inhalt || !einheit) return;
    if (
      !(await this.dialogDienst.bestaetigen(
        `„${einheit.name}“ wird samt Inhalt aus dem Aufbau entfernt. Rückgängig ist möglich, solange die Seite offen ist.`,
        'Einheit entfernen',
        'Entfernen',
      ))
    ) {
      return;
    }
    this.store.aendern(einheitEntfernen(inhalt, id));
    this.gewaehltId.set(null);
  }

  protected eintragGeaendert(einheitId: string, aenderung: EintragAenderung): void {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const { eintragId, ...rest } = aenderung;
    this.store.aendern(eintragAendern(inhalt, einheitId, eintragId, rest));
  }

  protected eintragEntfernt(einheitId: string, eintragId: string): void {
    const inhalt = this.store.inhalt();
    if (inhalt) this.store.aendern(eintragEntfernen(inhalt, einheitId, eintragId));
  }

  protected kisteHinzugefuegt(einheitId: string, kisteId: string): void {
    const inhalt = this.store.inhalt();
    const kiste = this.stammdaten.kisten().find((k) => k.id === kisteId);
    if (inhalt && kiste) this.store.aendern(kisteHinzufuegen(inhalt, einheitId, kiste));
  }

  protected artikelHinzugefuegt(
    einheitId: string,
    wahl: { artikelId: string; menge: number },
  ): void {
    const inhalt = this.store.inhalt();
    const artikel = this.stammdaten.artikel().find((a) => a.id === wahl.artikelId);
    if (inhalt && artikel) {
      this.store.aendern(artikelHinzufuegen(inhalt, einheitId, artikel, wahl.menge));
    }
  }

  protected freierArtikelHinzugefuegt(
    einheitId: string,
    wahl: { name: string; einheit: string; menge: number },
  ): void {
    const inhalt = this.store.inhalt();
    if (inhalt) {
      this.store.aendern(
        freienArtikelHinzufuegen(inhalt, einheitId, wahl.name, wahl.einheit, wahl.menge),
      );
    }
  }

  protected freieKisteHinzugefuegt(
    einheitId: string,
    wahl: { name: string; anzahl: number },
  ): void {
    const inhalt = this.store.inhalt();
    if (inhalt)
      this.store.aendern(freieKisteHinzufuegen(inhalt, einheitId, wahl.name, wahl.anzahl));
  }

  protected kistePositionHinzugefuegt(einheitId: string, neu: KistePositionNeu): void {
    const inhalt = this.store.inhalt();
    if (inhalt) {
      this.store.aendern(kistePositionHinzufuegen(inhalt, einheitId, neu.eintragId, neu.position));
    }
  }

  protected kistePositionGeaendert(einheitId: string, a: KistePositionAenderung): void {
    const inhalt = this.store.inhalt();
    if (inhalt) {
      this.store.aendern(
        kistePositionAendern(inhalt, einheitId, a.eintragId, a.index, { menge: a.menge }),
      );
    }
  }

  protected kistePositionEntfernt(einheitId: string, e: KistePositionEntfernung): void {
    const inhalt = this.store.inhalt();
    if (inhalt) this.store.aendern(kistePositionEntfernen(inhalt, einheitId, e.eintragId, e.index));
  }

  protected kisteAbgeglichen(einheitId: string, eintragId: string): void {
    const inhalt = this.store.inhalt();
    const einheit = inhalt ? findeEinheit(inhalt, einheitId) : undefined;
    const eintrag = einheit?.inhalt.find((x) => x.id === eintragId);
    if (!inhalt || eintrag?.art !== 'kiste' || !eintrag.kisteId) return;
    const kiste = this.stammdaten.kisten().find((k) => k.id === eintrag.kisteId);
    if (kiste) this.store.aendern(kisteAbgleichen(inhalt, einheitId, eintragId, kiste));
  }

  protected fotoFehler(text: string): void {
    this.meldungen.fehler(text);
  }
}
