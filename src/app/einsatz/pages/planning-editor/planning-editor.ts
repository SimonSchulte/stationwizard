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
import { AppModeService } from '../../services/app-mode.service';
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
  readonly cloudStatus = signal('');
  readonly cloudFehler = signal('');
  private readonly dialog = inject(MatDialog);
  readonly appMode = inject(AppModeService);
  private readonly efsApi = inject(EfsApiService);
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
    () => this.appMode.mode() === 'connected-to-efs-api' && !!this.store.active()?.hiorg_einsatz_id,
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
    const zielId = this.planung()?.id;
    const result = await this.saveLoad.load();
    if (!result || this.planung()?.id !== zielId) return;
    if (
      result.versionWarning &&
      !window.confirm(
        'Versionswarnung: Die Vorlage wurde mit einer anderen Dateiversion gespeichert. Trotzdem importieren?',
      )
    )
      return;
    this.store.applyTemplate(result.planung);
  }

  exportPdf(): void {
    const p = this.planung();
    if (!p) return;
    this.pdfExport.export(p);
  }

  async cloudSpeichern(): Promise<void> {
    const planung = this.planung();
    if (!planung || this.cloudSpeichert()) return;
    this.cloudSpeichert.set(true);
    this.cloudStatus.set('');
    this.cloudFehler.set('');
    try {
      await this.cloud.speichern(planung);
      this.cloudStatus.set('Die Einsatzplanung wurde in Nextcloud gespeichert.');
    } catch (fehler) {
      this.cloudFehler.set(this.cloud.fehlermeldung(fehler));
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
    if (!p.hiorg_einsatz_id) return;
    this.efsUpdating.set(true);
    try {
      const schichtIds = p.posten
        .map((po) => po.hiorg_schicht_id)
        .filter((id): id is string => !!id);
      const ids = schichtIds.length > 0 ? schichtIds : [p.hiorg_einsatz_id];
      const results = await Promise.all(ids.map((id) => this.efsApi.getVeranstaltungDetail(id)));
      const anyOk = results.some((r) => r !== null);
      if (!anyOk) {
        window.alert('EFS-Aktualisierung fehlgeschlagen. Bitte API-Key prüfen.');
        return;
      }
      for (const detail of results) {
        if (!detail) continue;
        const mapped = detail.einsatzkraefte.map((ek) => this.importService.mapEfsEinsatzkraft(ek));
        this.store.mergeEfsEinsatzkraefte(mapped);
      }
    } catch {
      window.alert('Fehler beim Laden der Einsatzkräfte aus der EFS-API.');
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

  deletePosten(posten: Posten): void {
    const msg = `Posten "${posten.label}" löschen? Diese Aktion kann nicht rückgängig gemacht werden.`;
    if (window.confirm(msg)) {
      this.store.deletePosten(posten.id);
    }
  }

  clearPosten(posten: Posten): void {
    const names = posten.positions
      .filter((pos) => pos.assigned !== null)
      .map((pos) => pos.assigned!.name)
      .join(', ');
    const msg = names
      ? `Alle Zuteilungen in "${posten.label}" aufheben?\nBetroffen: ${names}`
      : `Alle Zuteilungen in "${posten.label}" aufheben?`;
    if (window.confirm(msg)) {
      this.store.clearPosten(posten.id);
    }
  }

  assignedCount(posten: Posten): number {
    return posten.positions.filter((p) => p.assigned !== null).length;
  }

  taktischColor(tag: Taktisch): { bg: string; fg: string } {
    const i = TAKTISCH_ORDER.indexOf(tag);
    if (i <= 1) return { bg: '#C7CCD9', fg: '#000548' };
    if (i === 2) return { bg: '#4A6FB8', fg: '#FFFFFF' };
    if (i <= 4) return { bg: '#EB003C', fg: '#FFFFFF' };
    return { bg: '#FFFFFF', fg: '#000548' };
  }

  medizinischColor(tag: Medizinisch): { bg: string; fg: string } {
    const i = MEDIZINISCH_ORDER.indexOf(tag);
    if (i <= 2) return { bg: '#C7CCD9', fg: '#000548' }; // EH, SSD, SanH
    if (i === 3) return { bg: '#2F8F68', fg: '#FFFFFF' }; // RH
    if (i === 4) return { bg: '#DEE100', fg: '#000548' }; // RS
    if (i <= 6) return { bg: '#EB003C', fg: '#FFFFFF' }; // RA, NotSan
    return { bg: '#4A6FB8', fg: '#FFFFFF' }; // A, NA
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
