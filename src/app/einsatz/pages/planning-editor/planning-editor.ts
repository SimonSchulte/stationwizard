import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { erzeugeTaktischesZeichen } from 'taktische-zeichen-core';
import { MatDialog } from '@angular/material/dialog';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MatchService, MEDIZINISCH_LABEL, TAKTISCH_LABEL } from '../../services/match.service';
import { planungIst, planungSoll, postenIst, postenSoll } from '../../services/staerke';
import type { DragData, DropData } from '../../models/drag-drop.model';
import { PositionZeile } from '../../components/position-zeile/position-zeile';
import { QualifikationsChips } from '../../components/qualifikations-chips/qualifikations-chips';
import { StaerkeBlock } from '../../components/staerke-block/staerke-block';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { lokalesDatumZuZeit, zeitZuLokalesDatum } from '../../../kern/kalender/datum';
import { DragDropModule, CdkDragDrop, CdkDragStart } from '@angular/cdk/drag-drop';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PepEditorKontext } from '../../services/pep-editor-kontext';
import { PepEditorSpeichernDienst, SpeicherErgebnis } from '../../services/pep-editor-speichern';
import { EinsatzZuordnenDialog } from '../../components/einsatz-zuordnen-dialog/einsatz-zuordnen-dialog';
import { EinsatzListenEintrag } from '../../models/einsatz.model';
import { SaveLoadService } from '../../services/save-load.service';
import { PdfAusgabeWeg } from '../../../kern/pdf/pdf-ausgabe';
import { PdfExportService } from '../../services/pdf-export.service';
import {
  Einsatzkraft,
  Fahrzeug,
  FahrzeugRef,
  Planung,
  Posten,
  Position,
  Taktisch,
  Medizinisch,
  TAKTISCH_ORDER,
  MEDIZINISCH_ORDER,
} from '../../models/planung.model';
import { FahrzeugeQuelleService } from '../../services/fahrzeuge-quelle.service';
import { ImportDialog } from '../../components/import-dialog/import-dialog';
import { HiorgPersonalDialog } from '../../components/hiorg-personal-dialog/hiorg-personal-dialog';
import { Meldung, MeldungsDienst } from '../../../kern/zustand/zustand';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-planning-editor',
  imports: [
    Meldung,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatToolbarModule,
    MatExpansionModule,
    MatDividerModule,
    MatTooltipModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTimepickerModule,
    DragDropModule,
    MatMenuModule,
    PositionZeile,
    QualifikationsChips,
    StaerkeBlock,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'de-DE' }],
  templateUrl: './planning-editor.html',
  styleUrl: './planning-editor.less',
})
export class PlanningEditor implements OnDestroy {
  private readonly store = inject(PlanungStoreService);
  private readonly router = inject(Router);
  private readonly saveLoad = inject(SaveLoadService);
  private readonly route = inject(ActivatedRoute);
  private readonly kontext = inject(PepEditorKontext);
  private readonly speichernDienst = inject(PepEditorSpeichernDienst);
  private readonly meldungen = inject(MeldungsDienst);

