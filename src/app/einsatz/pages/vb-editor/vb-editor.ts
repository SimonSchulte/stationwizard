import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { ComponentType } from '@angular/cdk/portal';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
import { Ladeanzeige } from '../../../kern/zustand/ladeanzeige';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { Meldung } from '../../../kern/zustand/meldung';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import {
  AbschnittDialog,
  AbschnittDialogDaten,
  AbschnittDialogErgebnis,
} from '../../components/abschnitt-dialog/abschnitt-dialog';
import { AbschnittFarbpunkt } from '../../components/abschnitt-farbpunkt/abschnitt-farbpunkt';
import { FachgruppeChip } from '../../components/fachgruppe-chip/fachgruppe-chip';
import {
  AbschnittAuswahl,
  LaufzettelAuswahl,
  LaufzettelBearbeitung,
  LaufzettelFelder,
  PositionFelder,
  istPositionZiehdaten,
} from '../../components/laufzettel-bearbeitung/laufzettel-bearbeitung';
import { LaufzettelKarte } from '../../components/laufzettel-karte/laufzettel-karte';
import {
  VorlageAbgleichDialog,
  VorlageAbgleichDialogDaten,
} from '../../components/vorlage-abgleich-dialog/vorlage-abgleich-dialog';
import { Einsatz } from '../../models/einsatz.model';
import { VB_GRENZEN, VbAbschnitt, VbLaufzettel } from '../../models/vb.model';
import { EinsatzStoreService } from '../../services/einsatz-store.service';
import { LaufzettelLayoutWahl } from '../../services/laufzettel-layout-wahl';
import { STREIFEN_WAHL, laufzettelNummern } from '../../services/laufzettel-platz';
import {
  EditorModus,
  OHNE_ABSCHNITT_TITEL,
  VbEditorStoreService,
} from '../../services/vb-editor-store.service';
import { VbDruckDienst } from '../../services/vb-druck';
import { laufzettelMarken } from '../../services/vb-marken';

function zeichenfolge(wert: unknown): string {
  return typeof wert === 'string' ? wert : '';
}

function dateiname(text: string): string {
  const rumpf = text
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return rumpf || 'vorbereitung';
}

/**
 * VB-Editor (Mock 2): bearbeitet die Vorbereitung eines Einsatzes (`modus` `vorbereitung`)
 * oder eine Vorlage (`vorlage`) im selben Editor. Die Seite hält nur Auswahl und Suche; der
 * gesamte Arbeitsstand samt Rückgängig, Speichern und Abgleich liegt im
 * `VbEditorStoreService`. Reiter „Laufzettel“ (Liste mit Abschnitten links, Bearbeitung
 * rechts) und „Allgemeine Anweisungen“.
 */
