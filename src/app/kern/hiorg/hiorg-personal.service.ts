import { Injectable, inject, signal } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';

/**
 * Gemeinsam für Einsatzplanung und Personalmodul. Zweiter HiOrg-Weg neben EFS: die HiOrg-Server-API mit persönlicher
 * OAuth-Anmeldung. Anmeldung, Token und Upstream-Adressen liegen vollständig im
 * Worker (`worker/src/hiorg-api.ts`); hier gibt es nur relative Pfade.
 */
export interface HiorgPerson {
  id: string;
  vorname: string;
  nachname: string;
  gruppen: string[];
  qualifikationen: { liste: string | null; name: string | null; kurz: string | null }[];
  telefon?: string;
}

export type HiorgVerbindung = 'ungeprueft' | 'nicht-eingerichtet' | 'getrennt' | 'verbunden';

/** Module, in die der Worker nach der HiOrg-Anmeldung zurückführt (feste Liste im Worker). */
export type HiorgRueckkehrZiel = 'einsatz' | 'personal';

/** Seitenaufruf (kein API-Aufruf): der Worker leitet von dort zur HiOrg-Anmeldung. */
export function hiorgVerbindenAdresse(ziel: HiorgRueckkehrZiel): string {
  return `/hiorg/verbinden?ziel=${ziel}`;
}

/** Rückmeldung des Workers nach der Anmeldung als `?hiorg=` am Rückkehrziel. */
export const HIORG_ERGEBNIS_TEXTE: Readonly<Record<string, string>> = {
  verbunden: 'Die Verbindung zum HiOrg-Server wurde hergestellt.',
  abgebrochen: 'Die Anmeldung beim HiOrg-Server wurde abgebrochen.',
  'nicht-eingerichtet': 'Die HiOrg-Server-API ist am Server noch nicht eingerichtet.',
  ungueltig:
    'Die Rückmeldung des HiOrg-Servers war ungültig oder veraltet. Bitte erneut verbinden.',
  fehlgeschlagen: 'Die Verbindung zum HiOrg-Server konnte nicht hergestellt werden.',
};

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

function istTextOderNull(wert: unknown): wert is string | null {
  return wert === null || typeof wert === 'string';
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

export function istHiorgPerson(wert: unknown): wert is HiorgPerson {
  if (!istObjekt(wert)) return false;
  const qualifikationen = wert['qualifikationen'];
  const gruppen = wert['gruppen'];
  return (
    istText(wert['id']) &&
    istText(wert['vorname']) &&
    istText(wert['nachname']) &&
    Array.isArray(gruppen) &&
    gruppen.every(istText) &&
    Array.isArray(qualifikationen) &&
    qualifikationen.every(
      (q) =>
        istObjekt(q) &&
        istTextOderNull(q['liste']) &&
        istTextOderNull(q['name']) &&
        istTextOderNull(q['kurz']),
    ) &&
    (wert['telefon'] === undefined || istText(wert['telefon']))
  );
}

@Injectable({ providedIn: 'root' })
export class HiorgPersonalService {
  private readonly worker = inject(WorkerClient);

  readonly verbindung = signal<HiorgVerbindung>('ungeprueft');

  async verbindungLaden(): Promise<HiorgVerbindung> {
    const antwort = await this.worker.json<unknown>('/api/hiorg/verbindung');
    if (
      !istObjekt(antwort) ||
      typeof antwort['eingerichtet'] !== 'boolean' ||
      typeof antwort['verbunden'] !== 'boolean'
    ) {
      throw new WorkerFehler(
        'Der Server hat keinen gültigen HiOrg-Verbindungsstatus geliefert.',
        502,
      );
    }
    const zustand: HiorgVerbindung = !antwort['eingerichtet']
      ? 'nicht-eingerichtet'
      : antwort['verbunden']
        ? 'verbunden'
        : 'getrennt';
    this.verbindung.set(zustand);
    return zustand;
  }

  /** Bewusst nur beim Öffnen der Übernahme: ein Abruf über die ganze Organisation. */
  async personalLaden(): Promise<HiorgPerson[]> {
    let antwort: unknown;
    try {
      antwort = await this.worker.json<unknown>('/api/hiorg/personal');
    } catch (fehler) {
      if (fehler instanceof WorkerFehler && fehler.status === 409) {
        this.verbindung.set('getrennt');
        throw new WorkerFehler(
          'Die Verbindung zum HiOrg-Server besteht nicht mehr. Bitte erneut verbinden.',
          409,
        );
      }
      throw fehler;
    }
    if (!istObjekt(antwort) || !Array.isArray(antwort['personen'])) {
      throw new WorkerFehler('Der Server hat keine gültige Personalliste geliefert.', 502);
    }
    const personen = antwort['personen'];
    if (!personen.every(istHiorgPerson)) {
      throw new WorkerFehler('Der Server hat keine gültige Personalliste geliefert.', 502);
    }
    return [...personen].sort(
      (a, b) =>
        a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de'),
    );
  }

  async trennen(): Promise<void> {
    await this.worker.json<unknown>('/api/hiorg/verbindung', { method: 'DELETE' });
    this.verbindung.set('getrennt');
  }
}