  /** Modus aus den Routendaten: `vorlage` bearbeitet eine PEP-Vorlage (ohne Einsatzkräfte). */
  readonly istVorlage = this.route.snapshot.data['modus'] === 'vorlage';
  /** Der Einsatz, zu dem die geöffnete PEP gehört; `null` bei Datei oder Vorlage. */
  readonly einsatzZiel = computed(() => {
    const ziel = this.kontext.ziel();
    return ziel?.art === 'einsatz' ? ziel.einsatz : null;
  });
  readonly speichert = signal(false);
  readonly speicherFehler = signal('');
  /** Der letzte Speicherversuch scheiterte an einem neueren Stand in der Datenbank (412). */
  readonly konflikt = signal(false);
  readonly hatUngesichertes = this.store.hatUngesichertes;
  private readonly dialog = inject(MatDialog);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly abgleich = inject(MatchService);
  private readonly fahrzeugeQuelle = inject(FahrzeugeQuelleService);
  private readonly pdfExport = inject(PdfExportService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly postenfuehrerIconUrl: SafeUrl = this.sanitizer.bypassSecurityTrustUrl(
    erzeugeTaktischesZeichen({ grundzeichen: 'person', funktion: 'fuehrungskraft' }).dataUrl,
  );

  constructor() {
    if (this.istVorlage) void this.vorlageStarten();
    // Einmal beim Öffnen laden, nicht aus dem Template: dort schriebe das Laden während des
    // Renderns in ein Signal (NG0600).
    this.fahrzeugeQuelle.sicherstellenGeladen();
  }

  readonly planung = this.store.active;
  readonly canUndo = this.store.canUndo;
  /** Titel und Zeitraum gehören dem Einsatz und sind im Editor nicht änderbar. */
  readonly kopfGesperrt = computed(() => this.einsatzZiel() !== null);

  toggleAssignedList(): void {
    this.assignedListCollapsed.update((v) => !v);
  }

  readonly TAKTISCH_LABEL = TAKTISCH_LABEL;

  readonly MEDIZINISCH_LABEL = MEDIZINISCH_LABEL;

  /** null = not focused (show stored vehicle); string = focused/typing */
  readonly fahrzeugFilter = signal<Record<string, string | null>>({});

  filteredFahrzeuge(postenId: string): Fahrzeug[] {
    const fahrzeuge = this.fahrzeugeQuelle.fahrzeuge();
    const q = (this.fahrzeugFilter()[postenId] ?? '').toLowerCase();
    if (!q) return fahrzeuge;
    return fahrzeuge.filter(
      (f) => f.funkruf.toLowerCase().includes(q) || f.seriennummer.toLowerCase().includes(q),
    );
  }

  fahrzeugInputValue(posten: Posten): string {
    const filter = this.fahrzeugFilter()[posten.id];
    if (filter === null || filter === undefined) return posten.fahrzeug?.funkruf ?? '';
    return filter;
  }

  updateFahrzeugFilter(postenId: string, value: string | null): void {
    this.fahrzeugFilter.update((m) => ({ ...m, [postenId]: value }));
  }

  onFahrzeugSelected(postenId: string, value: Fahrzeug | null): void {
    if (value === null) {
      this.store.setPostenFahrzeug(postenId, null);
    } else {
      const ref: FahrzeugRef = {
        seriennummer: value.seriennummer,
        funkruf: value.funkruf,
        hiorgId: value.hiorgId,
      };
      this.store.setPostenFahrzeug(postenId, ref);
    }
    this.fahrzeugFilter.update((m) => ({ ...m, [postenId]: null }));
  }

  readonly contextMenuEk = signal<Einsatzkraft | null>(null);
  readonly contextMenuPos = signal({ x: 0, y: 0 });
  @ViewChild('contextMenuTrigger') contextMenuTrigger!: MatMenuTrigger;

  onContextMenu(event: MouseEvent, ek: Einsatzkraft): void {
    event.preventDefault();
    this.contextMenuEk.set(ek);
    this.contextMenuPos.set({ x: event.clientX, y: event.clientY });
    this.contextMenuTrigger.openMenu();
  }

  assignFromContextMenu(postenId: string, positionId: string): void {
    const ek = this.contextMenuEk();
    if (!ek) return;
    this.store.assignToPosition(postenId, positionId, ek.id);
  }

  readonly positionContextMenuTarget = signal<{ postenId: string; positionId: string } | null>(
    null,
  );
  readonly positionContextMenuCoords = signal({ x: 0, y: 0 });
  readonly positionMenuSearch = signal('');
  @ViewChild('positionContextMenuTrigger') positionContextMenuTrigger!: MatMenuTrigger;

  readonly allEksFiltered = computed(() => {
    const p = this.planung();
    if (!p) return [];
    const q = this.positionMenuSearch().toLowerCase();
    if (!q) return p.einsatzkraefte;
    return p.einsatzkraefte.filter((e) => e.name.toLowerCase().includes(q));
  });

  onPositionContextMenu(event: MouseEvent, postenId: string, positionId: string): void {
    event.preventDefault();
    this.positionContextMenuTarget.set({ postenId, positionId });
    this.positionContextMenuCoords.set({ x: event.clientX, y: event.clientY });
    this.positionMenuSearch.set('');
    this.positionContextMenuTrigger.openMenu();
  }

  assignFromPositionMenu(ekId: string): void {
    const target = this.positionContextMenuTarget();
    if (!target) return;
    this.store.moveEinsatzkraftToPosition(ekId, target.postenId, target.positionId);
  }

  readonly rosterCollapsed = signal(false);
  toggleRoster(): void {
    this.rosterCollapsed.update((v) => !v);
  }

  freePositions(posten: Posten): Position[] {
    return posten.positions.filter((p) => !p.assigned);
  }

  readonly draggingEinsatzkraft = signal<Einsatzkraft | null>(null);
  readonly assignedListCollapsed = signal(true);
  readonly rosterProgress = computed(() => {
    const p = this.planung();
    if (!p) return null;
    const total = p.einsatzkraefte.length;
    const assigned = total - this.unassignedRoster(p).length;
    const soll = p.posten.reduce((acc, po) => acc + po.positions.length, 0);
    return { assigned, total, soll };
  });
  readonly rosterSearch = signal('');
  readonly rosterTagFilter = signal<string | null>(null);
  readonly rosterAvailableTags = computed(() => {
    const p = this.planung();
    if (!p) return { taktisch: [] as Taktisch[], medizinisch: [] as Medizinisch[] };
    const tSet = new Set<Taktisch>();
    const mSet = new Set<Medizinisch>();
    for (const ek of p.einsatzkraefte) {
      (ek.tags.taktisch ?? []).forEach((t) => tSet.add(t));
      (ek.tags.medizinisch ?? []).forEach((t) => mSet.add(t));
    }
    return {
      taktisch: TAKTISCH_ORDER.filter((t) => tSet.has(t)),
      medizinisch: MEDIZINISCH_ORDER.filter((t) => mSet.has(t)),
    };
  });

  toggleRosterTagFilter(tag: string): void {
    this.rosterTagFilter.update((c) => (c === tag ? null : tag));
  }

  readonly filteredRoster = computed(() => {
    const p = this.planung();
    if (!p) return [];
    const base = this.unassignedRoster(p);
    const q = this.rosterSearch().toLowerCase();
    const tag = this.rosterTagFilter();
    return base.filter((e) => {
      const matchesName = !q || e.name.toLowerCase().includes(q);
      const matchesTag =
        !tag ||
        (e.tags.taktisch ?? []).includes(tag as Taktisch) ||
        (e.tags.medizinisch ?? []).includes(tag as Medizinisch) ||
        (e.tags.zusatz ?? []).includes(tag);
      return matchesName && matchesTag;
    });
  });

  onDragStarted(event: CdkDragStart<DragData>): void {
    const id = event.source.data.einsatzkraftId;
    const p = this.planung();
    this.draggingEinsatzkraft.set(p?.einsatzkraefte.find((e) => e.id === id) ?? null);
  }

  onDragEnded(): void {
    this.draggingEinsatzkraft.set(null);
  }

  onDropToPosition(event: CdkDragDrop<DropData, DragData>): void {
    const drag = event.item.data as DragData;
    const drop = event.container.data;
    const p = this.planung();
    if (!p) return;

    // Read current occupant of the target position before assigning
    const targetPosten = p.posten.find((po) => po.id === drop.postenId);
    const targetPosition = targetPosten?.positions.find((pos) => pos.id === drop.positionId);
    const displaced = targetPosition?.assigned ?? null;

    this.store.assignToPosition(drop.postenId, drop.positionId, drag.einsatzkraftId);

    if (drag.fromPostenId && drag.fromPositionId) {
      if (displaced) {
        // Swap: assign displaced person to source position
        this.store.assignToPosition(drag.fromPostenId, drag.fromPositionId, displaced.id);
      } else {
        // Simple move: unassign source
        this.store.unassignFromPosition(drag.fromPostenId, drag.fromPositionId);
      }
    }
  }

  onDropToRoster(event: CdkDragDrop<null, DragData>): void {
    const drag = event.item.data as DragData;
    if (drag.fromPostenId && drag.fromPositionId) {
      this.store.unassignFromPosition(drag.fromPostenId, drag.fromPositionId);
    }
  }

  async importTemplate(): Promise<void> {
    const ziel = this.planung();
    const zielId = ziel?.id;
    const result = await this.saveLoad.load();
    if (!result || this.planung()?.id !== zielId) return;
    if (
      result.versionWarning &&
      !(await this.dialogDienst.bestaetigen(
        'Versionswarnung: Die Vorlage wurde mit einer anderen Dateiversion gespeichert. Trotzdem importieren?',
      ))
    )
      return;
    if (this.planung()?.id !== zielId) return;
    if (this.planung() !== ziel) {
      await this.dialogDienst.hinweis(
        'Die Planung wurde inzwischen geändert. Bitte prüfe den aktuellen Stand vor dem Vorlagenimport.',
      );
      return;
    }
    this.store.applyTemplate(result.planung);
  }

  async exportPdf(weg: PdfAusgabeWeg = 'drucken'): Promise<void> {
    const p = this.planung();
    if (!p) return;
    await this.pdfExport.exportieren(p, weg);
  }

  /**
   * Speichert in die Datenbank: PEP des Einsatzes bzw. Vorlage; eine Datei ohne Einsatz wird
   * zuerst einem Einsatz zugeordnet. Der lokale Stand bleibt bei jedem Fehler erhalten.
   */
  async speichern(): Promise<void> {
    const planung = this.planung();
    if (!planung || this.speichert()) return;
    this.speicherFehler.set('');
    this.konflikt.set(false);
    if (this.kontext.ziel() === null) {
      await this.zuordnen(planung);
      return;
    }
    this.speichert.set(true);
    try {
      const ergebnis = await this.speichernDienst.speichern(planung);
      if (!this.ergebnisAuswerten(ergebnis, 'Gespeichert.')) return;
      if (this.istVorlage && this.route.snapshot.paramMap.get('id') === 'neu') {
        await this.router.navigate(['/einsatzplanung/pep-vorlagen', planung.id], {
          replaceUrl: true,
        });
      }
    } finally {
      this.speichert.set(false);
    }
  }

  /** Dialog „Einem Einsatz zuordnen“ für eine Planung ohne Einsatz, dann Anlegen als PEP. */
  private async zuordnen(planung: Planung): Promise<void> {
    const einsatz = await firstValueFrom(
      this.dialog
        .open<EinsatzZuordnenDialog, void, EinsatzListenEintrag>(EinsatzZuordnenDialog, {
          width: '560px',
          maxWidth: '94vw',
        })
        .afterClosed(),
      { defaultValue: undefined },
    );
    if (!einsatz) return;
    this.speichert.set(true);
    try {
      const ergebnis = await this.speichernDienst.zuordnen(planung, einsatz);
      this.ergebnisAuswerten(ergebnis, `Als PEP des Einsatzes „${einsatz.titel}“ gespeichert.`);
    } finally {
      this.speichert.set(false);
    }
  }

  /** Nach einem Konflikt: den gespeicherten Stand laden, nachdem der lokale gesichert wurde. */
  async neuLaden(): Promise<void> {
    if (this.speichert()) return;
    const planung = this.planung();
    if (
      !(await this.dialogDienst.bestaetigen(
        'Der gespeicherte Stand wird geladen und ersetzt deine Änderungen in diesem Editor. Sie werden vorher als JSON-Datei heruntergeladen, damit du sie zusammenführen kannst.',
        'Gespeicherten Stand laden',
        'Herunterladen und neu laden',
      ))
    )
      return;
    if (planung) this.saveLoad.save(planung);
    this.speichert.set(true);
    try {
      const ergebnis = await this.speichernDienst.neuLaden();
      this.ergebnisAuswerten(ergebnis, 'Der gespeicherte Stand wurde geladen.');
    } finally {
      this.speichert.set(false);
    }
  }

  /** Legt den aktuellen Plan (Posten, Positionen, Beschreibung) als neue PEP-Vorlage ab. */
  async alsVorlageSpeichern(): Promise<void> {
    const planung = this.planung();
    if (!planung) return;
    const titel = await this.dialogDienst.eingabe(
      'Posten und Positionen werden als Vorlage gespeichert, Einsatzkräfte und Zuteilungen nicht.',
      'Als Vorlage speichern',
      'Titel der Vorlage',
      { wert: planung.name, bestaetigenLabel: 'Speichern', maxLaenge: 200 },
    );
    if (titel === null) return;
    const ergebnis = await this.speichernDienst.alsVorlageSpeichern(titel, planung);
    if (ergebnis.id === null) {
      this.meldungen.fehler(ergebnis.fehler || 'Die Vorlage konnte nicht gespeichert werden.');
      return;
    }
    this.meldungen.erfolg(
      `Vorlage „${titel.trim()}“ gespeichert. Du findest sie in der Verwaltung unter „Einsatz-Vorlagen“.`,
    );
  }

  private ergebnisAuswerten(ergebnis: SpeicherErgebnis, erfolg: string): boolean {
    if (ergebnis.ok) {
      this.speicherFehler.set('');
      this.konflikt.set(false);
      this.meldungen.erfolg(erfolg);
      return true;
    }
    this.konflikt.set(ergebnis.konflikt);
    this.speicherFehler.set(ergebnis.fehler || 'Das Speichern ist fehlgeschlagen.');
    return false;
  }

  private async vorlageStarten(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null || id === 'neu') {
      this.speichernDienst.neueVorlage();
      return;
    }
    const ergebnis = await this.speichernDienst.vorlageOeffnen(id);
    if (!ergebnis.ok) this.speicherFehler.set(ergebnis.fehler);
  }

