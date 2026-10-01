import { describe, expect, it } from 'vitest';
import {
  Jahresblatt,
  KatsThema,
  Termin,
  leererTermin,
  leeresJahresblatt,
} from '../models/plan.model';
import { berechneUebernahme, vorhandeneIdeen, vorhandeneKatsThemen } from './jahresuebernahme';

function thema(id: string, nummer: string, titel: string, pflicht = false): KatsThema {
  return { id, nummer, titel, beschreibung: '', pflicht };
}

function idee(id: string, thema: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(null), id, thema, ...aenderung };
}

function auswahl(ideen: string[], themen: string[]) {
  return { ideenIds: new Set(ideen), katsThemaIds: new Set(themen) };
}

function blatt(jahr: number, ideen: Termin[], katsThemen: KatsThema[]): Jahresblatt {
  return { ...leeresJahresblatt(jahr), ideen, katsThemen };
}

describe('berechneUebernahme', () => {
  const quelle = blatt(
    2026,
    [
      idee('i1', 'Funkausbildung', { katsThemaId: 'k1', kategorie: 'TeSi/Iuk' }),
      idee('i2', 'Fahrzeugkunde', { katsThemaId: 'k2', nachweise: ['aed'] }),
      idee('i3', 'Ohne Thema-Bezug'),
    ],
    [thema('k1', '1.1', 'Funk', true), thema('k2', '2.4', 'Fahrzeuge')],
  );

  it('kopiert ausgewählte Ideen und Themen mit neuen Ids und lässt die Quelle unverändert', () => {
    const vorher = JSON.stringify(quelle);
    const ergebnis = berechneUebernahme(
      quelle,
      leeresJahresblatt(2027),
      auswahl(['i1', 'i3'], ['k1']),
    );

    expect(ergebnis.ideen.map((i) => i.thema)).toEqual(['Funkausbildung', 'Ohne Thema-Bezug']);
    expect(ergebnis.katsThemen.map((t) => t.titel)).toEqual(['Funk']);
    expect(ergebnis.ideen.every((i) => !['i1', 'i2', 'i3'].includes(i.id))).toBe(true);
    expect(ergebnis.katsThemen[0]!.id).not.toBe('k1');
    expect(ergebnis.katsThemen[0]!.pflicht).toBe(true);
    expect(JSON.stringify(quelle)).toBe(vorher);
  });

  it('lässt eine Idee auf die kopierte Themenkopie zeigen', () => {
    const ergebnis = berechneUebernahme(quelle, leeresJahresblatt(2027), auswahl(['i1'], ['k1']));
    expect(ergebnis.ideen[0]!.katsThemaId).toBe(ergebnis.katsThemen[0]!.id);
  });

  it('löst den Verweis, wenn das Thema nicht mitkommt, behält aber den übrigen Inhalt', () => {
    const ergebnis = berechneUebernahme(quelle, leeresJahresblatt(2027), auswahl(['i2'], []));
    expect(ergebnis.ideen[0]!.katsThemaId).toBeNull();
    expect(ergebnis.ideen[0]!.nachweise).toEqual(['aed']);
    expect(ergebnis.katsThemen).toEqual([]);
  });

  it('legt ein im Zieljahr vorhandenes Thema nicht doppelt an und verweist darauf', () => {
    const ziel = blatt(2027, [], [thema('z9', '1.1', ' funk ')]);
    const ergebnis = berechneUebernahme(quelle, ziel, auswahl(['i1'], ['k1']));
    expect(ergebnis.katsThemen).toEqual([]);
    expect(ergebnis.ideen[0]!.katsThemaId).toBe('z9');
  });

  it('teilt keine Nachweisliste zwischen Original und Kopie', () => {
    const ergebnis = berechneUebernahme(quelle, leeresJahresblatt(2027), auswahl(['i2'], []));
    ergebnis.ideen[0]!.nachweise.push('bls');
    expect(quelle.ideen[1]!.nachweise).toEqual(['aed']);
  });

  it('übernimmt bei leerer Auswahl nichts', () => {
    expect(berechneUebernahme(quelle, leeresJahresblatt(2027), auswahl([], []))).toEqual({
      ideen: [],
      katsThemen: [],
    });
  });
});

describe('Dubletten im Zieljahr', () => {
  it('erkennt inhaltsgleiche Ideen unabhängig von Groß-/Kleinschreibung', () => {
    const quelle = blatt(
      2026,
      [idee('i1', 'Erste Hilfe', { kategorie: 'SAN' }), idee('i2', 'Neu')],
      [],
    );
    const ziel = blatt(2027, [idee('z1', ' erste hilfe ', { kategorie: 'SAN' })], []);
    expect([...vorhandeneIdeen(quelle, ziel)]).toEqual(['i1']);
  });

  it('hält Ideen mit anderer Kategorie auseinander und ignoriert Ideen ohne Thema', () => {
    const quelle = blatt(2026, [idee('i1', 'Thema', { kategorie: 'SAN' }), idee('i2', '')], []);
    const ziel = blatt(2027, [idee('z1', 'Thema', { kategorie: 'UF' }), idee('z2', '')], []);
    expect(vorhandeneIdeen(quelle, ziel).size).toBe(0);
  });

  it('erkennt gleiche KatS-Themen an Nummer und Titel', () => {
    const quelle = blatt(2026, [], [thema('k1', '1.1', 'Funk'), thema('k2', '1.2', 'Funk')]);
    const ziel = blatt(2027, [], [thema('z1', '1.1', 'FUNK')]);
    expect([...vorhandeneKatsThemen(quelle, ziel)]).toEqual(['k1']);
  });
});
