import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { erzeugeTaktischesZeichen } from 'taktische-zeichen-core';
import { MatDialog } from '@angular/material/dialog';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MatchService } from '../../services/match.service';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE } from '@angular/material/core';
import { DragDropModule, CdkDragDrop, CdkDragStart } from '@angular/cdk/drag-drop';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PlanungCloudService } from '../../services/planung-cloud.service';
import { SaveLoadService } from '../../services/save-load.service';
import { EfsApiService } from '../../services/efs-api.service';
import { ImportService } from '../../services/import.service';
import { PdfExportService } from '../../services/pdf-export.service';
import {
  Einsatzkraft,
  Fahrzeug,
  FahrzeugRef,
  Planung,
  Posten,
  Position,
  TAKTISCH_ORDER,
  MEDIZINISCH_ORDER,
  Taktisch,
  Medizinisch,
} from '../../models/planung.model';
import { FAHRZEUGE } from '../../data/fahrzeuge';
import { ImportDialog } from '../../components/import-dialog/import-dialog';

interface DragData {
  einsatzkraftId: string;
  fromPostenId: string | null;
  fromPositionId: string | null;
}

interface DropData {
  postenId: string;
  positionId: string;
}

type MatchLevel = 'full' | 'partial' | 'mismatch' | 'neutral';

