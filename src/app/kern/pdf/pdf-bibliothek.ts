/**
 * Gemeinsame Grundlage aller pdfmake-Exporte (Einsatzplan, Fahrzeug-Druckbogen).
 *
 * PDF unterstützt keine CSS-Variablen; die Designfarben werden hier deshalb konkret
 * geführt. Sie entsprechen den CI-Tokens `--ci-*` in `src/tokens.less` und werden nur
 * gemeinsam mit diesen geändert. Weitere PDF-Exporte verwenden diese Quelle, statt eine
 * zweite, unabhängige Palette zu pflegen.
 */
export const PDF_FARBEN = {
  /** `--ci-dark-blue` */
  dunkelblau: '#000548',
  /** `--ci-blue` */
  blau: '#4A6FB8',
  /** `--ci-red` */
  rot: '#EB003C',
  /** `--ci-light-grey` */
  hellgrau: '#C7CCD9',
  alternierendeZeile: '#F5F6FA',
  weiss: '#FFFFFF',
  schwarz: '#000000',
  sekundaer: '#666666',
  beschriftung: '#444444',
  text: '#333333',
  platzhalter: '#AAAAAA',
  /** `--ci-green` */
  gruen: '#2F8F68',
  /** `--ci-yellow` */
  gelb: '#DEE100',
  neutral: '#E8E8E8',
  neutralText: '#424242',
  /** `--kat-san`, `--kat-btvp`, `--kat-tesi`, `--kat-fuehrung` (Fachgruppen der VB); gemeinsam ändern. */
  katSan: '#C62828',
  katBtvp: '#2F8F68',
  katTesi: '#4A6FB8',
  katFuehrung: '#B06000',
  /** `--abschnitt-1` bis `--abschnitt-8` (Abschnittsfarben der VB); gemeinsam ändern. */
  abschnitt1: '#E65100',
  abschnitt2: '#00838F',
  abschnitt3: '#AD1457',
  abschnitt4: '#6A3FA0',
  abschnitt5: '#F9A825',
  abschnitt6: '#558B2F',
  abschnitt7: '#1565C0',
  abschnitt8: '#5D4037',
} as const;

let geladeneBibliothek: ReturnType<typeof importierePdfBibliothek> | null = null;

async function importierePdfBibliothek() {
  const [pdfModul, schriftModul] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  // pdfmake 0.3 exportiert die Dateiname/Base64-Map selbst, keinen .vfs-Unterknoten.
  // https://pdfmake.github.io/docs/0.3/getting-started/client-side/
  pdfModul.default.addVirtualFileSystem(schriftModul.default);
  return pdfModul.default;
}

/**
 * Lädt pdfmake samt Schriften genau einmal (dynamischer Import, eigener Chunk). Schlägt
 * das Laden fehl – etwa ein Chunk nach einem Deployment –, versucht der nächste Aufruf
 * es erneut, statt den Fehler dauerhaft zu puffern.
 */
export async function ladePdfBibliothek() {
  geladeneBibliothek ??= importierePdfBibliothek();
  try {
    return await geladeneBibliothek;
  } catch (ursache) {
    geladeneBibliothek = null;
    throw ursache;
  }
}
