import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuswertungPanel } from '../../components/auswertung-panel/auswertung-panel';
import { BacklogPanel } from '../../components/backlog-panel/backlog-panel';
import { DatumDialog, DatumDialogDaten } from '../../components/datum-dialog/datum-dialog';
import { HiorgEintragKarte } from '../../components/hiorg-eintrag-karte/hiorg-eintrag-karte';
import { KatsPanel } from '../../components/kats-panel/kats-panel';
import { LeererTag } from '../../components/leerer-tag/leerer-tag';
import { QuelleDialog } from '../../components/quelle-dialog/quelle-dialog';
import { TerminDialog, TerminDialogDaten } from '../../components/termin-dialog/termin-dialog';
import { TerminKarte } from '../../components/termin-karte/termin-karte';
import { BUNDESLAENDER, BundeslandCode } from '../../data/bundeslaender';
import { WOCHENTAG_OPTIONEN, diensttagName } from '../../../kern/kalender/wochentage';
import { HiorgEintrag, istMehrtaegig } from '../../models/hiorg-kalender.model';
import { Termin, leererTermin, leeresDocument } from '../../models/plan.model';
import { DiensttagService } from '../../services/diensttag.service';
import {
  HiorgAbweichung,
  HiorgTagesAbgleich,
  baueHiorgAbgleich,
} from '../../services/hiorg-abgleich';
import { HiorgKalenderService } from '../../services/hiorg-kalender.service';
import { FeiertagService } from '../../services/feiertage.service';
import { PlanSlot, WochenZeile, baueWochenraster } from '../../services/plan-raster';
import { PlanStore } from '../../services/plan-store';
import { WorkbookService } from '../../services/workbook.service';
import { herunterladen } from '../../storage/lokale-datei.storage';
import { WorkbookStorage } from '../../storage/workbook-storage';
import {
  MONATSNAMEN,
  WOCHENTAGE_ISO,
  Wochentag,
  formatiereDatum,
  heuteIso,
  jahrVon,
  monatIndex,
} from '../../../kern/kalender/datum';

/** Hauptansicht: Wochenraster links, Ideen/Auswertung/KatS-A-Plan rechts. */
@Component({
  selector: 'app-jahresplan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AuswertungPanel,
    BacklogPanel,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    HiorgEintragKarte,
    KatsPanel,
    LeererTag,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTabsModule,
    MatToolbarModule,
    MatTooltipModule,
    TerminKarte,
  ],
  templateUrl: './jahresplan.html',
  styleUrl: './jahresplan.less',
  host: {
    '(window:keydown)': 'tastendruck($event)',
    '(window:beforeunload)': 'vorVerlassen($event)',
  },
})
export class Jahresplan {
  private readonly dialog = inject(MatDialog);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly snackBar = inject(MatSnackBar);
  readonly store = inject(PlanStore);
  readonly workbook = inject(WorkbookService);
  readonly feiertage = inject(FeiertagService);
  readonly diensttagService = inject(DiensttagService);
  readonly hiorg = inject(HiorgKalenderService);

  readonly bundeslaender = BUNDESLAENDER;
  readonly wochentagOptionen = WOCHENTAG_OPTIONEN;
  readonly wochentageIso = WOCHENTAGE_ISO;
  readonly ziel = this.workbook.ziel;
  readonly beschaeftigt = this.workbook.beschaeftigt;

  readonly monatsnamen = MONATSNAMEN;
  readonly heute = heuteIso();

  /**
   * Angezeigter Monat (`0..11`) oder `null` für das ganze Jahr. Der Plan startet
   * im laufenden Monat, statt den Nutzer jedes Mal aus dem Januar herausscrollen
   * zu lassen.
   */
  readonly monat = signal<number | null>(monatIndex(heuteIso()));

  readonly suche = signal('');
  readonly nurLuecken = signal(false);
  /** Zeigt nur Wochen mit einer HiOrg-Namensabweichung. */
  readonly nurAbweichungen = signal(false);
  /** Nur auf schmalen Bildschirmen relevant: Plan und Seitenleiste teilen sich dort den Platz. */
  readonly mobilAnsicht = signal<'plan' | 'liste'>('plan');

