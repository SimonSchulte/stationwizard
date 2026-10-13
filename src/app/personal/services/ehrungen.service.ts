import { Injectable, inject, signal } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import {
  istEhrungPerson,
  istEhrungSchluessel,
  type EhrungPerson,
  type EhrungSchluessel,
  type Erhalten,
} from './ehrungen-regeln';

const PFAD = '/api/personal/ehrungen';

export interface EhrungAenderung {
  /** Manueller Nachtrag der Stunden; `null` für keinen. */
  stundenManuell: number | null;
  /** Pflicht, sobald `stundenManuell` gesetzt ist. */
  stundenManuellStand: number | null;
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

export interface StundenAenderung {
  zeitpunkt: string;
  benutzer: string;
  feld: 'stunden-import' | 'stunden-manuell';
  alt: number | null;
  neu: number | null;
  /** Stand (Jahr) des neuen Werts; nur beim manuellen Nachtrag. */
  stand: number | null;
}

function istStundenAenderung(wert: unknown): wert is StundenAenderung {
  return (
    istObjekt(wert) &&
    typeof wert['zeitpunkt'] === 'string' &&
    typeof wert['benutzer'] === 'string' &&
    (wert['feld'] === 'stunden-import' || wert['feld'] === 'stunden-manuell') &&
    (wert['alt'] === null || typeof wert['alt'] === 'number') &&
    (wert['neu'] === null || typeof wert['neu'] === 'number') &&
    (wert['stand'] === null || typeof wert['stand'] === 'number')
  );
}

/**
 * Bearbeitungsstand einer offenen Ehrung: mit dem Ortsbeauftragten abgestimmt, beantragt,
 * Begründung für den Antrag und Zeitpunkt des zuletzt erstellten Antrags.
 */
export interface EhrungVorgang {
  personId: string;
  auszeichnung: EhrungSchluessel;
  abgestimmtOb: boolean;
  beantragt: boolean;
  /** Leer, wenn keine Begründung erfasst ist. */
  begruendung: string;
  /** ISO-Zeitpunkt, den der Worker beim Erstellen des Antrags setzt; `null` ohne Antrag. */
  antragErstelltAm: string | null;
}

export type VorgangFeld = 'abgestimmtOb' | 'beantragt';

/** Was eine Anfrage am Bearbeitungsstand ändert; fehlende Felder bleiben, wie sie sind. */
export interface VorgangAenderung {
  abgestimmtOb?: boolean;
  beantragt?: boolean;
  begruendung?: string;
  /** Vermerkt einen erstellten Antrag; Zeitpunkt und „Beantragt“ setzt der Worker. */
  antragErstellt?: true;
}

export function vorgangSchluessel(personId: string, auszeichnung: EhrungSchluessel): string {
  return `${personId}|${auszeichnung}`;
}

function istVorgang(wert: unknown): wert is EhrungVorgang {
  return (
    istObjekt(wert) &&
    typeof wert['personId'] === 'string' &&
    istEhrungSchluessel(wert['auszeichnung']) &&
    typeof wert['abgestimmtOb'] === 'boolean' &&
    typeof wert['beantragt'] === 'boolean' &&
    typeof wert['begruendung'] === 'string' &&
    (wert['antragErstelltAm'] === null || typeof wert['antragErstelltAm'] === 'string')
  );
}

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
  /** Haken der offenen Ehrungen, nach `vorgangSchluessel()`. */
  readonly vorgaenge = signal<ReadonlyMap<string, EhrungVorgang>>(new Map());

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

  /** Alle Haken in einem Aufruf. */
  async vorgaengeLaden(): Promise<void> {
    const antwort = await this.worker.json<unknown>(`${PFAD}/vorgaenge`);
    const liste = istObjekt(antwort) ? antwort['vorgaenge'] : undefined;
    if (!Array.isArray(liste) || !liste.every(istVorgang)) {
      throw new WorkerFehler('Der Server hat keinen gültigen Bearbeitungsstand geliefert.', 502);
    }
    this.vorgaenge.set(
      new Map(liste.map((v) => [vorgangSchluessel(v.personId, v.auszeichnung), v])),
    );
  }

  /** Setzt genau einen Haken; der Server lässt den anderen unverändert. */
  async vorgangSetzen(
    personId: string,
    auszeichnung: EhrungSchluessel,
    feld: VorgangFeld,
    wert: boolean,
  ): Promise<void> {
    await this.vorgangAendern(personId, auszeichnung, { [feld]: wert });
  }

  /** Ändert nur die genannten Felder des Bearbeitungsstands. */
  async vorgangAendern(
    personId: string,
    auszeichnung: EhrungSchluessel,
    aenderung: VorgangAenderung,
  ): Promise<void> {
    const antwort = await this.worker.json<unknown>(
      `${PFAD}/${personId}/vorgaenge/${auszeichnung}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aenderung),
      },
    );
    if (!istVorgang(antwort)) {
      throw new WorkerFehler('Der Server hat keine gültige Antwort geliefert.', 502);
    }
    this.vorgaenge.update((alt) =>
      new Map(alt).set(vorgangSchluessel(personId, auszeichnung), antwort),
    );
  }

  async speichern(person: EhrungPerson, aenderung: EhrungAenderung): Promise<void> {
    const antwort = await this.worker.json<unknown>(`${PFAD}/${person.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"${person.version}"` },
      body: JSON.stringify(aenderung),
    });
    if (
      !istObjekt(antwort) ||
      typeof antwort['stunden'] !== 'number' ||
      typeof antwort['version'] !== 'number' ||
      typeof antwort['geaendertAm'] !== 'string' ||
      typeof antwort['geaendertVon'] !== 'string'
    ) {
      throw new WorkerFehler('Der Server hat keine gültige Antwort geliefert.', 502);
    }
    const stunden = antwort['stunden'];
    const version = antwort['version'];
    const geaendertAm = antwort['geaendertAm'];
    const geaendertVon = antwort['geaendertVon'];
    this.personen.update((liste) =>
      liste.map((eintrag) =>
        eintrag.id === person.id
          ? { ...eintrag, ...aenderung, stunden, version, geaendertAm, geaendertVon }
          : eintrag,
      ),
    );
  }

  /** Änderungsprotokoll der Stundenzahlen einer Person, neueste zuerst. */
  async verlaufLaden(id: string): Promise<StundenAenderung[]> {
    const antwort = await this.worker.json<unknown>(`${PFAD}/${id}/aenderungen`);
    const liste = istObjekt(antwort) ? antwort['aenderungen'] : undefined;
    if (!Array.isArray(liste) || !liste.every(istStundenAenderung)) {
      throw new WorkerFehler('Der Server hat kein gültiges Änderungsprotokoll geliefert.', 502);
    }
    return liste;
  }

  async loeschen(id: string): Promise<void> {
    await this.worker.anfragen(`${PFAD}/${id}`, { method: 'DELETE' });
    this.personen.update((liste) => liste.filter((eintrag) => eintrag.id !== id));
    this.vorgaenge.update(
      (alt) => new Map([...alt].filter(([, vorgang]) => vorgang.personId !== id)),
    );
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