  ngOnDestroy(): void {
    this.speichernDienst.verlassen();
  }

  save(): void {
    const p = this.planung();
    if (!p) return;
    this.saveLoad.save(p);
  }

  openImportDialog(): void {
    this.dialog.open(ImportDialog, { width: '560px' });
  }

  openHiorgPersonalDialog(): void {
    this.dialog.open(HiorgPersonalDialog, { width: '560px' });
  }

  /** Zurück zur Einsatzübersicht bzw. zur Vorlagenverwaltung; der Schutz fragt bei Ungespeichertem. */
  goBack(): void {
    void this.router.navigate([
      this.istVorlage ? '/verwaltung/einsatz-vorlagen' : '/einsatzplanung',
    ]);
  }

  updateBeschreibung(value: string): void {
    const p = this.planung();
    if (!p) return;
    this.store.updateActive({ ...p, beschreibung: value || null });
  }

  setEinsatzleiter(id: string | null): void {
    const p = this.planung();
    if (!p) return;
    const ref = id ? (p.einsatzkraefte.find((e) => e.id === id) ?? null) : null;
    const einsatzleiter = ref ? { id: ref.id, name: ref.name } : null;
    this.store.updateActive({ ...p, einsatzleiter });
  }

  addPosten(): void {
    this.store.addPosten();
  }