  readonly monatsTitel = computed(() => {
    const monat = this.monat();
    return monat === null ? 'Ganzes Jahr' : MONATSNAMEN[monat];
  });
  /** Zeigt der Plan gerade den laufenden Monat des laufenden Jahres? */
  readonly imAktuellenMonat = computed(
    () => this.store.jahr() === jahrVon(this.heute) && this.monat() === monatIndex(this.heute),
  );

  /**
   * Anstehende HiOrg-Termine für den Willkommen-Bildschirm, bevor überhaupt eine
   * Arbeitsmappe offen ist – ohne Wochenraster, Diensttage oder Abgleich, die alle
   * an einem geöffneten Rahmenplan hängen. Nach Beginn sortiert, laufende und
   * künftige Termine, auf eine überschaubare Anzahl gedeckelt.
   */
  readonly naechsteHiorgTermine = computed<HiorgEintrag[]>(() => {
    const heute = this.heute;
    return [...this.hiorg.eintraege()]
      .filter((e) => e.ende >= heute)
      .sort((a, b) => a.beginn.localeCompare(b.beginn) || a.beginnZeit.localeCompare(b.beginnZeit))
      .slice(0, 20);
  });

  /**
   * Kurzstatus der HiOrg-Verbindung für die Kopfleiste – deutlich sichtbar statt
   * nur im Overflow-Menü lesbar. Die vier Zustände von `HiorgKalenderService`
   * decken sich mit dem Fußzeilentext dort; hier kommt Symbol/„lädt"-Fall hinzu.
   */
  readonly hiorgStatus = computed(() => {
    if (this.hiorg.laedt()) {
      return {
        icon: 'cloud_sync',
        text: 'HiOrg wird geladen…',
        tooltip: 'HiOrg-Termine werden gerade abgerufen',
      };
    }
    switch (this.hiorg.zustand()) {
      case 'geladen':
        return {
          icon: 'cloud_done',
          text: `${this.hiorg.eintraege().length} HiOrg-Termine`,
          tooltip: 'HiOrg-Kalenderfeed verbunden – zum Neuladen klicken',
        };
      case 'nicht-konfiguriert':
        return {
          icon: 'cloud_off',
          text: 'HiOrg nicht eingerichtet',
          tooltip: 'Der HiOrg-Kalenderfeed ist noch nicht eingerichtet',
        };
      case 'fehler':
        return {
          icon: 'cloud_alert',
          text: 'HiOrg-Fehler',
          tooltip: this.hiorg.fehler() || 'HiOrg-Termine sind nicht abrufbar',
        };
      default:
        return {
          icon: 'cloud_queue',
          text: 'HiOrg noch nicht abgerufen',
          tooltip: 'HiOrg-Termine wurden noch nicht abgerufen – zum Laden klicken',
        };
    }
  });

  readonly quelleBeschreibung = computed(() => this.ziel()?.bezeichnung ?? 'Keine Quelle geöffnet');
  readonly kannSpeichern = computed(() => this.ziel() !== null);
  readonly direktesSpeichern = computed(() => this.ziel()?.faehigkeiten.direktesSpeichern ?? false);
  readonly diensttagLabel = computed(() => diensttagName(this.diensttagService.wochentag()));
  readonly verfuegbareJahre = this.workbook.verfuegbareJahre;
  readonly naechstesJahr = computed(
    () => Math.max(this.store.jahr(), ...this.verfuegbareJahre()) + 1,
  );

  /** Vollständiges Wochenraster: jede Kalenderwoche mit allen 7 Tagen. */
  readonly wochen = computed<WochenZeile[]>(() =>
    baueWochenraster(
      this.store.jahr(),
      this.store.termine(),
      this.feiertage.feiertage(),
      this.diensttagService.wochentag(),
    ),
  );

