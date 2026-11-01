/**
 * Gemeinsame Bausteine für begrenztes JSON-Lesen von Upstream-Antworten und
 * Client-Anfragen. Ursprünglich privat in `efs.ts`; hier gebündelt, damit
 * weitere Endpunkte dieselben Grenzen und dieselbe Fehlerklassifikation nutzen,
 * statt sie zu duplizieren.
 */
import { fehlerAntwort } from './antwort';

export type JsonObjekt = Record<string, unknown>;

/** Kleingeschriebene UUID beliebiger Version; als Teilmuster für Pfadregeln. */
export const UUID_MUSTER = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const UUID_REGEX = new RegExp(`^${UUID_MUSTER}$`, 'i');

export type LeseErgebnis =
  { erfolg: true; inhalt: unknown } | { erfolg: false; ursache: 'zu-gross' | 'ungueltig' };

export function istObjekt(wert: unknown): wert is JsonObjekt {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

export function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

export function istNichtleererText(wert: unknown): wert is string {
  return istText(wert) && wert.trim().length > 0;
}

export function istKennung(wert: unknown): wert is string | number {
  return typeof wert === 'string' || (typeof wert === 'number' && Number.isFinite(wert));
}

export async function verwerfeInhalt(quelle: Response): Promise<void> {
  try {
    await quelle.body?.cancel();
  } catch {
    // Der feste Fehlercode genügt; Transportfehler werden nicht veröffentlicht.
  }
}

export async function leseJsonBegrenzt(
  quelle: Request | Response,
  grenze: number,
  signal?: AbortSignal,
): Promise<LeseErgebnis> {
  if (Number(quelle.headers.get('Content-Length')) > grenze) {
    try {
      await quelle.body?.cancel();
    } catch {
      // Der Größenfehler bleibt maßgeblich.
    }
    return { erfolg: false, ursache: 'zu-gross' };
  }
  if (!quelle.body) return { erfolg: false, ursache: 'ungueltig' };
  const leser = quelle.body.getReader();
  const stuecke: Uint8Array[] = [];
  let groesse = 0;
  const beiAbbruch = () => void leser.cancel().catch(() => undefined);
  signal?.addEventListener('abort', beiAbbruch, { once: true });
  try {
    if (signal?.aborted) throw new Error('Zeitlimit');
    for (;;) {
      const { done, value } = await leser.read();
      if (signal?.aborted) throw new Error('Zeitlimit');
      if (done) break;
      groesse += value.byteLength;
      if (groesse > grenze) {
        await leser.cancel();
        return { erfolg: false, ursache: 'zu-gross' };
      }
      stuecke.push(value);
    }
    const bytes = new Uint8Array(groesse);
    let position = 0;
    for (const stueck of stuecke) {
      bytes.set(stueck, position);
      position += stueck.byteLength;
    }
    return {
      erfolg: true,
      inhalt: JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
      ) as unknown,
    };
  } catch {
    return { erfolg: false, ursache: 'ungueltig' };
  } finally {
    signal?.removeEventListener('abort', beiAbbruch);
    leser.releaseLock();
  }
}

/** Zeitlimit für das Lesen eines Client-Anfragekörpers. */
const KOERPER_ZEITLIMIT_MS = 10_000;

/**
 * Feste Fehlercodes eines Moduls für {@link leseJsonKoerper}. Jedes Modul behält
 * seine eigenen Codes; nur der Ablauf ist gemeinsam. Ohne `inhaltstyp` wird der
 * `Content-Type` nicht geprüft (bisheriges Verhalten der Ehrungen).
 */
export interface KoerperFehlercodes {
  inhaltstyp?: string;
  zuGross: string;
  unlesbar: string;
}

/**
 * Liest einen JSON-Anfragekörper mit Größen- und Zeitlimit und beantwortet jede
 * Ursache mit dem festen Code des aufrufenden Moduls. Ersetzt die zuvor je Modul
 * kopierten `lesePruefeKoerper()`-Fassungen.
 */
export async function leseJsonKoerper(
  anfrage: Request,
  grenze: number,
  codes: KoerperFehlercodes,
): Promise<{ inhalt: unknown } | Response> {
  if (codes.inhaltstyp) {
    const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    if (inhaltstyp !== 'application/json') {
      return fehlerAntwort(codes.inhaltstyp, 'Unzulässiger Inhaltstyp.', 415);
    }
  }
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), KOERPER_ZEITLIMIT_MS);
  try {
    const ergebnis = await leseJsonBegrenzt(anfrage, grenze, abbruch.signal);
    if (!ergebnis.erfolg) {
      return ergebnis.ursache === 'zu-gross'
        ? fehlerAntwort(codes.zuGross, 'Die Anfrage ist zu groß.', 413)
        : fehlerAntwort(codes.unlesbar, 'Die Anfrage ist nicht lesbar.', 400);
    }
    return { inhalt: ergebnis.inhalt };
  } finally {
    clearTimeout(zeitlimit);
  }
}
