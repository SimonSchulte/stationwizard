import { Injectable, inject, signal } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { istEhrungPerson, type EhrungPerson, type Erhalten } from './ehrungen-regeln';

const PFAD = '/api/personal/ehrungen';

export interface EhrungAenderung {
  eintrittsdatum: string | null;
  besondereVerdienste: boolean;
  erhalten: Erhalten;
}

export interface EhrungImportEintrag {
  nachname: string;
  vorname: string;
  stunden?: number;
  eintrittsdatum?: string;
  /** Version der Person, wie der Client sie kennt; ohne sie gilt eine vorhandene Person als Konflikt. */
  version?: number;
}

export type EhrungImportErgebnis =
  'angelegt' | 'aktualisiert' | 'unveraendert' | 'nicht-gefunden' | 'konflikt' | 'doppelt';

const IMPORT_ERGEBNISSE: readonly string[] = [
  'angelegt',
  'aktualisiert',
  'unveraendert',
  'nicht-gefunden',
  'konflikt',
  'doppelt',
];

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

/**
 * Ablage der Ehrungen am Worker (`worker/src/ehrungen.ts`). Ein Aufruf lädt den
 * ganzen Bestand samt Version je Person; geschrieben wird je geänderter Person
 * mit `If-Match` oder gesammelt über den Import.
 */
@Injectable({ providedIn: 'root' })
export class EhrungenService {
  private readonly worker = inject(WorkerClient);

  readonly personen = signal<EhrungPerson[]>([]);

  async laden(): Promise<void> {
    const antwort = await this.worker.json<unknown>(PFAD);
    if (
      !istObjekt(antwort) ||
      !Array.isArray(antwort['personen']) ||
      !antwort['personen'].every(istEhrungPerson)
    ) {
      throw new WorkerFehler('Der Server hat keine gültigen Ehrungen geliefert.', 502);
    }
    this.personen.set(antwort['personen']);
  }

  async speichern(person: EhrungPerson, aenderung: EhrungAenderung): Promise<void> {
    const antwort = await this.worker.json<unknown>(`${PFAD}/${person.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"${person.version}"` },
      body: JSON.stringify(aenderung),
    });
    if (
      !istObjekt(antwort) ||
      typeof antwort['version'] !== 'number' ||
      typeof antwort['geaendertAm'] !== 'string' ||
      typeof antwort['geaendertVon'] !== 'string'
    ) {
      throw new WorkerFehler('Der Server hat keine gültige Antwort geliefert.', 502);
    }
    const version = antwort['version'];
    const geaendertAm = antwort['geaendertAm'];
    const geaendertVon = antwort['geaendertVon'];
    this.personen.update((liste) =>
      liste.map((eintrag) =>
        eintrag.id === person.id
          ? { ...eintrag, ...aenderung, version, geaendertAm, geaendertVon }
          : eintrag,
      ),
    );
  }

  async loeschen(id: string): Promise<void> {
    await this.worker.anfragen(`${PFAD}/${id}`, { method: 'DELETE' });
    this.personen.update((liste) => liste.filter((eintrag) => eintrag.id !== id));
  }

  /** Ergebnis je Eintrag in Eingabereihenfolge; danach ist der Bestand neu geladen. */
  async importieren(
    anlegen: boolean,
    eintraege: EhrungImportEintrag[],
  ): Promise<EhrungImportErgebnis[]> {
    const antwort = await this.worker.json<unknown>(`${PFAD}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anlegen, eintraege }),
    });
    const ergebnisse = istObjekt(antwort) ? antwort['ergebnisse'] : undefined;
    if (
      !Array.isArray(ergebnisse) ||
      ergebnisse.length !== eintraege.length ||
      !ergebnisse.every(
        (e): e is EhrungImportErgebnis => typeof e === 'string' && IMPORT_ERGEBNISSE.includes(e),
      )
    ) {
      throw new WorkerFehler('Der Server hat kein gültiges Importergebnis geliefert.', 502);
    }
    await this.laden();
    return ergebnisse;
  }
}