  /**
   * Diensttage im Plan-Jahr. Das Wochenraster zeigt an den Rändern auch ein paar
   * Tage des Nachbarjahres (vollständige Wochenzeilen) – die zählen hier nicht
   * mit, sonst käme z. B. ein Jahr mit 52 Montagen fälschlich auf 53.
   */
  readonly diensttagSlots = computed<PlanSlot[]>(() =>
    this.wochen()
      .flatMap((w) => w.tage)
      .filter((s) => s.istDiensttag && s.imJahr),
  );
  readonly luecken = computed(() => this.diensttagSlots().filter((s) => s.luecke));
  readonly belegteDiensttage = computed(() => this.diensttagSlots().length - this.luecken().length);

  /**
   * HiOrg-Termine neben den Plan-Terminen desselben Tages. Rein abgeleitet – die
   * Excel-Mappe bleibt unberührt, der Feed wird nirgends hineingeschrieben.
   */
  readonly hiorgAbgleich = computed(() =>
    baueHiorgAbgleich(this.hiorg.eintraege(), this.store.termine(), this.store.jahr()),
  );

  readonly sichtbareWochen = computed<WochenZeile[]>(() => {
    const suche = this.suche().trim().toLowerCase();
    const nurLuecken = this.nurLuecken();
    const nurAbweichungen = this.nurAbweichungen();
    const abgleich = this.hiorgAbgleich();
    // Eine Suche greift bewusst über das ganze Jahr: sonst blieben Treffer in
    // anderen Monaten unsichtbar, ohne dass das erkennbar wäre.
    const monat = suche ? null : this.monat();
    return this.wochen().filter((woche) => {
      if (monat !== null && !woche.tage.some((t) => t.imJahr && monatIndex(t.datum) === monat)) {
        return false;
      }
      if (nurLuecken && woche.luecken === 0) {
        return false;
      }
      if (
        nurAbweichungen &&
        !woche.tage.some((slot) => abgleich.tageMitAbweichung.has(slot.datum))
      ) {
        return false;
      }
      if (!suche) {
        return true;
      }
      return woche.tage.some(
        (slot) =>
          slot.termine.some(({ termin: t }) =>
            [t.thema, t.hinweis, t.ausbilder, t.katsTitel, t.kategorie]
              .join(' ')
              .toLowerCase()
              .includes(suche),
          ) ||
          // Die HiOrg-Ebene ist immer eingeblendet und muss darum auch auffindbar sein.
          (abgleich.nachDatum.get(slot.datum)?.eintraege ?? []).some((e) =>
            e.name.toLowerCase().includes(suche),
          ),
      );
    });
  });

  constructor() {
    // Die Feiertage hängen am Jahr des Plans und am gewählten Bundesland.
    effect(() => {
      this.feiertage.bundesland();
      void this.feiertage.lade(this.store.jahr());
    });

    // Beim Wechsel des Jahresblatts den Monat mitführen: im laufenden Jahr der
    // laufende Monat, sonst der Januar – nie ein leerer Ausschnitt.
    effect(() => {
      const jahr = this.store.jahr();
      untracked(() => {
        if (this.monat() !== null) {
          this.monat.set(jahr === jahrVon(this.heute) ? monatIndex(this.heute) : 0);
        }
      });
    });

    // Der Feed ist jahresunabhängig; er wird immer geladen, sobald die Ansicht entsteht.
    void this.hiorg.lade();
  }

  /** HiOrg-Einträge dieses Tages, `null` ohne Treffer. */
  hiorgTag(datum: string): HiorgTagesAbgleich | null {
    return this.hiorgAbgleich().nachDatum.get(datum) ?? null;
  }

  abweichungenFuer(tag: HiorgTagesAbgleich, eintrag: HiorgEintrag): HiorgAbweichung[] {
    return tag.abweichungen.filter((a) => a.hiorg.schluessel === eintrag.schluessel);
  }

  istOhneGegenstueck(tag: HiorgTagesAbgleich, eintrag: HiorgEintrag): boolean {
    return tag.ohneGegenstueck.some((e) => e.schluessel === eintrag.schluessel);
  }

