import { describe, expect, it } from 'vitest';
import { zipLesen, zipSchreiben } from '../../kern/dateien/zip';
import {
  FuehrerscheinDokumentFehler,
  fuehrerscheinDokumentFuellen,
} from './fuehrerschein-dokument';

/**
 * Vereinfachtes Abbild der echten Vorlage: eine Kopfzeile mit dem
 * Erkennungstext, eine leere Datenzeile mit acht Zellen. Spalten 0, 2 und 3
 * sind – wie in der echten Vorlage – Legacy-Formularfelder mit mehreren
 * Ergebnisläufen; die übrigen Spalten sind gewöhnlicher, feldfreier Text, um
 * sicherzustellen, dass sie unverändert bleiben.
 */
function formularfeldZelle(breite: number): string {
  // Läuft absichtlich mit Attributen wie in der echten Vorlage
  // (`<w:r w:rsidRPr="…">`), nicht das vereinfachte `<w:r>` ohne Attribute –
  // genau das hatte die erste Fassung von zellenErgebnisErsetzen() übersehen
  // (`lastIndexOf('<w:r>', …)` fand den Lauf dann nicht mehr).
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${breite}" w:type="dxa" /></w:tcPr><w:p>` +
    '<w:r w:rsidRPr="00CB4FCD"><w:rPr><w:color w:val="000548" /></w:rPr><w:fldChar w:fldCharType="begin">' +
    '<w:ffData><w:name w:val="Text2" /><w:enabled /><w:calcOnExit w:val="0" /><w:textInput /></w:ffData>' +
    '</w:fldChar></w:r>' +
    '<w:r w:rsidRPr="00CB4FCD"><w:rPr><w:color w:val="000548" /></w:rPr><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r>' +
    '<w:r w:rsidRPr="00CB4FCD"><w:rPr><w:color w:val="000548" /></w:rPr><w:fldChar w:fldCharType="separate" /></w:r>' +
    '<w:r w:rsidRPr="00CB4FCD"><w:rPr><w:color w:val="000548" /></w:rPr><w:t> </w:t></w:r>' +
    '<w:r w:rsidRPr="00CB4FCD"><w:rPr><w:color w:val="000548" /></w:rPr><w:t> </w:t></w:r>' +
    '<w:r w:rsidRPr="00CB4FCD"><w:rPr><w:color w:val="000548" /></w:rPr><w:fldChar w:fldCharType="end" /></w:r>' +
    '</w:p></w:tc>'
  );
}

function einfacheZelle(breite: number, text = ''): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${breite}" w:type="dxa" /></w:tcPr><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
}

function vorlageXml(): string {
  const kopfzellen = [
    einfacheZelle(2000, 'Name des Mitarbeitenden'),
    einfacheZelle(1000, 'Ort d. Ausstellung'),
    einfacheZelle(1000, 'Datum d. Ausstellung'),
    einfacheZelle(1000, 'Identifikations-Nr. der Fahrerlaubnis'),
    einfacheZelle(1000, 'Fahrgastbeförderung'),
    einfacheZelle(1000, 'Name des Prüfers'),
    einfacheZelle(1000, 'Datum Kontrolle'),
    einfacheZelle(1000, 'Unterschrift'),
  ].join('');
  const datenzelle = [
    formularfeldZelle(2000),
    einfacheZelle(1000),
    formularfeldZelle(1000),
    formularfeldZelle(1000),
    einfacheZelle(1000),
    einfacheZelle(1000),
    einfacheZelle(1000),
    einfacheZelle(1000),
  ].join('');
  return (
    '<?xml version="1.0"?><w:document><w:body>' +
    `<w:p><w:r><w:t>Bearbeitungshinweis: Zeilen und Spalten können beliebig ergänzt werden.</w:t></w:r></w:p>` +
    `<w:tbl><w:tr>${kopfzellen}</w:tr><w:tr>${datenzelle}</w:tr></w:tbl>` +
    '</w:body></w:document>'
  );
}

async function vorlageDocx(): Promise<ArrayBuffer> {
  const archiv = await zipSchreiben([
    { name: 'word/document.xml', daten: new TextEncoder().encode(vorlageXml()) },
    { name: '[Content_Types].xml', daten: new TextEncoder().encode('<Types/>') },
  ]);
  return archiv.buffer as ArrayBuffer;
}