  async deletePosten(posten: Posten): Promise<void> {
    const zielId = this.planung()?.id;
    const stand = JSON.stringify(posten);
    if (
      !(await this.dialogDienst.bestaetigen(
        `Posten „${posten.label}“ und alle seine Zuteilungen löschen? Du kannst die Aktion anschließend rückgängig machen.`,
        'Posten löschen',
        'Löschen',
      ))
    )
      return;
    if (this.planung()?.id !== zielId) return;
    const aktuell = this.planung()?.posten.find((eintrag) => eintrag.id === posten.id);
    if (JSON.stringify(aktuell) !== stand) {
      await this.dialogDienst.hinweis(
        'Der Posten wurde inzwischen geändert. Bitte prüfe ihn und starte die Aktion erneut.',
      );
      return;
    }
    this.store.deletePosten(posten.id);
  }

  async clearPosten(posten: Posten): Promise<void> {
    const zielId = this.planung()?.id;
    const stand = JSON.stringify(posten);
    const namen = posten.positions
      .filter((position) => position.assigned !== null)
      .map((position) => position.assigned!.name)
      .join(', ');
    const nachricht = namen
      ? `Alle Zuteilungen in „${posten.label}“ aufheben?\nBetroffen: ${namen}`
      : `Alle Zuteilungen in „${posten.label}“ aufheben?`;
    if (!(await this.dialogDienst.bestaetigen(nachricht, 'Posten leeren', 'Leeren'))) return;
    if (this.planung()?.id !== zielId) return;
    const aktuell = this.planung()?.posten.find((eintrag) => eintrag.id === posten.id);
    if (JSON.stringify(aktuell) !== stand) {
      await this.dialogDienst.hinweis(
        'Die Zuteilungen wurden inzwischen geändert. Bitte prüfe sie und starte die Aktion erneut.',
      );
      return;
    }
    this.store.clearPosten(posten.id);
  }

