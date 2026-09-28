import { zipLesen, zipSchreiben } from '../../kern/dateien/zip';

/**
 * Füllt die Word-Vorlage der Führerscheinliste (siehe
 * `fuehrerschein-vorlage.service.ts` für die Ablage). Läuft bewusst im
 * Browser, nicht im Worker: der Worker verwahrt die Vorlage nur binär, ohne
 * sie je zu lesen (siehe `worker/src/fuehrerschein-vorlage.ts`).
 *
 * Die Vorlage ist ein `.docx` mit `w:documentProtection w:edit="forms"`: Word
 * lässt Menschen dort nur die vorhandenen Formularfelder ausfüllen, keinen
 * freien Text. Diese Sperre wirkt ausschließlich in Words eigener
 * Bearbeitungsoberfläche – die zugrunde liegende ZIP/XML-Struktur bleibt eine
 * gewöhnliche Datei, die sich wie jede andere lesen und schreiben lässt. Die
 * Tabellenzellen der Vorlage sind selbst schon Legacy-Formularfelder
 * (`w:ffData`/`FORMTEXT`, Ergebnis als `<w:t>`-Lauf-Folge zwischen
 * `fldCharType="separate"` und `fldCharType="end"`); diese Funktion ersetzt
 * genau diese Ergebnis-Läufe durch einen neuen mit dem echten Wert – das
 * Feld bleibt danach ein Feld, in geöffnetem Word weiterhin ausfüllbar für
 * die übrigen, von Hand zu ergänzenden Spalten.
 */

export interface FuehrerscheinDokumentZeile {
  name: string;
  datum: string;
  nummer: string;
}

export const FUEHRERSCHEIN_DOKUMENT_MEDIENTYP =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Feste Spaltenreihenfolge der Vorlage; nur diese drei werden befüllt. */
const NAME_SPALTE = 0;
const DATUM_SPALTE = 2;
const NUMMER_SPALTE = 3;

/** Eindeutig genug, um die Kopfzeile der Tabelle in der Vorlage zu finden. */
const KOPFZEILEN_MARKER = 'Name des Mitarbeitenden';

export class FuehrerscheinDokumentFehler extends Error {}

