/**
 * Gemeinsame Bausteine für begrenztes JSON-Lesen von Upstream-Antworten und
 * Client-Anfragen. Ursprünglich privat in `efs.ts`; hier gebündelt, damit
 * weitere Endpunkte dieselben Grenzen und dieselbe Fehlerklassifikation nutzen,
 * statt sie zu duplizieren.
 */
export type JsonObjekt = Record<string, unknown>;

export type LeseErgebnis =
  { erfolg: true; inhalt: unknown } | { erfolg: false; ursache: 'zu-gross' | 'ungueltig' };

export function istObjekt(wert: unknown): wert is JsonObjekt {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
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
