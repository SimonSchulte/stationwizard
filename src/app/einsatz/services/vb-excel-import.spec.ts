import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { vbInhaltProbleme } from './vb-pruefung';
import {
  TITEL_OHNE_TRANSPORT,
  UEBERSCHRIFT_OHNE_LAGERORT,
  leseVbExcelDatei,
  leseVbExcelZeilen,
  titelAusDateiname,
} from './vb-excel-import';

/** Feste Ids, damit Vergleiche lesbar bleiben. */
function idZaehler(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

const KOPF = [
  'LdfNr',
  'Anzahl',
  'erl.',
  'Material',
  'Lagerort',
  'Transport mit',
  'Ansprechpartner',
];

/** Erfundene Packliste in der Struktur der echten: Kopf und Daten gleich ausgerichtet. */
function zeilenGerade(): unknown[][] {
  return [
    ['Packliste Beispielmarkt'],
    [],
    KOPF,
    [1, 2, '', 'Propanflaschen', 'Lager Nord', 'Rollwagen', 'GF Betreuung'],
    [2, '', '', 'Suppe', 'Lager Nord', 'Rollwagen', 'GF Verpflegung'],
    [3, 4, '', 'Tische', 'Garage', 'Rollwagen', 'GF Betreuung'],
    [4, 1, '', 'Zelt', 'Garage', 'blauer Gitterwagen', 'GF TeSi'],
    [5, 10, '', 'Löffel aus\nKunststoff', 'Regal 1\nKeller', 'blauer Gitterwagen', 'GF TeSi'],
    [6, 1, '', 'Beladener Wagen', '', 'blauer Gitterwagen', 'GF TeSi'],
  ];
}

/** Dieselbe Tabelle, deren Daten eine Spalte weiter rechts stehen als die Kopfzeile. */
function zeilenVerschoben(): unknown[][] {
  return zeilenGerade().map((zeile, index) =>
    index >= 3 ? ['', ...zeile] : zeile.length > 0 && index === 2 ? zeile : zeile,
  );
}

describe('leseVbExcelZeilen', () => {
  it('gruppiert in Abschnitte je Transport und Laufzettel je Lagerort', () => {
    const { inhalt, zeilen } = leseVbExcelZeilen(zeilenGerade(), idZaehler());
    expect(zeilen).toBe(6);
    expect(inhalt.abschnitte.map((a) => a.titel)).toEqual(['Rollwagen', 'blauer Gitterwagen']);
    const rollwagen = inhalt.abschnitte[0];
    expect(rollwagen.laufzettel.map((l) => l.lagerort)).toEqual(['Lager Nord', 'Garage']);
    expect(rollwagen.laufzettel[0].positionen.map((p) => p.material)).toEqual([
      'Propanflaschen',
      'Suppe',
    ]);
    expect(rollwagen.laufzettel[0].positionen.map((p) => p.anzahl)).toEqual(['2', '']);
    expect(rollwagen.laufzettel[0].transportMit).toBe('Rollwagen');
    expect(rollwagen.laufzettel[0].ueberschrift).toBe('Material verlasten');
  });

  it('vergibt Abschnittsfarben in Reihenfolge des ersten Vorkommens, Fachgruppe null', () => {
    const { inhalt } = leseVbExcelZeilen(zeilenGerade(), idZaehler());
    expect(inhalt.abschnitte.map((a) => a.farbe)).toEqual(['abschnitt-1', 'abschnitt-2']);
    expect(inhalt.abschnitte.every((a) => a.fachgruppe === null)).toBe(true);
    expect(inhalt.abschnitte.every((a) => a.herkunftId === null)).toBe(true);
  });

  it('verbindet eindeutige Ansprechpartner und setzt die Fachgruppe nur bei eindeutigem Treffer', () => {
    const { inhalt } = leseVbExcelZeilen(zeilenGerade(), idZaehler());
    const [lagerNord, garage] = inhalt.abschnitte[0].laufzettel;
    expect(lagerNord.auftraggeber).toBe('GF Betreuung / GF Verpflegung');
    expect(lagerNord.fachgruppe).toBeNull();
    expect(garage.auftraggeber).toBe('GF Betreuung');
    expect(garage.fachgruppe).toBe('betreuung');
    const tesi = inhalt.abschnitte[1].laufzettel[0];
    expect(tesi.fachgruppe).toBe('tesi');
  });

  it('lässt die Fachgruppe leer, wenn ein Ansprechpartner keiner Gruppe entspricht', () => {
    const tabelle = zeilenGerade();
    tabelle[3][6] = 'Frau Muster';
    const { inhalt } = leseVbExcelZeilen(tabelle, idZaehler());
    const erster = inhalt.abschnitte[0].laufzettel[0];
    expect(erster.fachgruppe).toBeNull();
    expect(erster.auftraggeber).toBe('Frau Muster / GF Verpflegung');
  });

  it('wandelt Zeilenumbrüche: Lagerort mit „ / “, Material mit Leerzeichen', () => {
    const { inhalt } = leseVbExcelZeilen(zeilenGerade(), idZaehler());
    const laufzettel = inhalt.abschnitte[1].laufzettel;
    const mitUmbruch = laufzettel.find((l) => l.lagerort.includes('Keller'));
    expect(mitUmbruch?.lagerort).toBe('Regal 1 / Keller');
    expect(mitUmbruch?.positionen[0].material).toBe('Löffel aus Kunststoff');
  });

  it('stellt Zeilen ohne Lagerort als letzten Laufzettel des Abschnitts mit eigener Überschrift', () => {
    const { inhalt, auffaelligkeiten } = leseVbExcelZeilen(zeilenGerade(), idZaehler());
    const laufzettel = inhalt.abschnitte[1].laufzettel;
    const letzter = laufzettel[laufzettel.length - 1];
    expect(letzter.lagerort).toBe('');
    expect(letzter.ueberschrift).toBe(UEBERSCHRIFT_OHNE_LAGERORT);
    expect(auffaelligkeiten.some((a) => a.includes('ohne Lagerort'))).toBe(true);
  });

  it('erkennt die Spalten über ihre Namen, nicht über die Position', () => {
    const umgestellt = zeilenGerade().map((zeile, index) =>
      index < 2 ? zeile : [zeile[6], zeile[3], zeile[4], zeile[5], zeile[1], zeile[0], zeile[2]],
    );
    const ausKopf = [
      'Ansprechpartner',
      'Material',
      'Lagerort',
      'Transport mit',
      'Anzahl',
      'LdfNr',
      'erl.',
    ];
    umgestellt[2] = ausKopf;
    const { inhalt } = leseVbExcelZeilen(umgestellt, idZaehler());
    expect(inhalt.abschnitte[0].laufzettel[0].positionen[0]).toMatchObject({
      anzahl: '2',
      material: 'Propanflaschen',
    });
  });

  it('toleriert Groß-/Kleinschreibung, Zeilenumbrüche und Leerzeichen in Spaltenköpfen', () => {
    const tabelle = zeilenGerade();
    tabelle[2] = [
      'LdfNr',
      ' ANZAHL ',
      'erl.',
      'material',
      'Lager-\nort',
      'Transport\nmit ',
      'ansprech partner',
    ];
    const { inhalt } = leseVbExcelZeilen(tabelle, idZaehler());
    expect(inhalt.abschnitte).toHaveLength(2);
    expect(inhalt.abschnitte[0].laufzettel[0].auftraggeber).toBe('GF Betreuung / GF Verpflegung');
  });

  it('ordnet Daten zu, die eine Spalte weiter rechts als die Kopfzeile stehen', () => {
    const { inhalt, verschiebung, auffaelligkeiten } = leseVbExcelZeilen(
      zeilenVerschoben(),
      idZaehler(),
    );
    expect(verschiebung).toBe(1);
    expect(inhalt.abschnitte.map((a) => a.titel)).toEqual(['Rollwagen', 'blauer Gitterwagen']);
    expect(inhalt.abschnitte[0].laufzettel[0].positionen[0]).toMatchObject({
      anzahl: '2',
      material: 'Propanflaschen',
    });
    expect(auffaelligkeiten.some((a) => a.includes('versetzt'))).toBe(true);
  });

  it('erkennt eine Verschiebung erst hinter der Mengenspalte', () => {
    const tabelle = zeilenGerade().map((zeile, index) =>
      index < 3 ? zeile : [zeile[0], zeile[1], zeile[2], '', ...zeile.slice(3)],
    );
    const { inhalt, verschiebung } = leseVbExcelZeilen(tabelle, idZaehler());
    expect(verschiebung).toBe(1);
    expect(inhalt.abschnitte[0].laufzettel[0].positionen[0]).toMatchObject({
      anzahl: '2',
      material: 'Propanflaschen',
    });
  });

  it('lässt eine unverschobene Tabelle unverändert und meldet keine Verschiebung', () => {
    const { verschiebung, auffaelligkeiten } = leseVbExcelZeilen(zeilenGerade(), idZaehler());
    expect(verschiebung).toBe(0);
    expect(auffaelligkeiten.some((a) => a.includes('versetzt'))).toBe(false);
  });

  it('lässt die Laufnummer die Mengenspalte nicht verdrängen', () => {
    const tabelle = zeilenGerade();
    // Mehrere Zeilen ohne Anzahl: die Laufnummer links daneben ist dichter gefüllt.
    for (let i = 3; i < 8; i += 1) tabelle[i][1] = i % 2 ? 3 : '';
    const { inhalt } = leseVbExcelZeilen(tabelle, idZaehler());
    expect(inhalt.abschnitte[0].laufzettel[0].positionen[0].anzahl).toBe('3');
  });

  it('meldet unbekannte Spalten, ohne LdfNr und erl. zu beanstanden', () => {
    const tabelle = zeilenGerade().map((zeile, index) =>
      index === 2 ? [...zeile, 'Bemerkung'] : zeile,
    );
    const { auffaelligkeiten } = leseVbExcelZeilen(tabelle, idZaehler());
    expect(auffaelligkeiten).toContain('Unbekannte Spalten wurden ignoriert: Bemerkung.');
    expect(auffaelligkeiten.join(' ')).not.toContain('LdfNr');
  });

  it('meldet Platzhalter, Zeilen ohne Material und überspringt leere Zeilen', () => {
    const tabelle = zeilenGerade();
    tabelle.push([], [7, 3, '', '', 'Garage', 'Rollwagen', 'GF Betreuung']);
    tabelle.push([8, 1, '', 'Kabeltrommel ???', 'Garage', 'Rollwagen', 'GF Betreuung']);
    const { auffaelligkeiten, zeilen } = leseVbExcelZeilen(tabelle, idZaehler());
    expect(zeilen).toBe(7);
    expect(auffaelligkeiten.some((a) => a.includes('ohne Material') && a.includes('11'))).toBe(
      true,
    );
    expect(auffaelligkeiten.some((a) => a.includes('Platzhalter') && a.includes('12'))).toBe(true);
  });

  it('legt Zeilen ohne Transport in einen eigenen Abschnitt', () => {
    const tabelle = zeilenGerade();
    tabelle[3][5] = '';
    const { inhalt, auffaelligkeiten } = leseVbExcelZeilen(tabelle, idZaehler());
    const ohne = inhalt.abschnitte.find((a) => a.titel === TITEL_OHNE_TRANSPORT);
    expect(ohne?.laufzettel[0].transportMit).toBe('');
    expect(auffaelligkeiten.some((a) => a.includes('ohne „Transport mit“'))).toBe(true);
  });

  it('gruppiert Transport und Lagerort ohne Beachtung der Schreibweise', () => {
    const tabelle = zeilenGerade();
    tabelle[4][5] = 'rollwagen';
    tabelle[4][4] = 'LAGER NORD';
    const { inhalt } = leseVbExcelZeilen(tabelle, idZaehler());
    expect(inhalt.abschnitte[0].titel).toBe('Rollwagen');
    expect(inhalt.abschnitte[0].laufzettel[0].positionen).toHaveLength(2);
  });

  it('meldet einen zu vollen Laufzettel', () => {
    const tabelle: unknown[][] = [KOPF];
    for (let i = 0; i < 30; i += 1) {
      tabelle.push([i + 1, 1, '', `Material ${i + 1}`, 'Lager', 'Wagen', 'GF Betreuung']);
    }
    const { auffaelligkeiten } = leseVbExcelZeilen(tabelle, idZaehler());
    expect(auffaelligkeiten.some((a) => a.includes('zu voll') && a.includes('30/23'))).toBe(true);
  });

  it('liefert für eine fehlende Spalte einen Hinweis statt eines Fehlers', () => {
    const tabelle = zeilenGerade().map((zeile) => zeile.slice(0, 6));
    const { auffaelligkeiten, inhalt } = leseVbExcelZeilen(tabelle, idZaehler());
    expect(auffaelligkeiten.some((a) => a.includes('„Ansprechpartner“'))).toBe(true);
    expect(inhalt.abschnitte[0].laufzettel[0].auftraggeber).toBe('');
  });

  it('erzeugt einen Inhalt, den die Vorabprüfung der VB akzeptiert', () => {
    const { inhalt } = leseVbExcelZeilen(zeilenVerschoben());
    expect(vbInhaltProbleme(inhalt)).toEqual([]);
    const ids = [
      ...inhalt.abschnitte.map((a) => a.id),
      ...inhalt.abschnitte.flatMap((a) => a.laufzettel.map((l) => l.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('wirft ohne Kopfzeile oder ohne Materialzeile einen verständlichen Fehler', () => {
    expect(() =>
      leseVbExcelZeilen([
        ['a', 'b'],
        [1, 2],
      ]),
    ).toThrow('keine Kopfzeile');
    expect(() => leseVbExcelZeilen([KOPF])).toThrow('keine Zeile mit einer Materialangabe');
  });

  it('findet die Kopfzeile auch unterhalb von Titelzeilen', () => {
    const { zeilen } = leseVbExcelZeilen(zeilenGerade(), idZaehler());
    expect(zeilen).toBe(6);
  });
});

describe('leseVbExcelDatei', () => {
  it('liest das erste Blatt einer echten Excel-Datei', async () => {
    const mappe = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(mappe, XLSX.utils.aoa_to_sheet(zeilenVerschoben()), 'Packliste');
    XLSX.utils.book_append_sheet(mappe, XLSX.utils.aoa_to_sheet([['Anderes']]), 'Zweites');
    const daten = XLSX.write(mappe, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const ergebnis = await leseVbExcelDatei(daten, idZaehler());
    expect(ergebnis.zeilen).toBe(6);
    expect(ergebnis.inhalt.abschnitte[0].titel).toBe('Rollwagen');
    expect(
      ergebnis.inhalt.abschnitte[1].laufzettel.some((l) => l.lagerort === 'Regal 1 / Keller'),
    ).toBe(true);
  });

  it('meldet eine unlesbare Datei verständlich', async () => {
    await expect(leseVbExcelDatei(new TextEncoder().encode('kein excel').buffer)).rejects.toThrow();
  });
});

describe('titelAusDateiname', () => {
  it('entfernt Endung und Unterstriche', () => {
    expect(titelAusDateiname('Packliste_Beispiel_Markt.xlsx')).toBe('Packliste Beispiel Markt');
    expect(titelAusDateiname('Liste')).toBe('Liste');
  });
});