  /** HiOrg-Eintrag, dessen Name exakt zu diesem Termin passt – `null` ohne Treffer. */
  hiorgTreffer(terminId: string): HiorgEintrag | null {
    return this.hiorgAbgleich().terminNachId.get(terminId) ?? null;
  }

  async hiorgNeuLaden(): Promise<void> {
    await this.hiorg.lade(true);
    this.melde(
      this.hiorg.zustand() === 'geladen'
        ? `${this.hiorg.eintraege().length} HiOrg-Termine geladen.`
        : this.hiorg.fehler() || 'Der HiOrg-Kalenderfeed ist noch nicht eingerichtet.',
      6000,
      this.hiorg.zustand() === 'fehler',
    );
  }

  /**
   * Werkzeug (a): Das Thema im Jahresdienstplan auf die HiOrg-Bezeichnung setzen.
   * Läuft über `aktualisiereTermin`, ist damit rückgängig zu machen und markiert
   * die Mappe als ungespeichert.
   */
  async uebernimmHiorgNamen(abweichung: HiorgAbweichung): Promise<void> {
    const stand = this.store.dokument();
    if (
      abweichung.terminThema.trim() &&
      !(await this.dialogDienst.bestaetigen(
        `Das Thema „${abweichung.terminThema}“ wird durch „${abweichung.hiorg.name}“ ersetzt.`,
        'Namen aus HiOrg übernehmen',
        'Übernehmen',
      ))
    ) {
      return;
    }
    if (this.store.dokument() !== stand) {
      await this.dialogDienst.hinweis(
        'Der Ausbildungsplan wurde inzwischen geändert. Bitte prüfe den aktuellen Stand.',
      );
      return;
    }
    this.store.aktualisiereTermin(abweichung.terminId, { thema: abweichung.hiorg.name });
    this.melde('Thema aus HiOrg übernommen – rückgängig mit Strg+Z.');
  }

  /** Werkzeug (c): Aus einem HiOrg-Termin ohne Gegenstück einen Plantermin machen. */
  legeTerminAusHiorgAn(eintrag: HiorgEintrag): void {
    const terminId = this.store.fuegeTerminEin({
      ...leererTermin(eintrag.beginn),
      datumBis: istMehrtaegig(eintrag) ? eintrag.ende : null,
      beginnZeit: eintrag.beginnZeit,
      endeZeit: eintrag.endeZeit,
      typ: eintrag.art,
      thema: eintrag.name,
    });
    this.melde(`„${kurz(eintrag.name)}“ als Termin übernommen – bitte fachlich ergänzen.`);
    this.oeffneDialog({ terminId });
  }

  katsThema(termin: Termin) {
    return termin.katsThemaId
      ? (this.store.katsThemaNachId().get(termin.katsThemaId) ?? null)
      : null;
  }

  setzeBundesland(land: BundeslandCode): void {
    this.feiertage.setzeBundesland(land);
  }

  /** Wechselt den Diensttag und ergänzt sofort dessen fehlende Zeilen im Store. */
  setzeDiensttag(wochentag: Wochentag): void {
    this.diensttagService.setze(wochentag);
    const ergaenzt = this.store.ergaenzeFehlendeDiensttage(wochentag);
    if (ergaenzt) {
      this.melde(`${ergaenzt} fehlende(r) ${diensttagName(wochentag)} als Zeilen ergänzt.`);
    }
  }

  /** Volles Datum als Klartext – für Tooltips und Beschriftungen im Raster. */
  formatiereDatumText(iso: string): string {
    return formatiereDatum(iso);
  }

  /** Kurzes Datum ohne Jahr, für die Wochenkopfzeile (z. B. „05.01.“). */
  formatKurz(iso: string): string {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  }

  waehleMonat(monat: number | null): void {
    this.monat.set(monat);
  }

  verschiebeMonat(schritt: number): void {
    const monat = this.monat();
    if (monat === null) {
      return;
    }
    this.monat.set(Math.min(11, Math.max(0, monat + schritt)));
  }