  assignedCount(posten: Posten): number {
    return posten.positions.filter((p) => p.assigned !== null).length;
  }

  taktischColor(tag: Taktisch): { bg: string; fg: string } {
    return this.abgleich.taktischColor(tag);
  }

  medizinischColor(tag: Medizinisch): { bg: string; fg: string } {
    return this.abgleich.medizinischColor(tag);
  }

  unassignFromPosition(postenId: string, positionId: string): void {
    this.store.unassignFromPosition(postenId, positionId);
  }

  assignedPerson(position: Position): Einsatzkraft | null {
    if (!position.assigned || !this.planung()) return null;
    return this.planung()!.einsatzkraefte.find((e) => e.id === position.assigned!.id) ?? null;
  }

  protected readonly postenSoll = postenSoll;
  protected readonly postenIst = postenIst;
  protected readonly planungSoll = planungSoll;
  protected readonly planungIst = planungIst;

  unassignedRoster(planung: Planung): Einsatzkraft[] {
    const assignedIds = new Set(
      planung.posten.flatMap((p) => p.positions.map((pos) => pos.assigned?.id)).filter(Boolean),
    );
    return planung.einsatzkraefte.filter((e) => !assignedIds.has(e.id));
  }

  updateName(value: string): void {
    const p = this.planung();
    if (!p) return;
    this.store.updateActive({ ...p, name: value });
  }

