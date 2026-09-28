/**
 * Minimaler ZIP-Lese-/Schreibzugriff für dateibasierte Formate wie `.docx`
 * (siehe `personal/services/fuehrerschein-dokument.ts`). Bewusst ohne
 * Bibliothek, wie `kern/text/csv.ts`: gebraucht wird nur, ein vollständig im
 * Speicher gehaltenes Archiv einzulesen, einen einzelnen Eintrag zu ersetzen
 * und wieder zu schreiben – kein Streaming, kein ZIP64, keine verschlüsselten
 * Archive.
 *
 * Gelesen wird `deflate` (Methode 8, das übliche Word/Excel-Format) über den
 * eingebauten `DecompressionStream('deflate-raw')` des Browsers – keine
 * eigene Inflate-Implementierung nötig. Geschrieben wird ausschließlich
 * unkomprimiert (`store`, Methode 0): jeder ZIP-fähige Leser, auch Word,
 * akzeptiert unkomprimierte Einträge klaglos, und das erspart eine eigene
 * Deflate-Implementierung für den Schreibweg.
 */

export interface ZipEintrag {
  name: string;
  daten: Uint8Array;
}

const LOKAL_SIGNATUR = 0x04034b50;
const ZENTRAL_SIGNATUR = 0x02014b50;
const EOCD_SIGNATUR = 0x06054b50;
/** UTF-8-Flag (Bit 11) in den allgemeinen Kennzeichen – für unsere reinen ASCII-Namen ohne Wirkung, aber korrekt. */
const UTF8_KENNZEICHEN = 0x0800;

export class ZipFehler extends Error {}

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

async function inflateRaw(daten: Uint8Array): Promise<Uint8Array> {
  const strom = new DecompressionStream('deflate-raw');
  const schreiber = strom.writable.getWriter();
  void schreiber.write(new Uint8Array(daten)).then(() => schreiber.close());
  const antwort = new Response(strom.readable);
  return new Uint8Array(await antwort.arrayBuffer());
}

/** Findet die End-of-Central-Directory ab dem Ende; ein Kommentar ist bei uns nie gesetzt, reicht also. */
function eocdVersatz(bytes: Uint8Array): number {
  const mindestlaenge = 22;
  for (let i = bytes.length - mindestlaenge; i >= 0; i -= 1) {
    if (new DataView(bytes.buffer, bytes.byteOffset + i, 4).getUint32(0, true) === EOCD_SIGNATUR) {
      return i;
    }
  }
  throw new ZipFehler('Keine gültige ZIP-Datei (End-of-Central-Directory fehlt).');
}

/**
 * Liest ein vollständiges ZIP-Archiv in den Speicher. Wirft `ZipFehler` bei
 * einer nicht erkennbaren Struktur – ein beschädigtes oder fremdes Format
 * soll nie stillschweigend ein leeres Ergebnis liefern.
 */
export async function zipLesen(quelle: ArrayBuffer | Uint8Array): Promise<ZipEintrag[]> {
  const bytes = quelle instanceof Uint8Array ? quelle : new Uint8Array(quelle);
  const eocd = eocdVersatz(bytes);
  const blick = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const anzahl = blick.getUint16(eocd + 10, true);
  let position = blick.getUint32(eocd + 16, true);

  const eintraege: ZipEintrag[] = [];
  for (let i = 0; i < anzahl; i += 1) {
    if (blick.getUint32(position, true) !== ZENTRAL_SIGNATUR) {
      throw new ZipFehler('Ungültiger Central-Directory-Eintrag.');
    }
    const methode = blick.getUint16(position + 10, true);
    const komprimierteGroesse = blick.getUint32(position + 20, true);
    const unkomprimierteGroesse = blick.getUint32(position + 24, true);
    const namenslaenge = blick.getUint16(position + 28, true);
    const zusatzlaenge = blick.getUint16(position + 30, true);
    const kommentarlaenge = blick.getUint16(position + 32, true);
    const lokalerVersatz = blick.getUint32(position + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(position + 46, position + 46 + namenslaenge),
    );

    if (blick.getUint32(lokalerVersatz, true) !== LOKAL_SIGNATUR) {
      throw new ZipFehler(`Ungültiger lokaler Dateikopf für „${name}".`);
    }
    const lokalNamenslaenge = blick.getUint16(lokalerVersatz + 26, true);
    const lokalZusatzlaenge = blick.getUint16(lokalerVersatz + 28, true);
    const datenStart = lokalerVersatz + 30 + lokalNamenslaenge + lokalZusatzlaenge;
    const rohdaten = bytes.subarray(datenStart, datenStart + komprimierteGroesse);

    let inhalt: Uint8Array;
    if (methode === 0) {
      inhalt = rohdaten;
    } else if (methode === 8) {
      inhalt = await inflateRaw(rohdaten);
    } else {
      throw new ZipFehler(`Nicht unterstützte Kompressionsmethode ${methode} bei „${name}".`);
    }
    if (inhalt.length !== unkomprimierteGroesse) {
      throw new ZipFehler(`Unerwartete Größe nach dem Entpacken von „${name}".`);
    }
    eintraege.push({ name, daten: inhalt });
    position += 46 + namenslaenge + zusatzlaenge + kommentarlaenge;
  }
  return eintraege;
}