function escapeXmlText(wert: string): string {
  return wert.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Anfang und Ende des `<w:tr>…</w:tr>`, das `ab` (einschließlich) als Erstes umschließt. */
function zeileUmschliessend(xml: string, ab: number): { start: number; ende: number } {
  const start = xml.lastIndexOf('<w:tr', ab);
  if (start === -1) throw new FuehrerscheinDokumentFehler('Keine Tabellenzeile gefunden.');
  const endeMarker = '</w:tr>';
  const endeIndex = xml.indexOf(endeMarker, ab);
  if (endeIndex === -1) throw new FuehrerscheinDokumentFehler('Tabellenzeile nicht abgeschlossen.');
  return { start, ende: endeIndex + endeMarker.length };
}

/** Zerlegt eine Zeile in ihre `<w:tc>…</w:tc>`-Zellen; die Vorlage verschachtelt keine Tabellen. */
function zellenDerZeile(zeilenXml: string): { start: number; ende: number }[] {
  const zellen: { start: number; ende: number }[] = [];
  let position = 0;
  while (true) {
    const start = zeilenXml.indexOf('<w:tc>', position);
    if (start === -1) break;
    const endeMarker = '</w:tc>';
    const endeIndex = zeilenXml.indexOf(endeMarker, start);
    if (endeIndex === -1) {
      throw new FuehrerscheinDokumentFehler('Tabellenzelle nicht abgeschlossen.');
    }
    const ende = endeIndex + endeMarker.length;
    zellen.push({ start, ende });
    position = ende;
  }
  return zellen;
}

/**
 * Ersetzt in einer einzelnen Zelle den Formularfeld-Ergebnislauf (zwischen
 * `separate` und `end`) durch einen neuen Lauf mit `wert`. Übernimmt die
 * `<w:rPr>` des ersten Ergebnislaufs, damit Schrift und Farbe erhalten
 * bleiben. Zellen ohne Formularfeld bleiben unverändert – die Vorlage nicht
 * als über jede Word-Version hinweg exakt gleich geformt voraussetzen.
 */
/** `<w:r>` oder `<w:r w:rsidRPr="…">`, nie `<w:rPr>`/`<w:rFonts>` (kein Leerzeichen/`>` direkt nach `r`). */
const LAUF_START_MUSTER = /<w:r(?:\s[^>]*)?>/g;

/** Position des letzten Laufanfangs vor `grenze`, oder `-1`. */
function letzterLaufStart(xml: string, grenze: number): number {
  LAUF_START_MUSTER.lastIndex = 0;
  let ergebnis = -1;
  let treffer: RegExpExecArray | null;
  while ((treffer = LAUF_START_MUSTER.exec(xml))) {
    if (treffer.index >= grenze) break;
    ergebnis = treffer.index;
  }
  return ergebnis;
}

function zellenErgebnisErsetzen(zelleXml: string, wert: string): string {
  const separateMarker = 'w:fldCharType="separate"';
  const separateIndex = zelleXml.indexOf(separateMarker);
  if (separateIndex === -1) return zelleXml;
  const laufEndeNachSeparate = zelleXml.indexOf('</w:r>', separateIndex);
  if (laufEndeNachSeparate === -1) return zelleXml;
  const ergebnisStart = laufEndeNachSeparate + '</w:r>'.length;

  const endMarker = 'w:fldCharType="end"';
  const endMarkerIndex = zelleXml.indexOf(endMarker, ergebnisStart);
  if (endMarkerIndex === -1) return zelleXml;
  const ergebnisEnde = letzterLaufStart(zelleXml, endMarkerIndex);
  if (ergebnisEnde === -1 || ergebnisEnde < ergebnisStart) return zelleXml;

  const ergebnisLaeufe = zelleXml.slice(ergebnisStart, ergebnisEnde);
  const rPrMatch = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(ergebnisLaeufe);
  const rPr = rPrMatch ? rPrMatch[0] : '';
  const neuerLauf = `<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(wert)}</w:t></w:r>`;

  return zelleXml.slice(0, ergebnisStart) + neuerLauf + zelleXml.slice(ergebnisEnde);
}

function zeileFuellen(zeilenVorlage: string, werte: Partial<Record<number, string>>): string {
  const zellen = zellenDerZeile(zeilenVorlage);
  let ergebnis = '';
  let vorherigesEnde = 0;
  zellen.forEach((zelle, index) => {
    ergebnis += zeilenVorlage.slice(vorherigesEnde, zelle.start);
    const zelleXml = zeilenVorlage.slice(zelle.start, zelle.ende);
    const wert = werte[index];
    ergebnis += wert === undefined ? zelleXml : zellenErgebnisErsetzen(zelleXml, wert);
    vorherigesEnde = zelle.ende;
  });
  ergebnis += zeilenVorlage.slice(vorherigesEnde);
  return ergebnis;
}

/**
 * Baut `word/document.xml` neu auf: Kopfzeile bleibt, alle vorhandenen
 * Datenzeilen der Tabelle werden durch eine gefüllte Zeile je `zeilen`-Eintrag
 * plus eine unveränderte, leere Abschlusszeile ersetzt (der Bearbeitungshinweis
 * der Vorlage – „Zeilen … können beliebig ergänzt werden" – bleibt damit
 * gültig, für von Hand nachgetragene Personen).
 */
function documentXmlFuellen(xml: string, zeilen: readonly FuehrerscheinDokumentZeile[]): string {
  const kopfMarkerIndex = xml.indexOf(KOPFZEILEN_MARKER);
  if (kopfMarkerIndex === -1) {
    throw new FuehrerscheinDokumentFehler(
      'Die Vorlage enthält nicht die erwartete Tabellenüberschrift „Name des Mitarbeitenden".',
    );
  }
  const kopfzeile = zeileUmschliessend(xml, kopfMarkerIndex);

  const tabellenEndeMarker = '</w:tbl>';
  const tabellenEnde = xml.indexOf(tabellenEndeMarker, kopfzeile.ende);
  if (tabellenEnde === -1) {
    throw new FuehrerscheinDokumentFehler('Die Tabelle der Vorlage ist nicht abgeschlossen.');
  }

  const ersteDatenzeile = zeileUmschliessend(xml, kopfzeile.ende);
  const zeilenVorlage = xml.slice(ersteDatenzeile.start, ersteDatenzeile.ende);

  const gefuellteZeilen = zeilen
    .map((zeile) =>
      zeileFuellen(zeilenVorlage, {
        [NAME_SPALTE]: zeile.name,
        [DATUM_SPALTE]: zeile.datum,
        [NUMMER_SPALTE]: zeile.nummer,
      }),
    )
    .join('');
  // Eine unveränderte leere Zeile zum Schluss, zum Nachtragen von Hand.
  const abschlusszeile = zeilenVorlage;

  return xml.slice(0, kopfzeile.ende) + gefuellteZeilen + abschlusszeile + xml.slice(tabellenEnde);
}

/**
 * Liefert das gefüllte Dokument als herunterladbaren Blob. Wirft
 * `FuehrerscheinDokumentFehler`, wenn die Vorlage nicht die erwartete Form
 * hat – lieber ein klarer Fehler als ein still falsch gefülltes Dokument.
 */
export async function fuehrerscheinDokumentFuellen(
  vorlage: ArrayBuffer,
  zeilen: readonly FuehrerscheinDokumentZeile[],
): Promise<Blob> {
  const eintraege = await zipLesen(vorlage);
  const dokumentIndex = eintraege.findIndex((eintrag) => eintrag.name === 'word/document.xml');
  if (dokumentIndex === -1) {
    throw new FuehrerscheinDokumentFehler('Die Vorlage enthält kein word/document.xml.');
  }
  const dokumentXml = new TextDecoder().decode(eintraege[dokumentIndex]!.daten);
  const neuesXml = documentXmlFuellen(dokumentXml, zeilen);

  const neueEintraege = eintraege.map((eintrag, index) =>
    index === dokumentIndex
      ? { name: eintrag.name, daten: new TextEncoder().encode(neuesXml) }
      : eintrag,
  );
  const archiv = await zipSchreiben(neueEintraege);
  return new Blob([archiv as BlobPart], { type: FUEHRERSCHEIN_DOKUMENT_MEDIENTYP });
}
