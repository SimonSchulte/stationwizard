/**
 * Größenbegrenztes Lesen roher Binärinhalte, gemeinsam für alle Module mit
 * Dateiuploads (`nextcloud.ts` für die Excel-Arbeitsmappe,
 * `fuehrerschein-vorlage.ts` für die Word-Vorlage). Ursprünglich nur in
 * `nextcloud.ts`; hierher gezogen, statt ihn ein zweites Mal zu schreiben.
 */

export class Groessenfehler extends Error {}

export async function leseBegrenzt(
  quelle: Request | Response,
  grenze: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const groesse = Number(quelle.headers.get('Content-Length'));
  if (Number.isFinite(groesse) && groesse > grenze) {
    await verwerfeInhalt(quelle);
    throw new Groessenfehler();
  }
  if (!quelle.body) return new Uint8Array();
  const leser = quelle.body.getReader();
  const teile: Uint8Array[] = [];
  let laenge = 0;
  const beiAbbruch = () => void leser.cancel().catch(() => undefined);
  signal?.addEventListener('abort', beiAbbruch, { once: true });
  try {
    if (signal?.aborted) throw new Error('Zeitlimit');
    while (true) {
      const { done, value } = await leser.read();
      if (signal?.aborted) throw new Error('Zeitlimit');
      if (done) break;
      laenge += value.byteLength;
      if (laenge > grenze) {
        await leser.cancel();
        throw new Groessenfehler();
      }
      teile.push(value);
    }
  } finally {
    signal?.removeEventListener('abort', beiAbbruch);
    leser.releaseLock();
  }
  const ergebnis = new Uint8Array(laenge);
  let versatz = 0;
  for (const teil of teile) {
    ergebnis.set(teil, versatz);
    versatz += teil.byteLength;
  }
  return ergebnis;
}

export async function verwerfeInhalt(quelle: Request | Response): Promise<void> {
  await quelle.body?.cancel().catch(() => undefined);
}

/** ZIP-Magic-Bytes (`PK\x03\x04`) – erkennt sowohl .xlsx als auch .docx. */
export function istZip(inhalt: Uint8Array): boolean {
  return (
    inhalt.length >= 4 &&
    inhalt[0] === 0x50 &&
    inhalt[1] === 0x4b &&
    inhalt[2] === 3 &&
    inhalt[3] === 4
  );
}