@Component({
  selector: 'app-vb-editor',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    CdkDropListGroup,
    MatButtonModule,
    MatButtonToggleModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTabsModule,
    MatTooltipModule,
    RouterLink,
    AbschnittFarbpunkt,
    FachgruppeChip,
    Ladeanzeige,
    Leerzustand,
    LaufzettelBearbeitung,
    LaufzettelKarte,
    Meldung,
    Seitenkopf,
    Suchfeld,
  ],
  templateUrl: './vb-editor.html',
  styleUrl: './vb-editor.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VbEditor {
  protected readonly store = inject(VbEditorStoreService);
  protected readonly layout = inject(LaufzettelLayoutWahl);
  protected readonly streifenWahl = STREIFEN_WAHL;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly einsatzStore = inject(EinsatzStoreService);
  private readonly druck = inject(VbDruckDienst);

  protected readonly modus: EditorModus =
    this.route.snapshot.data['modus'] === 'vorlage' ? 'vorlage' : 'vorbereitung';
  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });

  protected readonly grenzen = VB_GRENZEN;
  protected readonly einsatz = signal<Einsatz | null>(null);
  protected readonly suche = signal('');
  protected readonly gewaehlteId = signal<string | null>(null);
  protected readonly druckLaeuft = signal(false);

  protected readonly zurueckZiel = computed(() =>
    this.modus === 'vorlage' ? '/einsatzplanung/vb-vorlagen' : '/einsatzplanung',
  );
  protected readonly zurueckText =
    this.modus === 'vorlage' ? 'Zurück zu den VB-Vorlagen' : 'Zurück zur Einsatzübersicht';

  protected readonly kopfTitel = computed(() =>
    this.modus === 'vorlage' ? this.store.titel().trim() || 'Neue Vorlage' : 'Vorbereitung',
  );

  protected readonly untertitel = computed(() => {
    if (this.modus === 'vorlage') return '';
    const teile: string[] = [];
    const einsatz = this.einsatz();
    if (einsatz) teile.push(einsatz.titel);
    const stand = this.store.entwurf();
    if (stand?.vorlageId) {
      const vorlage = this.store.abgleichVorlage();
      if (vorlage) {
        teile.push(`Kopie von Vorlage „${vorlage.daten.titel}“ (Version ${stand.vorlageVersion})`);
      } else if (this.store.vorlageFehlt()) {
        teile.push('Die Vorlage gibt es nicht mehr');
      } else {
        teile.push(`Kopie einer Vorlage (Version ${stand.vorlageVersion})`);
      }
    }
    return teile.join(' · ');
  });

  protected readonly nummern = computed(() => {
    const inhalt = this.store.inhalt();
    return inhalt ? laufzettelNummern(inhalt) : new Map<string, number>();
  });
  protected readonly laufzettelAnzahl = computed(() => this.nummern().size);

  protected readonly marken = computed(() => {
    const inhalt = this.store.inhalt();
    if (!inhalt || !this.store.abgleichVorlage()) return new Map();
    return laufzettelMarken(inhalt, this.store.abweichungen());
  });

  protected readonly sucheAktiv = computed(() => this.suche().trim() !== '');

  /**
   * Eingeklappte Abschnitte, nur für diese Sitzung (nicht gespeichert). Beim Suchen ist alles
   * aufgeklappt, damit kein Treffer verborgen bleibt.
   */
  protected readonly eingeklappt = signal<ReadonlySet<string>>(new Set());
  protected readonly alleEingeklappt = computed(() => {
    const abschnitte = this.store.inhalt()?.abschnitte ?? [];
    return abschnitte.length > 0 && abschnitte.every((a) => this.eingeklappt().has(a.id));
  });

  /** Abschnitte mit den zur Suche passenden Laufzetteln; ohne Suche der unveränderte Inhalt. */
  protected readonly sichtbar = computed<VbAbschnitt[]>(() => {
    const abschnitte = this.store.inhalt()?.abschnitte ?? [];
    const frage = this.suche().trim().toLowerCase();
    if (!frage) return abschnitte;
    const passt = (l: VbLaufzettel) =>
      [l.ueberschrift, l.lagerort, ...l.positionen.map((p) => p.material)].some((text) =>
        text.toLowerCase().includes(frage),
      );
    return abschnitte
      .map((a) => ({ ...a, laufzettel: a.laufzettel.filter(passt) }))
      .filter((a) => a.laufzettel.length > 0);
  });

  /** Gewählter Laufzettel; ohne (oder bei verschwundener) Wahl der erste. */
  protected readonly aktiv = computed(() => {
    const id = this.gewaehlteId();
    if (id) {
      const treffer = this.store.laufzettelFinden(id);
      if (treffer) return treffer;
    }
    const erster = this.store.inhalt()?.abschnitte.find((a) => a.laufzettel.length > 0);
    return erster ? { abschnitt: erster, laufzettel: erster.laufzettel[0] } : null;
  });

  protected readonly abschnittAuswahl = computed<AbschnittAuswahl[]>(() =>
    (this.store.inhalt()?.abschnitte ?? []).map((a) => ({ id: a.id, titel: a.titel })),
  );

  protected readonly zusammenfuehrenZiele = computed<LaufzettelAuswahl[]>(() => {
    const aktiv = this.aktiv();
    const nummern = this.nummern();
    return (this.store.inhalt()?.abschnitte ?? [])
      .flatMap((a) => a.laufzettel)
      .filter((l) => l.id !== aktiv?.laufzettel.id)
      .map((l) => ({
        id: l.id,
        nummer: nummern.get(l.id) ?? 0,
        text:
          l.positionen
            .map((p) => p.material)
            .filter(Boolean)
            .join(', ') ||
          l.ueberschrift ||
          'Ohne Inhalt',
      }));
  });

  protected readonly kannSpeichern = computed(
    () => this.store.geaendert() && !this.store.speichertGerade(),
  );

  private readonly bearbeitungsBereich = viewChild<ElementRef<HTMLElement>>('bearbeitungsBereich');

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) untracked(() => void this.oeffnen(id));
    });
    // Ein neu gewählter Laufzettel beginnt oben, nicht in der Scrollhöhe des vorigen.
    effect(() => {
      this.aktiv()?.laufzettel.id;
      const bereich = this.bearbeitungsBereich()?.nativeElement;
      if (bereich) bereich.scrollTop = 0;
    });
    inject(DestroyRef).onDestroy(() => this.store.zuruecksetzen());
  }

  // ------------------------------------------------------------------ Laden

  private async oeffnen(id: string): Promise<void> {
    const store = this.store;
    if (this.modus === 'vorlage') {
      if (id === 'neu') {
        if (!(store.modus() === 'vorlage' && store.istNeu())) store.neueVorlageBeginnen();
        return;
      }
      // Nach dem ersten Speichern ersetzt die Seite „neu“ durch die echte Id; dann nichts neu laden.
      if (!(store.modus() === 'vorlage' && store.vorlageId() === id && store.entwurf())) {
        await store.vorlageLaden(id);
      }
      return;
    }
    const einsatzLaden = this.einsatzStore.einsatzLaden(id);
    if (!(store.modus() === 'vorbereitung' && store.einsatzId() === id && store.entwurf())) {
      await store.vorbereitungLaden(id);
    }
    const einsatz = await einsatzLaden;
    if (this.id() === id) this.einsatz.set(einsatz?.daten ?? null);
  }

  protected erneutLaden(): void {
    const id = this.id();
    if (!id) return;
    void (this.modus === 'vorlage'
      ? this.store.vorlageLaden(id)
      : this.store.vorbereitungLaden(id));
  }

  // ------------------------------------------------------------------ Kopf und Menü

  protected async speichern(): Promise<void> {
    const warNeu = this.store.istNeu();
    if (!(await this.store.speichern())) return;
    if (this.modus === 'vorlage' && warNeu) {
      const id = this.store.vorlageId();
      if (id) {
        await this.router.navigate(['/einsatzplanung/vb-vorlagen', id], { replaceUrl: true });
      }
    }
    this.meldungen.erfolg(
      this.modus === 'vorlage' ? 'Vorlage gespeichert.' : 'Vorbereitung gespeichert.',
    );
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
    // Die Warnung vor zu vollen Laufzetteln meldet der VbDruckDienst selbst – für alle Aufrufer.
    const einsatz = this.einsatz();
    this.druckLaeuft.set(true);
    try {
      await this.druck[weg](
        {
          titel: this.modus === 'vorlage' ? this.store.titel() : (einsatz?.titel ?? 'Vorbereitung'),
          beginn: einsatz?.beginn ?? null,
          ende: einsatz?.ende ?? null,
          ort: einsatz?.ort ?? null,
        },
        inhalt,
      );
    } catch {
      this.meldungen.fehler('Der Druck konnte nicht erstellt werden.');
    } finally {
      this.druckLaeuft.set(false);
    }
  }

  protected async alsNeueVorlage(): Promise<void> {
    const vorgabe =
      this.modus === 'vorlage'
        ? `${this.store.titel()} (Kopie)`.slice(0, VB_GRENZEN.text)
        : (this.einsatz()?.titel ?? '');
    const titel = await this.dialogDienst.eingabe(
      'Aus dem aktuellen Stand wird eine neue Vorlage angelegt. Dieser Einsatz und andere Vorlagen bleiben unverändert.',
      'Als neue Vorlage speichern',
      'Titel der Vorlage',
      { wert: vorgabe, bestaetigenLabel: 'Anlegen' },
    );
    if (titel === null) return;
    const id = await this.store.alsNeueVorlageSpeichern(titel);
    if (id) this.meldungen.erfolg(`Vorlage „${titel}“ angelegt.`);
  }

  protected kopieHerunterladen(): void {
    const stand = this.store.entwurf();
    if (!stand) return;
    const name = this.modus === 'vorlage' ? stand.titel : (this.einsatz()?.titel ?? '');
    dateiHerunterladen(
      JSON.stringify(stand, null, 2),
      `vb-${dateiname(name)}.json`,
      'application/json',
    );
  }

  protected async neuLaden(): Promise<void> {
    if (
      this.store.geaendert() &&
      !(await this.dialogDienst.bestaetigen(
        'Die lokalen Änderungen gehen dabei verloren. Vorher lässt sich über das Menü eine Kopie herunterladen.',
        'Aktuellen Stand laden',
        'Verwerfen und laden',
      ))
    ) {
      return;
    }
    await this.store.neuLadenNachKonflikt();
  }

  protected async loeschen(): Promise<void> {
    const vorlage = this.modus === 'vorlage';
    const bestaetigt = await this.dialogDienst.bestaetigen(
      vorlage
        ? 'Die Vorlage wird gelöscht. Bereits angelegte Vorbereitungen bleiben unverändert.'
        : 'Die Vorbereitung dieses Einsatzes wird gelöscht. Die Vorlage und andere Einsätze bleiben unverändert.',
      vorlage ? 'Vorlage löschen' : 'Vorbereitung löschen',
      'Löschen',
    );
    if (!bestaetigt) return;
    const ziel = this.zurueckZiel();
    if (await (vorlage ? this.store.vorlageLoeschen() : this.store.vorbereitungLoeschen())) {
      this.meldungen.erfolg(vorlage ? 'Vorlage gelöscht.' : 'Vorbereitung gelöscht.');
      await this.router.navigateByUrl(ziel);
    }
  }

  // ------------------------------------------------------------------ Abgleich mit der Vorlage

  protected async vorlageAbgleichen(): Promise<void> {
    const vorlage = this.store.abgleichVorlage();
    const stand = this.store.entwurf();
    if (!vorlage || !stand) return;
    const ergebnis = await this.oeffneDialog<
      VorlageAbgleichDialog,
      VorlageAbgleichDialogDaten,
      string[]
    >(
      VorlageAbgleichDialog,
      {
        vorbereitung: this.einsatz()?.titel ?? 'Vorbereitung',
        vorlageTitel: vorlage.daten.titel,
        vorlageVersion: stand.vorlageVersion,
        aenderungen: this.store.abweichungen(),
      },
      '640px',
    );
    if (!ergebnis || ergebnis.length === 0) return;
    if (await this.store.aufVorlageAnwenden(new Set(ergebnis))) {
      this.meldungen.erfolg(
        ergebnis.length === 1
          ? '1 Änderung auf die Vorlage übertragen.'
          : `${ergebnis.length} Änderungen auf die Vorlage übertragen.`,
      );
    }
  }

  private async oeffneDialog<K, D, R>(
    komponente: ComponentType<K>,
    daten: D,
    breite: string,
  ): Promise<R | undefined> {
    const referenz = this.dialog.open<K, D, R>(komponente, {
      data: daten,
      width: breite,
      maxWidth: '94vw',
      restoreFocus: true,
    });
    return firstValueFrom(referenz.afterClosed(), { defaultValue: undefined });
  }

  // ------------------------------------------------------------------ Abschnitte

  protected abschnittHinzufuegen(): void {
    const id = this.store.abschnittHinzufuegen();
    const abschnitt = id ? this.store.inhalt()?.abschnitte.find((a) => a.id === id) : undefined;
    if (abschnitt) void this.abschnittBearbeiten(abschnitt);
  }

  protected async abschnittBearbeiten(abschnitt: VbAbschnitt): Promise<void> {
    const ergebnis = await this.oeffneDialog<
      AbschnittDialog,
      AbschnittDialogDaten,
      AbschnittDialogErgebnis
    >(
      AbschnittDialog,
      {
        titel: abschnitt.titel,
        farbe: abschnitt.farbe,
        fachgruppe: abschnitt.fachgruppe,
        foto: abschnitt.foto,
        laufzettelAnzahl:
          this.store.inhalt()?.abschnitte.find((a) => a.id === abschnitt.id)?.laufzettel.length ??
          abschnitt.laufzettel.length,
      },
      '720px',
    );
    if (!ergebnis) return;
    if (ergebnis.aktion === 'loeschen') {
      await this.abschnittLoeschen(abschnitt);
      return;
    }
    this.store.abschnittAendern(abschnitt.id, {
      titel: ergebnis.titel,
      farbe: ergebnis.farbe,
      fachgruppe: ergebnis.fachgruppe,
      foto: ergebnis.foto,
    });
    if (ergebnis.uebertragen) this.store.fachgruppeAufLaufzettelUebertragen(abschnitt.id);
  }

  private async abschnittLoeschen(abschnitt: VbAbschnitt): Promise<void> {
    const anzahl =
      this.store.inhalt()?.abschnitte.find((a) => a.id === abschnitt.id)?.laufzettel.length ?? 0;
    if (
      anzahl > 0 &&
      !(await this.dialogDienst.bestaetigen(
        abschnitt.titel === OHNE_ABSCHNITT_TITEL
          ? `Der Abschnitt „${abschnitt.titel}“ wird mit seinen ${anzahl} Laufzetteln gelöscht. Über „Rückgängig“ im Menü lässt sich das zurücknehmen.`
          : `Der Abschnitt „${abschnitt.titel}“ wird gelöscht. Seine ${anzahl} Laufzettel wandern in den Abschnitt „${OHNE_ABSCHNITT_TITEL}“. Über „Rückgängig“ im Menü lässt sich das zurücknehmen.`,
        'Abschnitt löschen',
        'Löschen',
      ))
    ) {
      return;
    }
    this.store.abschnittLoeschen(abschnitt.id);
  }

  protected abschnittAbgelegt(ereignis: CdkDragDrop<unknown, unknown, string>): void {
    if (ereignis.previousIndex === ereignis.currentIndex) return;
    this.store.abschnittVerschieben(ereignis.item.data, ereignis.currentIndex);
  }

  // ------------------------------------------------------------------ Laufzettel

  protected waehlen(id: string): void {
    this.gewaehlteId.set(id);
  }

  protected istEingeklappt(abschnittId: string): boolean {
    return !this.sucheAktiv() && this.eingeklappt().has(abschnittId);
  }

  protected abschnittUmschalten(abschnittId: string): void {
    this.eingeklappt.update((alt) => {
      const neu = new Set(alt);
      if (neu.has(abschnittId)) neu.delete(abschnittId);
      else neu.add(abschnittId);
      return neu;
    });
  }

  protected alleUmschalten(): void {
    const abschnitte = this.store.inhalt()?.abschnitte ?? [];
    this.eingeklappt.set(this.alleEingeklappt() ? new Set() : new Set(abschnitte.map((a) => a.id)));
  }

  private aufklappen(abschnittId: string): void {
    if (!this.eingeklappt().has(abschnittId)) return;
    this.eingeklappt.update((alt) => new Set([...alt].filter((id) => id !== abschnittId)));
  }

  protected laufzettelHinzufuegen(abschnittId?: string): void {
    const inhalt = this.store.inhalt();
    if (!inhalt) return;
    let ziel = abschnittId ?? this.aktiv()?.abschnitt.id ?? inhalt.abschnitte.at(-1)?.id ?? null;
    ziel ??= this.store.abschnittHinzufuegen();
    if (!ziel) return;
    const id = this.store.laufzettelHinzufuegen(ziel);
    if (id) {
      this.aufklappen(ziel);
      this.gewaehlteId.set(id);
    }
  }

  protected laufzettelAbgelegt(ereignis: CdkDragDrop<string, string, string>): void {
    if (
      ereignis.previousContainer === ereignis.container &&
      ereignis.previousIndex === ereignis.currentIndex
    ) {
      return;
    }
    this.store.laufzettelVerschieben(
      ereignis.item.data,
      ereignis.container.data,
      ereignis.currentIndex,
    );
  }

  /** Abschnitte und Laufzettel tragen ihre Id als Text; Positionen gehören nicht in diese Listen. */
  protected readonly nurKennungen = (element: CdkDrag): boolean => typeof element.data === 'string';

  /** Die Karten nehmen nur Positionen an. */
  protected readonly nurPositionen = (element: CdkDrag): boolean =>
    istPositionZiehdaten(element.data);

  /** Position(en) aus der Bearbeitung auf eine Karte gezogen: an den Zielliste anhängen. */
  protected positionenAbgelegt(ereignis: CdkDragDrop<string, unknown, unknown>): void {
    const daten: unknown = ereignis.item.data;
    if (!istPositionZiehdaten(daten)) return;
    const zielId = ereignis.container.data;
    const anzahl = this.store.positionenAufLaufzettel(zielId, daten.positionIds);
    if (anzahl === 0) return;
    const nummer = this.nummern().get(zielId);
    this.meldungen.info(
      `${anzahl === 1 ? '1 Position' : `${anzahl} Positionen`} auf Laufzettel ${nummer ?? ''} verschoben.`,
      { aktion: 'Rückgängig', beiAktion: () => this.store.rueckgaengig() },
    );
  }

  protected felderGeaendert(id: string, felder: LaufzettelFelder): void {
    this.store.laufzettelAendern(id, felder);
    if (felder.transportMit !== undefined) this.abschnittNachAufIn(id, felder.transportMit);
  }

  /** „Auf / In“ bestimmt den Abschnitt: gibt es einen Abschnitt mit diesem Titel, wandert der Laufzettel dorthin. */
  private abschnittNachAufIn(id: string, aufIn: string): void {
    const gesucht = aufIn.trim().toLocaleLowerCase('de');
    if (!gesucht) return;
    const aktuell = this.store.laufzettelFinden(id)?.abschnitt.id;
    const ziel = this.store
      .inhalt()
      ?.abschnitte.find((a) => a.titel.trim().toLocaleLowerCase('de') === gesucht);
    if (ziel && ziel.id !== aktuell) {
      this.store.laufzettelVerschieben(id, ziel.id, VB_GRENZEN.laufzettel);
    }
  }

  protected abschnittGewaehlt(id: string, abschnittId: string): void {
    this.store.laufzettelVerschieben(id, abschnittId, VB_GRENZEN.laufzettel);
  }

  protected positionGeaendert(id: string, felder: PositionFelder): void {
    this.store.positionAendern(id, felder);
  }

  protected laufzettelTeilen(id: string, positionIds: string[]): void {
    const neu = this.store.laufzettelTeilen(id, positionIds);
    if (neu) this.gewaehlteId.set(neu);
  }

  protected laufzettelAufteilen(id: string): void {
    const neu = this.store.laufzettelAufteilen(id);
    if (neu)
      this.meldungen.info('Die überzähligen Positionen stehen jetzt in einem neuen Laufzettel.');
  }

  protected laufzettelDuplizieren(id: string): void {
    const kopie = this.store.laufzettelDuplizieren(id);
    if (kopie) this.gewaehlteId.set(kopie);
  }

  protected laufzettelLoeschen(id: string): void {
    this.store.laufzettelLoeschen(id);
    this.gewaehlteId.set(null);
    this.meldungen.info('Laufzettel gelöscht.', {
      aktion: 'Rückgängig',
      beiAktion: () => this.store.rueckgaengig(),
    });
  }

  protected anweisungenAendern(ereignis: Event): void {
    this.store.anweisungenAendern(zeichenfolge((ereignis.target as HTMLTextAreaElement).value));
  }

  protected titelAendern(ereignis: Event): void {
    this.store.titelAendern(zeichenfolge((ereignis.target as HTMLInputElement).value));
  }
}
