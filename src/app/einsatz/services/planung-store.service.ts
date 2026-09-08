import { Injectable, computed, signal } from '@angular/core';
import {
  Einsatzkraft,
  EfsEinsatz,
  EfsEinsatzGruppe,
  FahrzeugRef,
  Planung,
  Posten,
  Position,
} from '../models/planung.model';

@Injectable({ providedIn: 'root' })
export class PlanungStoreService {
  /** List of all planungen (in-memory; later: persisted) */
  private readonly _planungen = signal<Planung[]>([]);

  /** The currently open Planung, or null */
  private readonly _active = signal<Planung | null>(null);

  private readonly _undoStack = signal<Planung[]>([]);
  readonly canUndo = computed(() => this._undoStack().length > 0);

  readonly planungen = this._planungen.asReadonly();
  readonly active = this._active.asReadonly();

  openPlanung(id: string): void {
    const found = this._planungen().find((p) => p.id === id) ?? null;
    this._undoStack.set([]);
    this._active.set(found);
  }

  closePlanung(): void {
    this._undoStack.set([]);
    this._active.set(null);
  }

  createPlanung(name: string): Planung {
    const planung: Planung = {
      id: crypto.randomUUID(),
      name,
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      beschreibung: null,
      posten: [],
      einsatzkraefte: [],
      einsatzleiter: null,
    };
    this._planungen.update((list) => [...list, planung]);
    this._active.set(planung);
    return planung;
  }

  updateActive(planung: Planung): void {
    const prev = this._active();
    if (prev) {
      this._undoStack.update((s) => [...s.slice(-49), prev]);
    }
    this._active.set(planung);
    this._planungen.update((list) => list.map((p) => (p.id === planung.id ? planung : p)));
  }

  undo(): void {
    const stack = this._undoStack();
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    this._undoStack.update((s) => s.slice(0, -1));
    this._active.set(prev);
    this._planungen.update((list) => list.map((p) => (p.id === prev.id ? prev : p)));
  }

  addPosten(): void {
    const active = this._active();
    if (!active) return;
    const newPosten: Posten = {
      id: crypto.randomUUID(),
      label: 'Neuer Posten',
      fahrzeug: null,
      positions: [],
    };
    this.updateActive({ ...active, posten: [...active.posten, newPosten] });
  }

  setPostenFahrzeug(postenId: string, fahrzeug: FahrzeugRef | null): void {
    const active = this._active();
    if (!active) return;
    this.updateActive({
      ...active,
      posten: active.posten.map((p) => (p.id === postenId ? { ...p, fahrzeug } : p)),
    });
  }

  deletePosten(postenId: string): void {
    const active = this._active();
    if (!active) return;
    this.updateActive({ ...active, posten: active.posten.filter((p) => p.id !== postenId) });
  }

  private syncPostenfuehrerPhone(posten: Posten, einsatzkraefte: Einsatzkraft[]): Posten {
    const pf = posten.positions.find((pos) => pos.isPostenfuehrer);
    const ek = pf?.assigned ? einsatzkraefte.find((e) => e.id === pf.assigned!.id) : undefined;
    return { ...posten, telefonnummer: ek?.telefonnummer ?? undefined };
  }

  setPostenfuehrer(postenId: string, positionId: string, value: boolean): void {
    const active = this._active();
    if (!active) return;
    const newPosten = active.posten.map((p) => {
      if (p.id !== postenId) return p;
      const updatedPositions = p.positions.map((pos) => ({
        ...pos,
        isPostenfuehrer: value && pos.id === positionId ? true : undefined,
      }));
      return this.syncPostenfuehrerPhone(
        { ...p, positions: updatedPositions },
        active.einsatzkraefte,
      );
    });
    this.updateActive({ ...active, posten: newPosten });
  }

  clearPosten(postenId: string): void {
    const active = this._active();
    if (!active) return;
    const newPosten = active.posten.map((p) => {
      if (p.id !== postenId) return p;
      return this.syncPostenfuehrerPhone(
        { ...p, positions: p.positions.map((pos) => ({ ...pos, assigned: null })) },
        active.einsatzkraefte,
      );
    });
    this.updateActive({ ...active, posten: newPosten });
  }

  assignToPosition(postenId: string, positionId: string, einsatzkraftId: string): void {
    const active = this._active();
    if (!active) return;
    const ek = active.einsatzkraefte.find((e) => e.id === einsatzkraftId);
    if (!ek) return;
    const newPosten = active.posten.map((p) => {
      if (p.id !== postenId) return p;
      const updated = {
        ...p,
        positions: p.positions.map((pos) =>
          pos.id === positionId ? { ...pos, assigned: { id: ek.id, name: ek.name } } : pos,
        ),
      };
      return this.syncPostenfuehrerPhone(updated, active.einsatzkraefte);
    });
    this.updateActive({ ...active, posten: newPosten });
  }