  /** Zurück zum laufenden Monat – bei Bedarf samt Wechsel ins laufende Jahr. */
  zumAktuellenMonat(): void {
    const jahr = jahrVon(this.heute);
    if (this.store.jahr() !== jahr && this.verfuegbareJahre().includes(jahr)) {
      this.workbook.waehleJahr(jahr);
    }
    this.monat.set(monatIndex(this.heute));
  }

  monatsName(woche: WochenZeile): string {
    const ersterTagImJahr = woche.tage.find((t) => t.imJahr)?.datum ?? woche.start;
    return MONATSNAMEN[monatIndex(ersterTagImJahr)];
  }

  istMonatswechsel(index: number): boolean {
    const wochen = this.sichtbareWochen();
    return index === 0 || this.monatsName(wochen[index]) !== this.monatsName(wochen[index - 1]);
  }

  // ------------------------------------------------------------ Drag & Drop

  /**
   * Ablage auf einem Termin. Aus dem Plan gezogene Termine tauschen ihr Datum,
   * aus den Ideen gezogene Einträge übernehmen den Platz (der bisherige Termin
   * wandert dafür in die Ideen).
   */
  aufTerminAbgelegt(event: CdkDragDrop<unknown>, ziel: Termin): void {
    const gezogen = event.item.data as Termin;
    if (gezogen.id === ziel.id) {
      return;
    }
    if (gezogen.datum === null) {
      this.store.ausBacklogAufTermin(gezogen.id, ziel.id);
      this.melde(`„${kurz(gezogen.thema)}“ auf ${formatiereDatum(ziel.datum!)} eingeplant.`);
    } else {
      this.store.tauscheDatum(gezogen.id, ziel.id);
    }
  }

  /** Ablage auf einem Tag ohne Eintrag – der Zug belegt das Datum einfach. */
  aufLeeremTagAbgelegt(event: CdkDragDrop<unknown>, datum: string): void {
    const gezogen = event.item.data as Termin;
    if (gezogen.datum === null) {
      this.store.ausBacklogAufDatum(gezogen.id, datum);
    } else {
      this.store.verschiebeAufDatum(gezogen.id, datum);
    }
    this.melde(`„${kurz(gezogen.thema)}“ auf ${formatiereDatum(datum)} gelegt.`);
  }

  // ----------------------------------------------------------------- Termine

  neuerTermin(): void {
    this.dialog
      .open(DatumDialog, {
        data: { titel: 'Neuer Termin', vorgabe: heuteIso() } satisfies DatumDialogDaten,
      })
      .afterClosed()
      .subscribe((datum?: string) => {
        if (datum) {
          this.terminAnlegen(datum);
        }
      });
  }

  terminAnlegen(datum: string): void {
    this.oeffneDialog({ datum });
  }

  bearbeiten(id: string): void {
    this.oeffneDialog({ terminId: id });
  }

  private oeffneDialog(daten: TerminDialogDaten): void {
    this.dialog.open(TerminDialog, { data: daten, width: '760px', maxWidth: '94vw' });
  }

  zuBacklog(termin: Termin): void {
    this.store.zuBacklog(termin.id);
    this.melde(`„${kurz(termin.thema || termin.hinweis)}“ in die offenen Ideen verschoben.`);
  }

  loeschen(id: string): void {
    this.store.loescheTermin(id);
  }

  // --------------------------------------------------------------- Persistenz

  oeffnen(): void {
    this.dialog
      .open(QuelleDialog, { width: '600px', maxWidth: '94vw' })
      .afterClosed()
      .subscribe(async (storage?: WorkbookStorage) => {
        if (!storage) {
          return;
        }
        try {
          const { meldungen } = await this.workbook.laden(storage);
          const luecken = this.luecken().length;
          const hinweis = luecken
            ? ` ${luecken} ${this.diensttagLabel()}(e) ohne Ausbildung sind rot markiert.`
            : ` Alle ${this.diensttagLabel()}e sind belegt.`;
          this.melde((meldungen.join(' ') || 'Arbeitsmappe geladen.') + hinweis, 9000);
        } catch (ursache) {
          this.melde(fehlertext(ursache), 10000, true);
        }
      });
  }

