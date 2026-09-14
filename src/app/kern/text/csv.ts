/**
 * Minimaler CSV-Leser für Importe aus Tabellenkalkulationen. Bewusst ohne
 * Bibliothek: die benötigte Teilmenge von RFC 4180 ist klein, und eine weitere
 * Abhängigkeit im Initialbundle wäre für ein Importformular nicht zu
 * rechtfertigen.
 *
 * Unterstützt: Byte-Order-Mark, automatische Trennererkennung (deutsches Excel
 * schreibt Semikolon), Anführungszeichen mit verdoppeltem `"` als Maskierung,
 * Felder mit eingebetteten Trennern und Zeilenumbrüchen, CRLF wie LF.
 */

/** Erkannte Trenner in der Reihenfolge ihrer Verbreitung im deutschen Umfeld. */
const TRENNER: readonly string[] = [';', ',', '\t'];

/** Byte-Order-Mark; als Codepoint geschrieben, damit es im Quelltext sichtbar bleibt. */
const BOM = String.fromCharCode(0xfeff);

export interface CsvTabelle {
  /** Kopfzeile, getrimmt und kleingeschrieben – für den Spaltenabgleich. */
  kopf: string[];
  /** Datenzeilen ohne die Kopfzeile; kürzere Zeilen werden nicht aufgefüllt. */
  zeilen: string[][];
  /** Der tatsächlich verwendete Trenner. */
  trenner: string;
}

/**
 * Zählt die Trennerzeichen in der ersten Zeile außerhalb von Anführungszeichen
 * und wählt das häufigste. Bei Gleichstand gewinnt die Reihenfolge in
 * `TRENNER`, damit `a;b,c` als Semikolontabelle gelesen wird.
 */
function erkenneTrenner(text: string): string {
  const ersteZeile = ersteZeileAusserhalbAnfuehrung(text);
  let bester = TRENNER[0];
  let hoechste = 0;
  for (const kandidat of TRENNER) {
    const anzahl = zaehleAusserhalbAnfuehrung(ersteZeile, kandidat);
    if (anzahl > hoechste) {
      hoechste = anzahl;
      bester = kandidat;
    }
  }
  return bester;
}

function ersteZeileAusserhalbAnfuehrung(text: string): string {
  let inAnfuehrung = false;
  for (let i = 0; i < text.length; i += 1) {
    const zeichen = text[i];
    if (zeichen === '"') {
      inAnfuehrung = !inAnfuehrung;
    } else if (!inAnfuehrung && (zeichen === '\n' || zeichen === '\r')) {
      return text.slice(0, i);
    }
  }
  return text;
}

function zaehleAusserhalbAnfuehrung(zeile: string, zeichen: string): number {
  let inAnfuehrung = false;
  let anzahl = 0;
  for (const aktuell of zeile) {
    if (aktuell === '"') inAnfuehrung = !inAnfuehrung;
    else if (!inAnfuehrung && aktuell === zeichen) anzahl += 1;
  }
  return anzahl;
}

function zerlege(text: string, trenner: string): string[][] {
  const zeilen: string[][] = [];
  let felder: string[] = [];
  let feld = '';
  let inAnfuehrung = false;

  const feldAbschliessen = (): void => {
    felder.push(feld);
    feld = '';
  };
  const zeileAbschliessen = (): void => {
    feldAbschliessen();
    zeilen.push(felder);
    felder = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const zeichen = text[i];
    if (inAnfuehrung) {
      if (zeichen === '"') {
        if (text[i + 1] === '"') {
          feld += '"';
          i += 1;
        } else {
          inAnfuehrung = false;
        }
      } else {
        feld += zeichen;
      }
      continue;
    }
    if (zeichen === '"' && feld.length === 0) {
      inAnfuehrung = true;
    } else if (zeichen === trenner) {
      feldAbschliessen();
    } else if (zeichen === '\r') {
      // Teil eines CRLF; der folgende Zeilenumbruch schließt die Zeile ab.
      if (text[i + 1] !== '\n') zeileAbschliessen();
    } else if (zeichen === '\n') {
      zeileAbschliessen();
    } else {
      feld += zeichen;
    }
  }
  if (feld.length > 0 || felder.length > 0) zeileAbschliessen();
  return zeilen;
}

function istLeerzeile(felder: string[]): boolean {
  return felder.every((feld) => feld.trim().length === 0);
}

/**
 * Liest eine CSV-Datei. Eine leere Datei liefert eine leere Tabelle; Leerzeilen
 * werden übersprungen, damit eine abschließende Zeilenschaltung aus Excel keine
 * Geisterzeile erzeugt.
 */
export function leseCsv(text: string): CsvTabelle {
  const ohneBom = text.startsWith(BOM) ? text.slice(1) : text;
  const trenner = erkenneTrenner(ohneBom);
  const alle = zerlege(ohneBom, trenner).filter((felder) => !istLeerzeile(felder));
  if (alle.length === 0) return { kopf: [], zeilen: [], trenner };
  const [kopfzeile, ...rest] = alle;
  return {
    kopf: kopfzeile.map((spalte) => spalte.trim().toLowerCase()),
    zeilen: rest,
    trenner,
  };
}

/**
 * Baut eine CSV-Datei für den Download. Semikolon und Byte-Order-Mark, damit
 * Excel sie ohne Importassistent in Spalten öffnet.
 */
export function schreibeCsv(
  kopf: readonly string[],
  zeilen: readonly (readonly string[])[],
): string {
  const alle = [kopf, ...zeilen];
  return BOM + alle.map((zeile) => zeile.map(maskiere).join(';')).join('\r\n') + '\r\n';
}

function maskiere(feld: string): string {
  if (/[";\r\n]/.test(feld)) return `"${feld.replace(/"/g, '""')}"`;
  return feld;
}
