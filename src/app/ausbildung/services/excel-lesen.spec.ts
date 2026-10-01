import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { leseArbeitsmappe } from './excel-lesen';
import { schreibeArbeitsmappe } from './excel-schreiben';
import { isoZuSerial } from '../../kern/kalender/datum';
import { Jahresblatt } from '../models/plan.model';

function jahresblatt(arbeitsmappe: { jahre: Jahresblatt[] }, jahr: number): Jahresblatt {
  const blatt = arbeitsmappe.jahre.find((j) => j.jahr === jahr);
  if (!blatt) {
    throw new Error(`Kein Jahresblatt ${jahr} gefunden.`);
  }
  return blatt;
}

/**
 * Baut eine Mappe im Zustand der gewachsenen Vorlage nach: Titelzeile über der
 * Kopfzeile, Zeilenumbrüche in den Überschriften und ein "Offene Ideen"-Blatt
 * mit zwei unterschiedlichen Alt-Layouts.
 */
function beispielMappe(): ArrayBuffer {
  const plan = XLSX.utils.aoa_to_sheet([
    [],
    ['(Jahres)Dienstplan BI EE 04'],
    [
      'Datum',
      'Tag',
      'Hinweis',
      'Rolle',
      'Thema',
      'Ausbilder/\nVerantw.',
      'KatS-A-plan\nBezug',
      'KatS-A-plan\nTitel',
      ' HGM 4\nInhalt',
      'HGM 4\nOriginal Titel',
      '§35/38 StVO',
      'Elektrosicherheitsunterweisung',
      'Gas',
      'IfSG Folge',
      'FS-Kontrolle',
      'AED Einw.',
      'BLS',
      'Fahreinweisung JUH',
      'UF Sitzung',
      'Gesellschaft',
      'Benötigtes Material ',
      'besondere Anforderungen ',
    ],
    [
      null,
      'Mo',
      '',
      'SAN',
      'Blaulicht­unterweisung',
      'A. Beispiel',
      'X',
      'Blaulicht- und\nInfektionsschutzunterweisung',
      '',
      '',
      'X',
      '',
      '',
      'x',
      'x',
      '',
      '',
      '',
      '',
      '',
      'Fahrtenbuch',
      '',
    ],
    [
      null,
      'Sa',
      'Übung der Einheit',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    [
      null,
      'Mo',
      '',
      'Bt/Vp',
      'Wasserversorgung Bt-LKW',
      '',
      'X',
      'Wasserversorgung-\nund Entsorgung Bt-LKW',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ]);
  // Datumszellen als echte Excel-Seriennummern setzen.
  plan['A4'] = { t: 'n', v: isoZuSerial('2026-01-05'), z: 'DD.MM.YYYY' };
  plan['A5'] = { t: 'n', v: isoZuSerial('2026-03-21'), z: 'DD.MM.YYYY' };
  plan['A6'] = { t: 'n', v: isoZuSerial('2026-05-11'), z: 'DD.MM.YYYY' };

  const ideen = XLSX.utils.aoa_to_sheet([
    ['Thema', 'Fachgruppe', 'KatS-A-plan\nBezug (= Pflicht', 'Spalte1', 'Spalte2'],
    ['Die Kolonnenfahrt', null, 'x'],
    ['Sprechfunkausbildung praktisch', 'Iuk ', 'x'],
    ['Umgang mit Menschen in Krisensituationen', 'Betreuung'],
    [],
    // Zweites Layout: Fachgruppe vorne, Thema in Spalte B.
    [
      'SAN',
      'Dokumentation im Sanitätsdienst',
      'C. Muster',
      'Protokolle, MANV-Karten',
      'Aus der Übung',
    ],
    [
      'SAN',
      'Fahrzeugkunde/Rallye',
      'C. Muster',
      'X',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'KTW-Land, GWSAN',
    ],
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, plan, 'Jahresplan 2026');
  XLSX.utils.book_append_sheet(wb, ideen, 'Offene Ideen');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

describe('leseArbeitsmappe', () => {
  it('liest den Jahresplan inklusive Kopfzeile unterhalb der Überschrift', () => {
    const { arbeitsmappe } = leseArbeitsmappe(beispielMappe());
    const blatt = jahresblatt(arbeitsmappe, 2026);

    expect(blatt.titel).toBe('(Jahres)Dienstplan BI EE 04');
    expect(blatt.termine).toHaveLength(3);

    const ersterTermin = blatt.termine[0];
    expect(ersterTermin.datum).toBe('2026-01-05');
    expect(ersterTermin.kategorie).toBe('SAN');
    expect(ersterTermin.ausbilder).toBe('A. Beispiel');
    expect(ersterTermin.nachweise).toEqual(['stvo', 'ifsg', 'fsKontrolle']);
    expect(ersterTermin.material).toBe('Fahrtenbuch');
  });

  it('behält reine Veranstaltungen als Kalendereinträge', () => {
    const { arbeitsmappe } = leseArbeitsmappe(beispielMappe());
    const ereignis = jahresblatt(arbeitsmappe, 2026).termine.find((t) => t.datum === '2026-03-21');

    expect(ereignis?.hinweis).toBe('Übung der Einheit');
    expect(ereignis?.thema).toBe('');
    expect(ereignis?.kategorie).toBe('');
  });

  it('vereinheitlicht beide Alt-Layouts des Ideen-Blatts', () => {
    const { arbeitsmappe, meldungen } = leseArbeitsmappe(beispielMappe());

    expect(jahresblatt(arbeitsmappe, 2026).ideen).toHaveLength(5);
    expect(meldungen.some((m) => m.includes('vereinheitlicht'))).toBe(true);

    const kolonnenfahrt = jahresblatt(arbeitsmappe, 2026).ideen.find(
      (i) => i.thema === 'Die Kolonnenfahrt',
    );
    expect(kolonnenfahrt?.katsPflicht).toBe(true);
    expect(kolonnenfahrt?.datum).toBeNull();

    const funk = jahresblatt(arbeitsmappe, 2026).ideen.find(
      (i) => i.thema === 'Sprechfunkausbildung praktisch',
    );
    expect(funk?.kategorie).toBe('TeSi/Iuk');

    const betreuung = jahresblatt(arbeitsmappe, 2026).ideen.find((i) =>
      i.thema.startsWith('Umgang mit Menschen'),
    );
    expect(betreuung?.kategorie).toBe('Bt/Vp');

    // Layout B: Rolle steht vorn, Thema in Spalte B.
    const doku = jahresblatt(arbeitsmappe, 2026).ideen.find(
      (i) => i.thema === 'Dokumentation im Sanitätsdienst',
    );
    expect(doku?.kategorie).toBe('SAN');
    expect(doku?.ausbilder).toBe('C. Muster');
    expect(doku?.material).toBe('Protokolle, MANV-Karten');
    expect(doku?.anforderungen).toBe('Aus der Übung');

    const rallye = jahresblatt(arbeitsmappe, 2026).ideen.find(
      (i) => i.thema === 'Fahrzeugkunde/Rallye',
    );
    expect(rallye?.katsPflicht).toBe(true);
    expect(rallye?.material).toBe('KTW-Land, GWSAN');
  });

  it('baut die KatS-A-Plan-Liste aus Plan und Pflicht-Ideen auf und verknüpft sie', () => {
    const { arbeitsmappe } = leseArbeitsmappe(beispielMappe());
    const blatt = jahresblatt(arbeitsmappe, 2026);

    // Bei nur einem Jahresblatt zieht die Ableitung auch die Ideen heran: zwei Titel
    // aus dem Jahresplan plus drei als Pflicht markierte Ideen.
    expect(blatt.katsThemen).toHaveLength(5);

    const verknuepft = blatt.termine.filter((t) => t.katsThemaId !== null);
    expect(verknuepft).toHaveLength(2);

    const thema = blatt.katsThemen.find((t) => t.id === verknuepft[0].katsThemaId);
    expect(thema?.titel).toContain('Blaulicht');
    // Mehrzeilige Titel werden für die Liste zu einer Zeile normalisiert.
    expect(thema?.titel).not.toContain('\n');
    expect(thema?.pflicht).toBe(true);

    const kolonnenfahrt = jahresblatt(arbeitsmappe, 2026).ideen.find(
      (i) => i.thema === 'Die Kolonnenfahrt',
    );
    expect(kolonnenfahrt?.katsThemaId).not.toBeNull();
  });
});

describe('schreibeArbeitsmappe', () => {
  it('erzeugt eine Mappe, die sich verlustfrei wieder einlesen lässt', () => {
    const original = leseArbeitsmappe(beispielMappe()).arbeitsmappe;
    const wieder = leseArbeitsmappe(schreibeArbeitsmappe(original)).arbeitsmappe;
    const blattOriginal = jahresblatt(original, 2026);
    const blattWieder = jahresblatt(wieder, 2026);

    expect(blattWieder.titel).toBe(blattOriginal.titel);
    expect(blattWieder.termine.map((t) => t.datum)).toEqual(
      blattOriginal.termine.map((t) => t.datum),
    );
    expect(blattWieder.termine.map((t) => t.thema)).toEqual(
      blattOriginal.termine.map((t) => t.thema),
    );
    expect(blattWieder.termine.map((t) => t.nachweise)).toEqual(
      blattOriginal.termine.map((t) => t.nachweise),
    );
    expect(
      jahresblatt(wieder, 2026)
        .ideen.map((i) => i.thema)
        .sort(),
    ).toEqual(
      jahresblatt(original, 2026)
        .ideen.map((i) => i.thema)
        .sort(),
    );
    expect(blattWieder.katsThemen.map((t) => t.titel).sort()).toEqual(
      blattOriginal.katsThemen.map((t) => t.titel).sort(),
    );
  });

  it('legt Jahresplan- und KatS-A-Plan-Blatt unter der bloßen Jahreszahl an', () => {
    const original = leseArbeitsmappe(beispielMappe()).arbeitsmappe;
    const wb = XLSX.read(new Uint8Array(schreibeArbeitsmappe(original)), { type: 'array' });

    expect(wb.SheetNames).toEqual(['2026', 'Offene Ideen 2026', 'KatS-A-Plan 2026']);

    const kopf = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Offene Ideen 2026'], {
      header: 1,
    })[0];
    // Ideen haben kein Datum und damit weder Tag noch Enddatum; Uhrzeit und Typ
    // pflegen sie dagegen schon vor der Einplanung.
    expect(kopf.slice(0, 6)).toEqual(['Von', 'Bis', 'Typ', 'Hinweis', 'Rolle', 'Thema']);
  });
});

/**
 * Mappe im neuen Zuschnitt: Enddatum, Uhrzeiten und Typ als eigene Spalten,
 * zwei Termine an einem Tag und ein unbrauchbares Enddatum.
 */
function mappeMitZeitraeumen(): ArrayBuffer {
  const plan = XLSX.utils.aoa_to_sheet([
    ['Jahresplan 2026'],
    [],
    ['Datum', 'Datum bis', 'Tag', 'Von', 'Bis', 'Typ', 'Hinweis', 'Rolle', 'Thema'],
    [
      isoZuSerial('2026-03-02'),
      null,
      'Mo',
      '19:30',
      '21:30',
      'Dienst',
      '',
      'SAN',
      'Erfundener Dienstabend',
    ],
    [
      isoZuSerial('2026-03-02'),
      null,
      'Mo',
      '18:00',
      '19:15',
      'Termin',
      '',
      '',
      'Erfundener Rookies-Termin',
    ],
    [
      isoZuSerial('2026-03-13'),
      isoZuSerial('2026-03-15'),
      'Fr',
      '17:00',
      '',
      'Termin',
      '',
      'UF',
      'Erfundenes Wochenendseminar',
    ],
    [
      isoZuSerial('2026-04-20'),
      isoZuSerial('2026-04-13'),
      'Mo',
      '',
      '',
      '',
      '',
      '',
      'Erfundener Termin mit verdrehtem Ende',
    ],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, plan, '2026');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

describe('Zeiträume, Uhrzeiten und Typ', () => {
  it('liest Enddatum, Uhrzeiten und Typ und sortiert einen Tag nach Beginnzeit', () => {
    const { arbeitsmappe } = leseArbeitsmappe(mappeMitZeitraeumen());
    const termine = jahresblatt(arbeitsmappe, 2026).termine;

    const tag = termine.filter((t) => t.datum === '2026-03-02');
    expect(tag.map((t) => t.thema)).toEqual([
      'Erfundener Rookies-Termin',
      'Erfundener Dienstabend',
    ]);
    expect(tag[0].beginnZeit).toBe('18:00');
    expect(tag[0].typ).toBe('termin');
    expect(tag[1].typ).toBe('dienst');

    const seminar = termine.find((t) => t.datum === '2026-03-13');
    expect(seminar?.datumBis).toBe('2026-03-15');
    expect(seminar?.beginnZeit).toBe('17:00');
    expect(seminar?.endeZeit).toBe('');
  });

  it('verwirft ein Enddatum vor dem Datum und meldet es', () => {
    const { arbeitsmappe, meldungen } = leseArbeitsmappe(mappeMitZeitraeumen());
    const verdreht = jahresblatt(arbeitsmappe, 2026).termine.find((t) => t.datum === '2026-04-20');

    expect(verdreht?.datumBis).toBeNull();
    expect(meldungen.some((m) => m.includes('Datum bis'))).toBe(true);
  });

  it('behält Zeitraum, Uhrzeit und Typ über einen Schreib-/Lese-Rundlauf', () => {
    const original = leseArbeitsmappe(mappeMitZeitraeumen()).arbeitsmappe;
    const zurueck = leseArbeitsmappe(schreibeArbeitsmappe(original)).arbeitsmappe;

    const seminar = jahresblatt(zurueck, 2026).termine.find(
      (t) => t.thema === 'Erfundenes Wochenendseminar',
    );
    expect(seminar).toMatchObject({
      datum: '2026-03-13',
      datumBis: '2026-03-15',
      beginnZeit: '17:00',
      typ: 'termin',
    });
    expect(
      jahresblatt(zurueck, 2026).termine.find((t) => t.thema === 'Erfundener Dienstabend')?.typ,
    ).toBe('dienst');
  });

  it('liest eine Mappe ohne die neuen Spalten unverändert als eintägige Dienste', () => {
    const { arbeitsmappe } = leseArbeitsmappe(beispielMappe());
    const termine = jahresblatt(arbeitsmappe, 2026).termine;

    expect(termine.length).toBeGreaterThan(0);
    expect(termine.every((t) => t.datumBis === null)).toBe(true);
    expect(termine.every((t) => t.typ === 'dienst')).toBe(true);
    expect(termine.every((t) => t.beginnZeit === '' && t.endeZeit === '')).toBe(true);
  });
});

/** Zwei Jahre; die Ideen stehen je Jahr in „Offene Ideen <Jahr>“ oder im alten Sammelblatt. */
function mappeMitZweiJahren(ideenBlaetter: Record<string, string[]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const jahr of [2025, 2026]) {
    const plan = XLSX.utils.aoa_to_sheet([
      [`Jahresplan ${jahr}`],
      [],
      ['Datum', 'Rolle', 'Thema'],
      [isoZuSerial(`${jahr}-03-02`), 'SAN', `Erfundener Dienst ${jahr}`],
    ]);
    XLSX.utils.book_append_sheet(wb, plan, String(jahr));
  }
  for (const [name, themen] of Object.entries(ideenBlaetter)) {
    const blatt = XLSX.utils.aoa_to_sheet([['Rolle', 'Thema'], ...themen.map((t) => ['SAN', t])]);
    XLSX.utils.book_append_sheet(wb, blatt, name);
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

describe('Ideen je Jahr', () => {
  it('ordnet „Offene Ideen <Jahr>“ dem jeweiligen Jahr zu', () => {
    const { arbeitsmappe } = leseArbeitsmappe(
      mappeMitZweiJahren({
        'Offene Ideen 2025': ['Idee A'],
        'Offene Ideen 2026': ['Idee B', 'Idee C'],
      }),
    );
    expect(jahresblatt(arbeitsmappe, 2025).ideen.map((i) => i.thema)).toEqual(['Idee A']);
    expect(jahresblatt(arbeitsmappe, 2026).ideen.map((i) => i.thema)).toEqual(['Idee B', 'Idee C']);
  });

  it('gibt das alte Sammelblatt ohne Jahreszahl dem jüngsten Jahr', () => {
    const { arbeitsmappe } = leseArbeitsmappe(mappeMitZweiJahren({ 'Offene Ideen': ['Alt'] }));
    expect(jahresblatt(arbeitsmappe, 2025).ideen).toEqual([]);
    expect(jahresblatt(arbeitsmappe, 2026).ideen.map((i) => i.thema)).toEqual(['Alt']);
  });

  it('meldet ein Ideen-Blatt für ein Jahr ohne Jahresblatt, statt es zuzuordnen', () => {
    const { arbeitsmappe, meldungen } = leseArbeitsmappe(
      mappeMitZweiJahren({ 'Offene Ideen 2031': ['Fremd'] }),
    );
    expect(arbeitsmappe.jahre.every((j) => j.ideen.length === 0)).toBe(true);
    expect(meldungen.some((m) => m.includes('Offene Ideen 2031'))).toBe(true);
  });

  it('behält die getrennten Sammlungen über einen Schreib-/Lese-Rundlauf', () => {
    const original = leseArbeitsmappe(
      mappeMitZweiJahren({ 'Offene Ideen 2025': ['Idee A'], 'Offene Ideen 2026': ['Idee B'] }),
    ).arbeitsmappe;
    const zurueck = leseArbeitsmappe(schreibeArbeitsmappe(original)).arbeitsmappe;
    expect(jahresblatt(zurueck, 2025).ideen.map((i) => i.thema)).toEqual(['Idee A']);
    expect(jahresblatt(zurueck, 2026).ideen.map((i) => i.thema)).toEqual(['Idee B']);
  });
});