/** CRC-32 (IEEE 802.3) – Standardtabelle, wie in jedem ZIP-Werkzeug. */
const CRC_TABELLE = (() => {
  const tabelle = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    tabelle[n] = c;
  }
  return tabelle;
})();

function crc32(daten: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of daten) {
    crc = (CRC_TABELLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Fester Zeitstempel (1.1.2020, 00:00) im DOS-Format; ZIP verlangt einen, sein Wert ist ohne fachliche Bedeutung. */
const DOS_DATUM = ((2020 - 1980) << 9) | (1 << 5) | 1;
const DOS_ZEIT = 0;

/** Schreibt ein neues ZIP-Archiv, ausschließlich unkomprimiert (siehe Modulkommentar). */
export async function zipSchreiben(eintraege: readonly ZipEintrag[]): Promise<Uint8Array> {
  const encoder = textEncoder();
  const lokaleTeile: Uint8Array[] = [];
  const zentraleTeile: Uint8Array[] = [];
  let versatz = 0;

  for (const { name, daten } of eintraege) {
    const namenBytes = encoder.encode(name);
    const pruefsumme = crc32(daten);

    const lokalerKopf = new Uint8Array(30 + namenBytes.length);
    const lokalerBlick = new DataView(lokalerKopf.buffer);
    lokalerBlick.setUint32(0, LOKAL_SIGNATUR, true);
    lokalerBlick.setUint16(4, 20, true); // benötigte Version 2.0
    lokalerBlick.setUint16(6, UTF8_KENNZEICHEN, true);
    lokalerBlick.setUint16(8, 0, true); // Methode: store
    lokalerBlick.setUint16(10, DOS_ZEIT, true);
    lokalerBlick.setUint16(12, DOS_DATUM, true);
    lokalerBlick.setUint32(14, pruefsumme, true);
    lokalerBlick.setUint32(18, daten.length, true);
    lokalerBlick.setUint32(22, daten.length, true);
    lokalerBlick.setUint16(26, namenBytes.length, true);
    lokalerBlick.setUint16(28, 0, true); // keine Zusatzfelder
    lokalerKopf.set(namenBytes, 30);

    lokaleTeile.push(lokalerKopf, daten);

    const zentralerKopf = new Uint8Array(46 + namenBytes.length);
    const zentralerBlick = new DataView(zentralerKopf.buffer);
    zentralerBlick.setUint32(0, ZENTRAL_SIGNATUR, true);
    zentralerBlick.setUint16(4, 20, true); // erzeugt mit Version 2.0
    zentralerBlick.setUint16(6, 20, true); // benötigte Version 2.0
    zentralerBlick.setUint16(8, UTF8_KENNZEICHEN, true);
    zentralerBlick.setUint16(10, 0, true); // Methode: store
    zentralerBlick.setUint16(12, DOS_ZEIT, true);
    zentralerBlick.setUint16(14, DOS_DATUM, true);
    zentralerBlick.setUint32(16, pruefsumme, true);
    zentralerBlick.setUint32(20, daten.length, true);
    zentralerBlick.setUint32(24, daten.length, true);
    zentralerBlick.setUint16(28, namenBytes.length, true);
    zentralerBlick.setUint16(30, 0, true); // Zusatzfeldlänge
    zentralerBlick.setUint16(32, 0, true); // Kommentarlänge
    zentralerBlick.setUint16(34, 0, true); // Startdatenträger
    zentralerBlick.setUint16(36, 0, true); // interne Attribute
    zentralerBlick.setUint32(38, 0, true); // externe Attribute
    zentralerBlick.setUint32(42, versatz, true);
    zentralerKopf.set(namenBytes, 46);

    zentraleTeile.push(zentralerKopf);
    versatz += lokalerKopf.length + daten.length;
  }

  const zentralVersatz = versatz;
  let zentralGroesse = 0;
  for (const teil of zentraleTeile) zentralGroesse += teil.length;

  const eocd = new Uint8Array(22);
  const eocdBlick = new DataView(eocd.buffer);
  eocdBlick.setUint32(0, EOCD_SIGNATUR, true);
  eocdBlick.setUint16(4, 0, true);
  eocdBlick.setUint16(6, 0, true);
  eocdBlick.setUint16(8, eintraege.length, true);
  eocdBlick.setUint16(10, eintraege.length, true);
  eocdBlick.setUint32(12, zentralGroesse, true);
  eocdBlick.setUint32(16, zentralVersatz, true);
  eocdBlick.setUint16(20, 0, true);

  const gesamtGroesse = versatz + zentralGroesse + eocd.length;
  const ergebnis = new Uint8Array(gesamtGroesse);
  let schreibVersatz = 0;
  for (const teil of [...lokaleTeile, ...zentraleTeile, eocd]) {
    ergebnis.set(teil, schreibVersatz);
    schreibVersatz += teil.length;
  }
  return ergebnis;
}
