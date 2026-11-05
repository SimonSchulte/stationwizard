import { istObjekt } from '../../kern/text/pruefung';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import {
  EinsatzplanungBereitsVorhandenFehler,
  EinsatzplanungKonfliktFehler,
} from './einsatzplanung-fehler';
import { MitVersion } from './mit-version';

/** Gemeinsame Bausteine der drei Api-Adapter (Pfade, Fehlerübersetzung, Körper lesen). */
export const EINSATZPLANUNG_BASIS = '/api/einsatzplanung';

export type Bedingung = { ifMatch: string } | { ifNoneMatch: true };

function ungueltig(text: string): WorkerFehler {
  return new WorkerFehler(text, 502);
}

async function leseJson(antwort: Response): Promise<unknown> {
  if (!antwort.headers.get('Content-Type')?.includes('application/json')) {
    throw ungueltig('Der Server hat keine gültige API-Antwort geliefert.');
  }
  try {
    return await antwort.json();
  } catch {
    throw ungueltig('Die Serverantwort konnte nicht gelesen werden.');
  }
}

/** Übersetzt 412 und 409 in eigene Fehlerklassen; alles andere bleibt unverändert. */
export function uebersetzeSchreibfehler(ursache: unknown, ressource: string): unknown {
  if (ursache instanceof WorkerFehler) {
    if (ursache.status === 412) return new EinsatzplanungKonfliktFehler(ressource);
    if (ursache.status === 409) {
      return new EinsatzplanungBereitsVorhandenFehler(ursache.diagnose ?? null);
    }
  }
  return ursache;
}

/** Listenabruf: Antwort muss ein Objekt mit dem Feld `schluessel` als Array sein. */
export async function ladeListe<T>(
  worker: WorkerClient,
  pfad: string,
  schluessel: string,
  pruefung: (wert: unknown) => wert is T,
): Promise<T[]> {
  const antwort = await worker.json<unknown>(pfad);
  const liste = istObjekt(antwort) ? antwort[schluessel] : undefined;
  if (!Array.isArray(liste)) throw ungueltig('Der Server hat eine ungültige Liste geliefert.');
  return liste.filter(pruefung);
}

/** Einzelabruf mit ETag; 404 ergibt `null`. */
export async function ladeEinzeln<T>(
  worker: WorkerClient,
  pfad: string,
  pruefung: (wert: unknown) => wert is T,
  bezeichnung: string,
): Promise<MitVersion<T> | null> {
  try {
    const antwort = await worker.anfragen(pfad);
    const inhalt = await leseJson(antwort);
    const version = antwort.headers.get('ETag');
    if (!pruefung(inhalt) || !version) {
      throw ungueltig(`Der Server hat ${bezeichnung} in ungültiger Form geliefert.`);
    }
    return { daten: inhalt, version };
  } catch (ursache) {
    if (ursache instanceof WorkerFehler && ursache.status === 404) return null;
    throw ursache;
  }
}

/** Schreibzugriff mit Vorbedingung; liefert die neue Version (ETag). */
export async function schreibe(
  worker: WorkerClient,
  pfad: string,
  methode: 'POST' | 'PUT',
  bedingung: Bedingung,
  koerper: unknown,
  ressource: string,
): Promise<string> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if ('ifMatch' in bedingung) headers.set('If-Match', bedingung.ifMatch);
  else headers.set('If-None-Match', '*');
  try {
    const antwort = await worker.anfragen(pfad, {
      method: methode,
      headers,
      body: JSON.stringify(koerper),
    });
    const version = antwort.headers.get('ETag');
    if (!version) throw ungueltig('Der Server hat keine gültige Version geliefert.');
    return version;
  } catch (ursache) {
    throw uebersetzeSchreibfehler(ursache, ressource);
  }
}

export async function loesche(
  worker: WorkerClient,
  pfad: string,
  version: string,
  ressource: string,
): Promise<void> {
  try {
    await worker.anfragen(pfad, { method: 'DELETE', headers: { 'If-Match': version } });
  } catch (ursache) {
    throw uebersetzeSchreibfehler(ursache, ressource);
  }
}