  updateStart(value: string): void {
    const p = this.planung();
    if (!p) return;
    const iso = value ? new Date(value).toISOString() : p.start;
    this.store.updateActive({ ...p, start: iso });
  }

  updateEnd(value: string): void {
    const p = this.planung();
    if (!p) return;
    const iso = value ? new Date(value).toISOString() : p.end;
    this.store.updateActive({ ...p, end: iso });
  }

  toDatetimeLocal(iso: string): string {
    return iso ? iso.slice(0, 16) : '';
  }

  /** Stabile `Date`-Referenzen für den Timepicker (nur bei geänderter Uhrzeit neu). */
  readonly startZeitWert = computed(
    () => zeitZuLokalesDatum(this.getTimeFromIso(this.planung()?.start ?? '')),
    { equal: (a, b) => a?.getTime() === b?.getTime() },
  );
  readonly endZeitWert = computed(
    () => zeitZuLokalesDatum(this.getTimeFromIso(this.planung()?.end ?? '')),
    { equal: (a, b) => a?.getTime() === b?.getTime() },
  );

  getDateFromIso(iso: string): Date | null {
    return iso ? new Date(iso) : null;
  }

  getTimeFromIso(iso: string): string {
    if (!iso) return '00:00';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  private buildIso(existingIso: string, date: Date | null, time: string): string {
    const base = date ?? (existingIso ? new Date(existingIso) : new Date());
    const [h, m] = time ? time.split(':').map(Number) : [0, 0];
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  updateStartDate(event: MatDatepickerInputEvent<Date>): void {
    const p = this.planung();
    if (!p || !event.value) return;
    const iso = this.buildIso(p.start, event.value, this.getTimeFromIso(p.start));
    this.store.updateActive({ ...p, start: iso });
  }

  updateStartTime(wert: Date | null): void {
    const p = this.planung();
    if (!p || !wert) return;
    const zeit = lokalesDatumZuZeit(wert);
    if (zeit === this.getTimeFromIso(p.start)) return;
    const iso = this.buildIso(p.start, this.getDateFromIso(p.start), zeit);
    this.store.updateActive({ ...p, start: iso });
  }

  updateEndDate(event: MatDatepickerInputEvent<Date>): void {
    const p = this.planung();
    if (!p || !event.value) return;
    const iso = this.buildIso(p.end, event.value, this.getTimeFromIso(p.end));
    this.store.updateActive({ ...p, end: iso });
  }

  updateEndTime(wert: Date | null): void {
    const p = this.planung();
    if (!p || !wert) return;
    const zeit = lokalesDatumZuZeit(wert);
    if (zeit === this.getTimeFromIso(p.end)) return;
    const iso = this.buildIso(p.end, this.getDateFromIso(p.end), zeit);
    this.store.updateActive({ ...p, end: iso });
  }

  addPosition(postenId: string): void {
    this.store.addPosition(postenId);
  }

  togglePostenfuehrer(postenId: string, positionId: string, current: boolean): void {
    this.store.setPostenfuehrer(postenId, positionId, !current);
  }

  updatePostenLabel(postenId: string, label: string): void {
    this.store.updatePostenLabel(postenId, label);
  }

  updatePositionLabel(postenId: string, positionId: string, value: string): void {
    const p = this.planung();
    if (!p) return;
    const position = p.posten
      .find((po) => po.id === postenId)
      ?.positions.find((pos) => pos.id === positionId);
    if (!position) return;
    this.store.updatePosition(postenId, { ...position, label: value });
  }

  updatePositionTaktisch(postenId: string, positionId: string, value: Taktisch | null): void {
    const p = this.planung();
    if (!p) return;
    const position = p.posten
      .find((po) => po.id === postenId)
      ?.positions.find((pos) => pos.id === positionId);
    if (!position) return;
    this.store.updatePosition(postenId, {
      ...position,
      requirements: { ...position.requirements, taktisch: value },
    });
  }

  updatePositionMedizinisch(postenId: string, positionId: string, value: Medizinisch | null): void {
    const p = this.planung();
    if (!p) return;
    const position = p.posten
      .find((po) => po.id === postenId)
      ?.positions.find((pos) => pos.id === positionId);
    if (!position) return;
    this.store.updatePosition(postenId, {
      ...position,
      requirements: { ...position.requirements, medizinisch: value },
    });
  }

  undo(): void {
    this.store.undo();
  }
}