  moveEinsatzkraftToPosition(ekId: string, toPostenId: string, toPositionId: string): void {
    const active = this._active();
    if (!active) return;
    const ek = active.einsatzkraefte.find((e) => e.id === ekId);
    if (!ek) return;
    const newPosten = active.posten.map((p) => {
      const updated = {
        ...p,
        positions: p.positions.map((pos) => {
          if (pos.assigned?.id === ekId && !(p.id === toPostenId && pos.id === toPositionId)) {
            return { ...pos, assigned: null };
          }
          if (p.id === toPostenId && pos.id === toPositionId) {
            return { ...pos, assigned: { id: ek.id, name: ek.name } };
          }
          return pos;
        }),
      };
      return this.syncPostenfuehrerPhone(updated, active.einsatzkraefte);
    });
    this.updateActive({ ...active, posten: newPosten });
  }

  importPlanung(planung: Planung): void {
    const exists = this._planungen().some((p) => p.id === planung.id);
    if (exists) {
      this._planungen.update((list) => list.map((p) => (p.id === planung.id ? planung : p)));
    } else {
      this._planungen.update((list) => [...list, planung]);
    }
    this._active.set(planung);
  }

  importRoster(
    incoming: Einsatzkraft[],
    mode: 'replace' | 'merge',
  ): { removedNames: string[]; affectedAssignments: string[] } {
    const active = this._active();
    if (!active) return { removedNames: [], affectedAssignments: [] };

    const current = active.einsatzkraefte;

    // Merge: reuse existing entries for known names, add new ones
    const merged = incoming.map((inc) => current.find((e) => e.name === inc.name) ?? inc);

    if (mode === 'merge') {
      const existingNames = new Set(current.map((e) => e.name));
      const toAdd = merged.filter((e) => !existingNames.has(e.name));
      this.updateActive({ ...active, einsatzkraefte: [...current, ...toAdd] });
      return { removedNames: [], affectedAssignments: [] };
    }

    // replace mode
    const incomingNames = new Set(incoming.map((e) => e.name));
    const removed = current.filter((e) => !incomingNames.has(e.name));
    const removedIds = new Set(removed.map((e) => e.id));

    const affectedAssignments = removed
      .filter((e) =>
        active.posten.some((p) => p.positions.some((pos) => pos.assigned?.id === e.id)),
      )
      .map((e) => e.name);

    const newPosten = active.posten.map((p) => {
      const updated = {
        ...p,
        positions: p.positions.map((pos) =>
          pos.assigned && removedIds.has(pos.assigned.id) ? { ...pos, assigned: null } : pos,
        ),
      };
      return this.syncPostenfuehrerPhone(updated, merged);
    });

    this.updateActive({ ...active, einsatzkraefte: merged, posten: newPosten });
    return { removedNames: removed.map((e) => e.name), affectedAssignments };
  }

  /** Creates a new Planung from an EFS event and sets it as active. */
  openEfsEinsatz(einsatz: EfsEinsatz): Planung {
    const existing = this._planungen().find((p) => p.hiorg_einsatz_id === einsatz.id);
    if (existing) {
      this._active.set(existing);
      return existing;
    }
    const planung: Planung = {
      id: crypto.randomUUID(),
      name: einsatz.titel,
      start: einsatz.datum_von,
      end: einsatz.datum_bis,
      posten: [],
      einsatzkraefte: [],
      einsatzleiter: null,
      hiorg_einsatz_id: einsatz.id,
    };
    this._planungen.update((list) => [...list, planung]);
    this._active.set(planung);
    return planung;
  }

  /** Creates or reopens a Planung for an EfsEinsatzGruppe and sets it as active. */
  openEfsGruppe(gruppe: EfsEinsatzGruppe): Planung {
    const existing = this._planungen().find((p) => p.hiorg_einsatz_id === gruppe.veranstaltung_id);
    if (existing) {
      this._active.set(existing);
      this._undoStack.set([]);
      return existing;
    }
    const planung: Planung = {
      id: crypto.randomUUID(),
      name: gruppe.titel,
      start: gruppe.datum_von,
      end: gruppe.datum_bis,
      posten: [],
      einsatzkraefte: [],
      einsatzleiter: null,
      hiorg_einsatz_id: gruppe.veranstaltung_id,
    };
    this._planungen.update((list) => [...list, planung]);
    this._undoStack.set([]);
    this._active.set(planung);
    return planung;
  }

  /** Appends a Posten for a Schicht if not already present. */
  addEfsSchichtPosten(schichtId: string, label: string, fahrzeug?: FahrzeugRef | null): void {
    const active = this._active();
    if (!active) return;
    if (active.posten.some((p) => p.hiorg_schicht_id === schichtId)) return;
    const newPosten: Posten = {
      id: crypto.randomUUID(),
      label,
      fahrzeug: fahrzeug ?? null,
      positions: [],
      hiorg_schicht_id: schichtId,
    };
    this.updateActive({ ...active, posten: [...active.posten, newPosten] });
  }