  async neuerPlan(): Promise<void> {
    const stand = this.store.dokument();
    if (
      this.store.ungespeichert() &&
      !(await this.dialogDienst.bestaetigen(
        'Ungespeicherte Änderungen verwerfen?',
        'Neuen Ausbildungsplan beginnen',
        'Verwerfen',
      ))
    )
      return;
    if (this.store.dokument() !== stand) {
      await this.dialogDienst.hinweis(
        'Der Ausbildungsplan wurde inzwischen geändert. Bitte prüfe den aktuellen Stand.',
      );
      return;
    }
    this.workbook.neuesDokument(leeresDocument());
  }

  /** Wechselt innerhalb der geöffneten Arbeitsmappe zu einem bereits vorhandenen Jahresblatt. */
  waehleJahr(jahr: number): void {
    this.workbook.waehleJahr(jahr);
  }

  /** Legt in der geöffneten Arbeitsmappe ein neues Jahresblatt an und wechselt dorthin. */
  neuesJahr(): void {
    const jahr = this.naechstesJahr();
    this.workbook.neuesJahr(jahr);
    this.melde(`Neues Jahresblatt ${jahr} angelegt.`);
  }

  async speichern(): Promise<void> {
    if (!this.kannSpeichern()) {
      await this.herunterladen();
      return;
    }
    try {
      await this.workbook.speichern();
      this.melde(
        this.store.ungespeichert()
          ? 'Übertragener Stand gespeichert; weitere Änderungen sind noch ungespeichert.'
          : this.direktesSpeichern()
            ? 'Gespeichert.'
            : 'Arbeitsmappe heruntergeladen – bitte am Ablageort ersetzen.',
      );
    } catch (ursache) {
      this.melde(fehlertext(ursache), 10000, true);
    }
  }

  async herunterladen(): Promise<void> {
    const { daten, dateiname, stand } = await this.workbook.exportieren();
    herunterladen(daten, dateiname);
    this.store.alsGespeichertMarkieren(stand);
  }

  async neuLaden(): Promise<void> {
    const stand = this.store.dokument();
    if (
      this.store.ungespeichert() &&
      !(await this.dialogDienst.bestaetigen(
        'Ungespeicherte Änderungen verwerfen?',
        'Ausbildungsplan neu laden',
        'Neu laden',
      ))
    )
      return;
    if (this.store.dokument() !== stand) {
      await this.dialogDienst.hinweis(
        'Der Ausbildungsplan wurde inzwischen geändert. Bitte prüfe den aktuellen Stand.',
      );
      return;
    }
    try {
      const { meldungen } = await this.workbook.neuLaden();
      this.melde(meldungen.length ? meldungen.join(' ') : 'Neu geladen.');
    } catch (ursache) {
      this.melde(fehlertext(ursache), 10000, true);
    }
  }

  // --------------------------------------------------------------- Sonstiges

  tastendruck(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    const taste = event.key.toLowerCase();
    if (taste === 's') {
      event.preventDefault();
      void this.speichern();
    } else if (taste === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.store.rueckgaengig();
    } else if ((taste === 'z' && event.shiftKey) || taste === 'y') {
      event.preventDefault();
      this.store.wiederholen();
    }
  }

  vorVerlassen(event: BeforeUnloadEvent): void {
    if (this.store.ungespeichert()) {
      event.preventDefault();
    }
  }

  private melde(text: string, dauer = 5000, fehler = false): void {
    this.snackBar.open(text, 'OK', {
      duration: dauer,
      panelClass: fehler ? 'fehler-snack' : undefined,
    });
  }
}

function kurz(text: string): string {
  const einzeilig = text.replace(/\s+/g, ' ').trim();
  return einzeilig.length > 42 ? `${einzeilig.slice(0, 40)}…` : einzeilig || 'Eintrag';
}

function fehlertext(ursache: unknown): string {
  return ursache instanceof Error ? ursache.message : String(ursache);
}