async function dokumentXmlAus(blob: Blob): Promise<string> {
  const eintraege = await zipLesen(await blob.arrayBuffer());
  const dokument = eintraege.find((e) => e.name === 'word/document.xml')!;
  return new TextDecoder().decode(dokument.daten);
}

describe('fuehrerscheinDokumentFuellen', () => {
  it('füllt Name, Datum und Nummer in je eine neue Zeile pro Person', async () => {
    const blob = await fuehrerscheinDokumentFuellen(await vorlageDocx(), [
      { name: 'Beispiel, Erika', datum: '01.11.1995', nummer: '7B9205K0C65' },
      { name: 'Muster, Max', datum: '15.06.2020', nummer: 'B072RRE2I50' },
    ]);
    const xml = await dokumentXmlAus(blob);
    expect(xml).toContain('Beispiel, Erika');
    expect(xml).toContain('01.11.1995');
    expect(xml).toContain('7B9205K0C65');
    expect(xml).toContain('Muster, Max');
    expect(xml).toContain('15.06.2020');
    expect(xml).toContain('B072RRE2I50');
    // Zwei gefüllte Zeilen + eine unveränderte Abschlusszeile.
    expect(xml.match(/<w:tr>/g)?.length).toBe(4); // Kopfzeile + 3 Datenzeilen
  });

  it('lässt Spalten ohne Formularfeld unverändert', async () => {
    const blob = await fuehrerscheinDokumentFuellen(await vorlageDocx(), [
      { name: 'Beispiel, Erika', datum: '01.11.1995', nummer: '7B9205K0C65' },
    ]);
    const xml = await dokumentXmlAus(blob);
    // Die leere Abschlusszeile enthält weiterhin die ursprünglichen Platzhalterläufe.
    const letzteZeile = xml.slice(xml.lastIndexOf('<w:tr>'));
    expect((letzteZeile.match(/<w:t> <\/w:t>/g) ?? []).length).toBeGreaterThan(0);
  });

  it('behält Schriftformatierung des Ergebnislaufs bei', async () => {
    const blob = await fuehrerscheinDokumentFuellen(await vorlageDocx(), [
      { name: 'Beispiel, Erika', datum: '01.11.1995', nummer: '7B9205K0C65' },
    ]);
    const xml = await dokumentXmlAus(blob);
    expect(xml).toContain(
      '<w:rPr><w:color w:val="000548" /></w:rPr><w:t xml:space="preserve">Beispiel, Erika</w:t>',
    );
  });

  it('maskiert XML-Sonderzeichen im Namen', async () => {
    const blob = await fuehrerscheinDokumentFuellen(await vorlageDocx(), [
      { name: 'Müller & Söhne <Test>', datum: '', nummer: '' },
    ]);
    const xml = await dokumentXmlAus(blob);
    expect(xml).toContain('Müller &amp; Söhne &lt;Test&gt;');
    expect(xml).not.toContain('<Test>');
  });

  it('erzeugt auch ohne Personen eine gültige Abschlusszeile', async () => {
    const blob = await fuehrerscheinDokumentFuellen(await vorlageDocx(), []);
    const xml = await dokumentXmlAus(blob);
    expect(xml.match(/<w:tr>/g)?.length).toBe(2); // Kopfzeile + eine leere Zeile
  });

  it('wirft einen eigenen Fehler ohne word/document.xml', async () => {
    const archiv = await zipSchreiben([{ name: 'sonstiges.txt', daten: new Uint8Array() }]);
    await expect(fuehrerscheinDokumentFuellen(archiv.buffer as ArrayBuffer, [])).rejects.toThrow(
      FuehrerscheinDokumentFehler,
    );
  });

  it('wirft einen eigenen Fehler ohne erkennbare Tabellenüberschrift', async () => {
    const archiv = await zipSchreiben([
      { name: 'word/document.xml', daten: new TextEncoder().encode('<w:document/>') },
    ]);
    await expect(fuehrerscheinDokumentFuellen(archiv.buffer as ArrayBuffer, [])).rejects.toThrow(
      FuehrerscheinDokumentFehler,
    );
  });
});