  /**
   * Merges incoming Einsatzkräfte into the active Planung without overwriting existing ones.
   * Deduplication uses hiorg_org_id first, then full name.
   */
  mergeEfsEinsatzkraefte(incoming: Einsatzkraft[]): void {
    const active = this._active();
    if (!active) return;
    const current = active.einsatzkraefte;
    const existingHiorgIds = new Set(current.map((e) => e.hiorg_org_id).filter(Boolean));
    const existingNames = new Set(current.map((e) => e.name));
    const toAdd = incoming.filter(
      (e) =>
        !(e.hiorg_org_id && existingHiorgIds.has(e.hiorg_org_id)) && !existingNames.has(e.name),
    );
    if (toAdd.length > 0) {
      this.updateActive({ ...active, einsatzkraefte: [...current, ...toAdd] });
    }
  }

  applyTemplate(template: Planung): void {
    const active = this._active();
    if (!active) return;

    const hiorgMap = new Map(
      active.einsatzkraefte.filter((e) => e.hiorg_org_id).map((e) => [e.hiorg_org_id!, e]),
    );

    const templateEkMap = new Map(template.einsatzkraefte.map((e) => [e.id, e.hiorg_org_id]));

    const resolvedPosten = template.posten.map((posten) => {
      const updated = {
        ...posten,
        id: crypto.randomUUID(),
        positions: posten.positions.map((pos) => {
          if (!pos.assigned) return { ...pos, id: crypto.randomUUID() };
          const templateHiorgId = templateEkMap.get(pos.assigned.id);
          const matched = templateHiorgId ? hiorgMap.get(templateHiorgId) : undefined;
          return {
            ...pos,
            id: crypto.randomUUID(),
            assigned: matched ? { id: matched.id, name: matched.name } : null,
          };
        }),
      };
      return this.syncPostenfuehrerPhone(updated, active.einsatzkraefte);
    });

    const isHiorgLinked = !!active.hiorg_einsatz_id;
    this.updateActive({
      ...active,
      ...(isHiorgLinked
        ? {}
        : {
            name: template.name,
            start: template.start,
            end: template.end,
          }),
      beschreibung: template.beschreibung,
      posten: resolvedPosten,
    });
  }

  unassignFromPosition(postenId: string, positionId: string): void {
    const active = this._active();
    if (!active) return;
    const newPosten = active.posten.map((p) => {
      if (p.id !== postenId) return p;
      const updated = {
        ...p,
        positions: p.positions.map((pos) =>
          pos.id === positionId ? { ...pos, assigned: null } : pos,
        ),
      };
      return this.syncPostenfuehrerPhone(updated, active.einsatzkraefte);
    });
    this.updateActive({ ...active, posten: newPosten });
  }

  addPosition(postenId: string): void {
    const active = this._active();
    if (!active) return;
    const newPosition: Position = {
      id: crypto.randomUUID(),
      label: 'Neue Position',
      requirements: { taktisch: null, medizinisch: null },
      assigned: null,
    };
    this.updateActive({
      ...active,
      posten: active.posten.map((p) =>
        p.id === postenId ? { ...p, positions: [...p.positions, newPosition] } : p,
      ),
    });
  }

  updatePostenLabel(postenId: string, label: string): void {
    const active = this._active();
    if (!active) return;
    this.updateActive({
      ...active,
      posten: active.posten.map((p) => (p.id === postenId ? { ...p, label } : p)),
    });
  }

  updatePosition(postenId: string, position: Position): void {
    const active = this._active();
    if (!active) return;
    this.updateActive({
      ...active,
      posten: active.posten.map((p) =>
        p.id === postenId
          ? { ...p, positions: p.positions.map((pos) => (pos.id === position.id ? position : pos)) }
          : p,
      ),
    });
  }

  /** Silently updates Stammdaten from EFS (no undo entry — authoritative sync). */
  updateEfsStammdaten(einsatz: EfsEinsatz): void {
    const active = this._active();
    if (!active) return;
    const updated = {
      ...active,
      name: einsatz.titel,
      start: einsatz.datum_von,
      end: einsatz.datum_bis,
    };
    this._active.set(updated);
    this._planungen.update((list) => list.map((p) => (p.id === active.id ? updated : p)));
  }

  updateEinsatzkraftNotes(id: string, notes: string): void {
    const active = this._active();
    if (!active) return;
    this.updateActive({
      ...active,
      einsatzkraefte: active.einsatzkraefte.map((e) =>
        e.id === id ? { ...e, meta: { ...e.meta, notes: notes || undefined } } : e,
      ),
    });
  }
}