interface Staerke {
  fuhrer: number;
  unterfuehrer: number;
  helfer: number;
  gesamt: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-planning-editor',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatToolbarModule,
    MatSidenavModule,
    MatChipsModule,
    MatExpansionModule,
    MatListModule,
    MatDividerModule,
    MatTooltipModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    DragDropModule,
    MatMenuModule,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'de-DE' }],
  templateUrl: './planning-editor.html',
  styleUrl: './planning-editor.less',
})
export class PlanningEditor {
  private readonly store = inject(PlanungStoreService);
  private readonly router = inject(Router);
  private readonly saveLoad = inject(SaveLoadService);
  private readonly cloud = inject(PlanungCloudService);
  readonly cloudSpeichert = signal(false);
  private readonly gespeicherterCloudStand = signal<{ id: string; inhalt: string } | null>(null);
  readonly cloudStatus = computed(() => {
    const gespeichert = this.gespeicherterCloudStand();
    const aktuell = this.store.active();
    if (!aktuell || aktuell.id !== gespeichert?.id) return '';
    return gespeichert.inhalt === JSON.stringify(aktuell) &&
      !this.cloud.hatLokaleAenderungen(aktuell)
      ? 'Die Einsatzplanung wurde in Nextcloud gespeichert.'
      : 'Der Stand wurde gespeichert. Weitere lokale Änderungen sind noch ungespeichert.';
  });
  readonly cloudFehler = signal('');
  private readonly dialog = inject(MatDialog);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly abgleich = inject(MatchService);
  readonly efsApi = inject(EfsApiService);
  private readonly importService = inject(ImportService);
  private readonly pdfExport = inject(PdfExportService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly postenfuehrerIconUrl: SafeUrl = this.sanitizer.bypassSecurityTrustUrl(
    erzeugeTaktischesZeichen({ grundzeichen: 'person', funktion: 'fuehrungskraft' }).dataUrl,
  );

  readonly planung = this.store.active;
  readonly canUndo = this.store.canUndo;
  readonly efsUpdating = signal(false);
  readonly isEfsLocked = computed(
    () => this.efsApi.erreichbar() && !!this.store.active()?.hiorg_einsatz_id,
  );

  toggleAssignedList(): void {
    this.assignedListCollapsed.update((v) => !v);
  }

  readonly TAKTISCH_LABEL: Record<Taktisch, string> = {
    H: 'Helfer',
    KSH: 'Katastrophenschutzhelfer',
    GF: 'Gruppenführer',
    ZF: 'Zugführer',
    GdSA: 'Grundlagen der Stabsarbeit',
    VF: 'Verbandsführer',
  };

  readonly MEDIZINISCH_LABEL: Record<Medizinisch, string> = {
    EH: 'Ersthelfer',
    SSD: 'Schulsanitätsdienst',
    SanH: 'Sanitätshelfer',
    RH: 'Rettungshelfer',
    RS: 'Rettungssanitäter',
    RA: 'Rettungsassistent',
    NotSan: 'Notfallsanitäter',
    A: 'Arzt',
    NA: 'Notarzt',
  };

  readonly TAKTISCH_OPTIONS: (Taktisch | null)[] = [null, ...TAKTISCH_ORDER];
  readonly MEDIZINISCH_OPTIONS: (Medizinisch | null)[] = [null, ...MEDIZINISCH_ORDER];

  /** null = not focused (show stored vehicle); string = focused/typing */
  readonly fahrzeugFilter = signal<Record<string, string | null>>({});

  filteredFahrzeuge(postenId: string): Fahrzeug[] {
    const q = (this.fahrzeugFilter()[postenId] ?? '').toLowerCase();
    if (!q) return FAHRZEUGE;
    return FAHRZEUGE.filter(
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

  async exportPdf(): Promise<void> {
    const p = this.planung();
    if (!p) return;
    await this.pdfExport.exportieren(p);
  }

  async cloudSpeichern(): Promise<void> {
    const planung = this.planung();
    if (!planung || this.cloudSpeichert()) return;
    this.cloudSpeichert.set(true);
    this.gespeicherterCloudStand.set(null);
    this.cloudFehler.set('');
    try {
      await this.cloud.speichern(planung);
      const aktuell = this.planung();
      if (aktuell?.id !== planung.id) return;
      this.gespeicherterCloudStand.set({ id: planung.id, inhalt: JSON.stringify(planung) });
    } catch (fehler) {
      if (this.planung()?.id === planung.id) this.cloudFehler.set(this.cloud.fehlermeldung(fehler));
    } finally {
      this.cloudSpeichert.set(false);
    }
  }

  save(): void {
    const p = this.planung();
    if (!p) return;
    this.saveLoad.save(p);
  }

  openImportDialog(): void {
    this.dialog.open(ImportDialog, { width: '560px' });
  }

  async updateFromEfs(p: Planung): Promise<void> {
    if (!p.hiorg_einsatz_id || this.efsUpdating() || this.planung()?.id !== p.id) return;
    this.efsUpdating.set(true);
    try {
      const schichtIds = p.posten
        .map((po) => po.hiorg_schicht_id)
        .filter((id): id is string => !!id);
      const ids = schichtIds.length > 0 ? schichtIds : [p.hiorg_einsatz_id];
      const results = await Promise.all(ids.map((id) => this.efsApi.getVeranstaltungDetail(id)));
      if (this.planung()?.id !== p.id) return;
      for (const detail of results) {
        if (!detail) continue;
        const mapped = detail.einsatzkraefte.map((ek) => this.importService.mapEfsEinsatzkraft(ek));
        this.store.mergeEfsEinsatzkraefte(mapped);
      }
    } catch (fehler) {
      if (this.planung()?.id === p.id)
        this.efsApi.fehler.set(
          fehler instanceof Error ? fehler.message : 'Einsatzkräfte konnten nicht geladen werden.',
        );
    } finally {
      this.efsUpdating.set(false);
    }
  }

  goBack(): void {
    this.store.closePlanung();
    this.router.navigate(['/einsatz']);
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

  positionMatchClass(position: Position, einsatzkraft?: Einsatzkraft | null): string {
    if (!einsatzkraft) return 'neutral';
    return this.matchLevel(position, einsatzkraft);
  }

  unassignFromPosition(postenId: string, positionId: string): void {
    this.store.unassignFromPosition(postenId, positionId);
  }

  private matchLevel(position: Position, person: Einsatzkraft): MatchLevel {
    const req = position.requirements;
    let satisfied = 0;
    let total = 0;

    if (req.taktisch !== null) {
      total++;
      const reqIdx = TAKTISCH_ORDER.indexOf(req.taktisch);
      const personIdx = Math.max(
        -1,
        ...(person.tags.taktisch ?? []).map((t) => TAKTISCH_ORDER.indexOf(t)),
      );
      if (personIdx >= reqIdx) satisfied++;
    }

    if (req.medizinisch !== null) {
      total++;
      const reqIdx = MEDIZINISCH_ORDER.indexOf(req.medizinisch);
      const personIdx = Math.max(
        -1,
        ...(person.tags.medizinisch ?? []).map((t) => MEDIZINISCH_ORDER.indexOf(t)),
      );
      if (personIdx >= reqIdx) satisfied++;
    }

    if (total === 0) return 'full';
    if (satisfied === total) return 'full';
    if (satisfied > 0) return 'partial';
    return 'mismatch';
  }

  assignedPerson(position: Position): Einsatzkraft | null {
    if (!position.assigned || !this.planung()) return null;
    return this.planung()!.einsatzkraefte.find((e) => e.id === position.assigned!.id) ?? null;
  }

  private sollRole(t: Taktisch | null): 'fuhrer' | 'unterfuehrer' | 'helfer' {
    if (t === 'ZF' || t === 'VF') return 'fuhrer';
    if (t === 'GF') return 'unterfuehrer';
    return 'helfer';
  }

  private istRole(person: Einsatzkraft): 'fuhrer' | 'unterfuehrer' | 'helfer' {
    const maxIdx = Math.max(
      -1,
      ...(person.tags.taktisch ?? []).map((t) => TAKTISCH_ORDER.indexOf(t)),
    );
    const top = maxIdx >= 0 ? TAKTISCH_ORDER[maxIdx] : null;
    if (top === 'ZF' || top === 'VF') return 'fuhrer';
    if (top === 'GF') return 'unterfuehrer';
    return 'helfer';
  }

  postenSoll(posten: Posten): Staerke {
    const s = { fuhrer: 0, unterfuehrer: 0, helfer: 0, gesamt: posten.positions.length };
    for (const pos of posten.positions) s[this.sollRole(pos.requirements.taktisch)]++;
    return s;
  }

  postenIst(posten: Posten): Staerke {
    const assigned = posten.positions.filter((p) => p.assigned);
    const s = { fuhrer: 0, unterfuehrer: 0, helfer: 0, gesamt: assigned.length };
    for (const pos of assigned) s[this.sollRole(pos.requirements.taktisch)]++;
    return s;
  }

  planungSoll(planung: Planung): Staerke {
    const all = planung.posten.flatMap((p) => p.positions);
    const s = { fuhrer: 0, unterfuehrer: 0, helfer: 0, gesamt: all.length };
    for (const pos of all) s[this.sollRole(pos.requirements.taktisch)]++;
    return s;
  }

  planungIst(planung: Planung): Staerke {
    const assigned = planung.posten.flatMap((p) => p.positions).filter((p) => p.assigned);
    const s = { fuhrer: 0, unterfuehrer: 0, helfer: 0, gesamt: assigned.length };
    for (const pos of assigned) s[this.sollRole(pos.requirements.taktisch)]++;
    return s;
  }

  staerkeStatus(ist: number, soll: number): string {
    if (soll === 0 && ist === 0) return 'status-neutral';
    if (ist < soll) return 'status-under';
    if (ist > soll) return 'status-over';
    return 'status-met';
  }

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

  updateStartTime(value: string): void {
    const p = this.planung();
    if (!p) return;
    const iso = this.buildIso(p.start, this.getDateFromIso(p.start), value);
    this.store.updateActive({ ...p, start: iso });
  }

  updateEndDate(event: MatDatepickerInputEvent<Date>): void {
    const p = this.planung();
    if (!p || !event.value) return;
    const iso = this.buildIso(p.end, event.value, this.getTimeFromIso(p.end));
    this.store.updateActive({ ...p, end: iso });
  }

  updateEndTime(value: string): void {
    const p = this.planung();
    if (!p) return;
    const iso = this.buildIso(p.end, this.getDateFromIso(p.end), value);
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
