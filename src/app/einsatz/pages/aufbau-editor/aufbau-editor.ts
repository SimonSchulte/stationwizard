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
import { MatBadgeModule } from '@angular/material/badge';
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
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
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
import { AUFBAU_GRENZEN } from '../../models/aufbau.model';
import {
  Artikel,
  ARTIKEL_EINHEITEN,
  ArtikelEinheit,
  KistenPosition,
} from '../../models/stammdaten.model';
import { Einsatz } from '../../models/einsatz.model';
import { pruefeAufbau } from '../../services/aufbau-abgleich';
import {
  alleEinheiten,
  artikelHinzufuegen,
  eintragAendern,
  eintragEntfernen,
  einheitAendern,
  einheitEntfernen,
  eintragInKisteLegen,
  eintragVerschieben,
  einheitenZiele,
  einheitHinzufuegen,
  findeEinheit,
  freieKisteHinzufuegen,
  freiePositionVerknuepfen,
  freienArtikelVerknuepfen,
  kisteMitStammdatenVerknuepfen,
  freienArtikelHinzufuegen,
  kisteAbgleichen,
  type BaumOrt,
  verschiebeImBaum,
  kistePositionAendern,
  kistePositionEntfernen,
  kistePositionHinzufuegen,
  kisteHinzufuegen,
  type KistenZiel,
  kistenZiele,
  mitNeuenIds,
} from '../../services/aufbau-bearbeiten';
import { AufbauEditorStoreService } from '../../services/aufbau-editor-store.service';
import { AufbauVorlagenStoreService } from '../../services/aufbau-vorlagen-store.service';
import { AufbauDruckDienst } from '../../services/aufbau-druck';
import {
  AUFBAU_EXCEL_MEDIENTYP,
  aufbauExcelErzeugen,
  aufbauExcelLesen,
} from '../../services/aufbau-excel';
import {
  aufbauZuZeilen,
  istGleicherAufbau,
  vergleicheAufbau,
  zeilenZuAufbau,
} from '../../services/aufbau-tabelle';
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
    MatBadgeModule,
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
  /** Seitenleiste mit Prüfung, Aushang-Reihenfolge und Anweisungen; reiner Sitzungszustand. */
  protected readonly pruefungOffen = signal(false);
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
  /** Alle Kisten des Aufbaus als Ziele für „In eine Kiste legen“. */
  protected readonly aufbauKisten = computed(() => {
    const inhalt = this.store.inhalt();
    return inhalt ? kistenZiele(inhalt) : [];
  });

  /** Alle Einheiten des Aufbaus als Ziele für „In andere Einheit verschieben“. */
  protected readonly einheitenZiele = computed(() => {
    const inhalt = this.store.inhalt();
    return inhalt ? einheitenZiele(inhalt) : [];
  });

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
    return { einheit };
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

  protected async kistenschilder(): Promise<void> {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const titel =
      this.modus === 'vorlage'
        ? this.store.titel() || 'Aufbau'
        : (this.einsatz()?.titel ?? 'Aufbau');
    try {
      if (!(await this.druck.kistenschilderDrucken(titel, inhalt, this.daten()))) {
        this.meldungen.warnung('Im Aufbau gibt es noch keine Kiste.');
      }
    } catch (ursache) {
      this.meldungen.fehler(
        ursache instanceof Error && ursache.message
          ? ursache.message
          : 'Die Kistenschilder konnten nicht erstellt werden.',
      );
    }
  }

  protected async kistenzettel(): Promise<void> {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const titel =
      this.modus === 'vorlage'
        ? this.store.titel() || 'Aufbau'
        : (this.einsatz()?.titel ?? 'Aufbau');
    try {
      if (!(await this.druck.kistenzettelDrucken(titel, inhalt, this.daten()))) {
        this.meldungen.warnung('Im Aufbau gibt es noch keine Kiste.');
      }
    } catch (ursache) {
      this.meldungen.fehler(
        ursache instanceof Error && ursache.message
          ? ursache.message
          : 'Die Kistenzettel konnten nicht erstellt werden.',
      );
    }
  }

  /** Dateiname ohne Sonderzeichen für den Excel-Download. */
  private excelDateiname(): string {
    const titel =
      this.modus === 'vorlage'
        ? this.store.titel() || 'Aufbau-Vorlage'
        : (this.einsatz()?.titel ?? 'Aufbau');
    const sauber = titel
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return `Aufbau-${sauber || 'Packliste'}.xlsx`;
  }

  /** Lädt den Arbeitsstand (auch Ungespeichertes) als bearbeitbare Excel-Datei herunter. */
  protected async excelExportieren(): Promise<void> {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    try {
      await this.stammdaten.laden();
      const mappe = await aufbauExcelErzeugen(aufbauZuZeilen(inhalt, this.daten()));
      dateiHerunterladen(mappe, this.excelDateiname(), AUFBAU_EXCEL_MEDIENTYP);
    } catch (ursache) {
      this.meldungen.fehler(
        ursache instanceof Error && ursache.message
          ? ursache.message
          : 'Die Excel-Datei konnte nicht erstellt werden.',
      );
    }
  }

  /**
   * Liest eine bearbeitete Excel-Datei ein und übernimmt sie nach Rückfrage in den Entwurf. Es wird
   * nichts gespeichert; „Rückgängig“ stellt den Stand davor wieder her.
   */
  protected async excelEinlesen(ereignis: Event): Promise<void> {
    const feld = ereignis.target as HTMLInputElement;
    const datei = feld.files?.[0];
    feld.value = '';
    const alt = this.store.inhalt();
    if (!datei || !alt) return;
    try {
      await this.stammdaten.laden();
      const zeilen = await aufbauExcelLesen(datei);
      const { inhalt, warnungen } = zeilenZuAufbau(zeilen, alt, this.daten());
      if (istGleicherAufbau(alt, inhalt)) {
        this.meldungen.info(
          warnungen.length > 0
            ? `Die Datei enthält keine Änderungen (${warnungen.length} Hinweise zu Zeilen).`
            : 'Die Datei enthält keine Änderungen gegenüber dem Editor.',
        );
        return;
      }
      const unterschied = vergleicheAufbau(alt, inhalt);
      const zeilenText = [
        `Neu: ${unterschied.neu}`,
        `Geändert: ${unterschied.geaendert}`,
        `Entfernt: ${unterschied.entfernt}`,
      ].join(' · ');
      const hinweise = warnungen.slice(0, 8);
      const rest = warnungen.length - hinweise.length;
      const nachricht = [
        `${zeilenText} (Einheiten und Einträge).`,
        'Übernommen wird nur in den Editor; gespeichert wird erst mit „Speichern“, „Rückgängig“ stellt den Stand davor wieder her.',
        ...(hinweise.length > 0
          ? ['', 'Hinweise:', ...hinweise, ...(rest > 0 ? [`… und ${rest} weitere`] : [])]
          : []),
      ].join('\n');
      if (!(await this.dialogDienst.bestaetigen(nachricht, 'Aus Excel übernehmen', 'Übernehmen'))) {
        return;
      }
      this.store.aendern(inhalt);
      if (this.store.hinweis()) {
        this.meldungen.fehler(this.store.hinweis());
      } else {
        this.meldungen.erfolg('Excel-Datei übernommen. Mit „Speichern“ sichern.');
      }
    } catch (ursache) {
      this.meldungen.fehler(
        ursache instanceof Error && ursache.message
          ? ursache.message
          : 'Die Datei konnte nicht gelesen werden.',
      );
    }
  }

  /** Löscht den gespeicherten Aufbau des Einsatzes beziehungsweise die Vorlage, nach Rückfrage. */
  protected async loeschen(): Promise<void> {
    const vorlage = this.modus === 'vorlage';
    const bestaetigt = await this.dialogDienst.bestaetigen(
      vorlage
        ? `„${this.store.titel()}“ wird endgültig gelöscht. Bereits daraus angelegte Aufbauten bleiben unverändert.`
        : `Der Aufbau von „${this.einsatz()?.titel ?? 'diesem Einsatz'}“ wird endgültig gelöscht, auch ungespeicherte Änderungen gehen verloren. Der Einsatz selbst bleibt bestehen und lässt sich neu planen.`,
      vorlage ? 'Aufbau-Vorlage löschen' : 'Aufbau löschen',
      'Endgültig löschen',
    );
    if (!bestaetigt) return;
    if (!(await this.store.loeschen())) return;
    this.meldungen.erfolg(vorlage ? 'Die Vorlage wurde gelöscht.' : 'Der Aufbau wurde gelöscht.');
    await this.router.navigateByUrl(this.zurueckZiel());
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

  protected baumVerschoben(ereignis: {
    quelle: BaumOrt;
    anker: BaumOrt | null;
    ebene?: 'tiefer' | 'hoeher';
  }): void {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const neu = verschiebeImBaum(inhalt, ereignis.quelle, ereignis.anker, ereignis.ebene);
    if (neu !== inhalt) this.store.aendern(neu);
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

  protected eintragVerschoben(
    einheitId: string,
    wahl: { eintragId: string; zielEinheitId: string },
  ): void {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const neu = eintragVerschieben(inhalt, einheitId, wahl.eintragId, wahl.zielEinheitId);
    if (neu === inhalt) {
      this.meldungen.warnung(
        `Der Eintrag lässt sich nicht verschieben (eine Einheit hat höchstens ${AUFBAU_GRENZEN.eintraegeJeEinheit} Einträge).`,
      );
      return;
    }
    this.store.aendern(neu);
  }

  protected eintragInKiste(einheitId: string, wahl: { eintragId: string; ziel: KistenZiel }): void {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    const neu = eintragInKisteLegen(inhalt, einheitId, wahl.eintragId, wahl.ziel);
    if (neu === inhalt) {
      this.meldungen.warnung(
        `Der Eintrag passt nicht in „${wahl.ziel.bezeichnung}“ (die Kiste hat höchstens ${AUFBAU_GRENZEN.kistenPositionen} Positionen).`,
      );
      return;
    }
    this.store.aendern(neu);
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
    wahl: { name: string; einheit: string; menge: number; lagerId: string | null },
  ): void {
    const inhalt = this.store.inhalt();
    if (inhalt) {
      this.store.aendern(
        freienArtikelHinzufuegen(
          inhalt,
          einheitId,
          wahl.name,
          wahl.einheit,
          wahl.menge,
          wahl.lagerId,
        ),
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

  /**
   * Nimmt einen freien Artikel in den Katalog auf (oder verknüpft ihn mit dem gleichnamigen) und
   * liefert den Katalogartikel; `null` bei Abbruch oder Fehler. Der Katalog wird sofort geschrieben,
   * unabhängig vom „Speichern“ des Aufbaus.
   */
  private async katalogartikelFuer(
    name: string,
    einheit: string,
    lagerId: string | null = null,
  ): Promise<Artikel | null> {
    const vorhanden = this.stammdaten.artikelFinden(name);
    if (vorhanden) {
      const ok = await this.dialogDienst.bestaetigen(
        `Im Artikelkatalog gibt es „${vorhanden.name}“ (${vorhanden.einheit}) schon. Der Eintrag wird damit verknüpft; Name und Einheit kommen dann aus dem Katalog.`,
        'Mit Katalogartikel verknüpfen',
        'Verknüpfen',
      );
      return ok ? vorhanden : null;
    }
    const gleiche = ARTIKEL_EINHEITEN.find((e) => e.toLowerCase() === einheit.trim().toLowerCase());
    const katalogEinheit: ArtikelEinheit = gleiche ?? 'Stück';
    const abweichung =
      !gleiche && einheit.trim() !== ''
        ? ` statt „${einheit.trim()}“ (der Katalog kennt nur feste Einheiten)`
        : '';
    const ok = await this.dialogDienst.bestaetigen(
      `„${name}“ wird mit der Einheit ${katalogEinheit}${abweichung} und ${lagerId ? 'dem gewählten Quelllager als Heimatlager' : 'ohne Heimatlager'} in den Artikelkatalog aufgenommen. Das wird sofort in den Stammdaten gespeichert, unabhängig vom „Speichern“ des Aufbaus.`,
      'In den Artikelkatalog übernehmen',
      'Übernehmen',
    );
    if (!ok) return null;
    const id = crypto.randomUUID();
    if (!(await this.stammdaten.artikelAnlegen({ id, name, einheit: katalogEinheit, lagerId }))) {
      this.meldungen.fehler(
        this.stammdaten.fehler() || 'Der Artikel konnte nicht angelegt werden.',
      );
      return null;
    }
    this.meldungen.erfolg(`„${name}“ ist jetzt im Artikelkatalog.`);
    return this.stammdaten.artikelNachId().get(id) ?? null;
  }

  protected async freienArtikelUebernehmen(einheitId: string, eintragId: string): Promise<void> {
    const eintrag = findeEinheit(
      this.store.inhalt() ?? { anweisungen: '', einheiten: [] },
      einheitId,
    )?.inhalt.find((x) => x.id === eintragId);
    if (eintrag?.art !== 'frei') return;
    const artikel = await this.katalogartikelFuer(eintrag.name, eintrag.einheit, eintrag.lagerId);
    const inhalt = this.store.inhalt();
    if (artikel && inhalt) {
      this.store.aendern(freienArtikelVerknuepfen(inhalt, einheitId, eintragId, artikel));
    }
  }

  protected async freiePositionUebernehmen(
    einheitId: string,
    ziel: { eintragId: string; index: number },
  ): Promise<void> {
    const kiste = findeEinheit(
      this.store.inhalt() ?? { anweisungen: '', einheiten: [] },
      einheitId,
    )?.inhalt.find((x) => x.id === ziel.eintragId);
    const position = kiste?.art === 'kiste' ? kiste.inhalt[ziel.index] : undefined;
    if (!position || position.artikelId !== null) return;
    const artikel = await this.katalogartikelFuer(position.name, position.einheit);
    const inhalt = this.store.inhalt();
    if (artikel && inhalt) {
      this.store.aendern(
        freiePositionVerknuepfen(inhalt, einheitId, ziel.eintragId, ziel.index, artikel),
      );
    }
  }

  /**
   * Nimmt eine freie Kiste in die Kisten-Stammdaten auf (oder verknüpft sie mit der gleichnamigen). Freie
   * Positionen werden dabei Katalogartikel (gleichnamige werden verwendet, fehlende angelegt), weil eine
   * Stammdaten-Kiste nur Katalogartikel führt. Alles wird sofort geschrieben, unabhängig vom „Speichern“.
   */
  protected async kisteUebernehmen(einheitId: string, eintragId: string): Promise<void> {
    const eintrag = findeEinheit(
      this.store.inhalt() ?? { anweisungen: '', einheiten: [] },
      einheitId,
    )?.inhalt.find((x) => x.id === eintragId);
    if (eintrag?.art !== 'kiste' || eintrag.kisteId !== null) return;
    const vorhanden = this.stammdaten.kisteFinden(eintrag.name);
    if (vorhanden) {
      const ok = await this.dialogDienst.bestaetigen(
        `In den Kisten-Stammdaten gibt es „${vorhanden.name}“ schon. Die Kiste wird damit verknüpft; ihr Inhalt im Aufbau bleibt unverändert, Unterschiede werden angezeigt.`,
        'Mit Stammdaten-Kiste verknüpfen',
        'Verknüpfen',
      );
      const inhalt = this.store.inhalt();
      if (ok && inhalt) {
        this.store.aendern(
          kisteMitStammdatenVerknuepfen(inhalt, einheitId, eintragId, vorhanden.id),
        );
      }
      return;
    }
    const frei = eintrag.inhalt.filter((p) => p.artikelId === null);
    const hinweis =
      frei.length > 0
        ? ` ${frei.length} freie Position${frei.length === 1 ? '' : 'en'} werden dabei Katalogartikel (gleichnamige werden verwendet, fehlende neu angelegt, Einheit Stück, wenn sie keiner festen Einheit entspricht).`
        : '';
    const ok = await this.dialogDienst.bestaetigen(
      `„${eintrag.name}“ wird mit ${eintrag.inhalt.length} Positionen und ${eintrag.lagerId ? 'ihrem Lager als Heimatlager' : 'ohne Heimatlager'} in die Kisten-Stammdaten aufgenommen.${hinweis} Das wird sofort gespeichert, unabhängig vom „Speichern“ des Aufbaus.`,
      'In die Kisten-Stammdaten übernehmen',
      'Übernehmen',
    );
    if (!ok) return;

    const positionen: KistenPosition[] = [];
    for (const p of eintrag.inhalt) {
      let artikelId: string;
      if (p.artikelId !== null) {
        artikelId = p.artikelId;
      } else {
        let artikel = this.stammdaten.artikelFinden(p.name);
        if (!artikel) {
          const gleiche = ARTIKEL_EINHEITEN.find(
            (e) => e.toLowerCase() === p.einheit.trim().toLowerCase(),
          );
          const angelegt = await this.stammdaten.artikelAnlegen({
            name: p.name,
            einheit: gleiche ?? 'Stück',
            lagerId: null,
          });
          artikel = angelegt ? this.stammdaten.artikelFinden(p.name) : undefined;
        }
        if (!artikel) {
          this.meldungen.fehler(
            this.stammdaten.fehler() || `Der Artikel „${p.name}“ konnte nicht angelegt werden.`,
          );
          return;
        }
        artikelId = artikel.id;
      }
      const bisher = positionen.findIndex((x) => x.artikelId === artikelId);
      const vorher = positionen[bisher];
      if (vorher) {
        positionen[bisher] = {
          artikelId,
          menge: Math.round((vorher.menge + p.menge) * 1000) / 1000,
          bemerkung: [vorher.bemerkung, p.bemerkung]
            .filter((t) => t !== '')
            .join('; ')
            .slice(0, 200),
        };
      } else {
        positionen.push({ artikelId, menge: p.menge, bemerkung: p.bemerkung });
      }
    }
    const kiste = await this.stammdaten.kisteMitInhaltAnlegen({
      name: eintrag.name,
      lagerId: eintrag.lagerId,
      platzId: eintrag.platzId ?? null,
      inhalt: positionen.map((p) => ({
        artikelId: p.artikelId,
        menge: p.menge,
        bemerkung: p.bemerkung,
      })),
    });
    if (!kiste) {
      this.meldungen.fehler(this.stammdaten.fehler() || 'Die Kiste konnte nicht angelegt werden.');
      return;
    }
    const inhalt = this.store.inhalt();
    if (inhalt) {
      this.store.aendern(
        kisteMitStammdatenVerknuepfen(inhalt, einheitId, eintragId, kiste.id, positionen),
      );
    }
    this.meldungen.erfolg(`„${kiste.name}“ ist jetzt in den Kisten-Stammdaten.`);
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
