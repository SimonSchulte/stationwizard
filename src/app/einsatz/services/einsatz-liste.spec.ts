import { describe, expect, it } from 'vitest';
import {
  EinsatzListenZeile,
  KEIN_FILTER,
  baueEinsatzListe,
  filtereEinsaetze,
  gruppiereNachMonat,
  istFilterAktiv,
  mitAbstand,
} from './einsatz-liste';
import { testEinsatz } from '../testing/vb-testdaten';
import { HiorgArt, HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';
import { testVeranstaltung } from '../testing/veranstaltung-testdaten';

const JETZT = new Date('2026-11-05T12:00:00Z');

function gruppe(
  id: string,
  titel: string,
  von: string,
  bis = von,
  art: HiorgArt = 'dienst',
): HiorgVeranstaltung {
  return testVeranstaltung({
    veranstaltungId: `${art}-${id}`,
    art,
    titel,
    beginn: von,
    ende: bis,
    schichten: [],
  });
}
const eintrag = (teil: Parameters<typeof testEinsatz>[0]) => ({
  ...testEinsatz(teil),
  version: 1,
  vb: null,
  pep: null,
});

describe('baueEinsatzListe', () => {
  it('mischt HiOrg und eigene Einsätze nach Beginn, ohne Beginn zuletzt', () => {
    const liste = baueEinsatzListe(
      [gruppe('2', 'Später', '2026-12-20T10:00'), gruppe('1', 'Früher', '2026-11-20T10:00')],
      [
        eintrag({ titel: 'Ohne Datum', beginn: null, ende: null }),
        eintrag({ titel: 'Dazwischen', beginn: '2026-12-01T09:00', ende: '2026-12-01T17:00' }),
      ],
      JETZT,
    );
    expect(liste.anstehend.map((z) => z.titel)).toEqual([
      'Früher',
      'Dazwischen',
      'Später',
      'Ohne Datum',
    ]);
    expect(liste.anstehend.map((z) => z.herkunft)).toEqual(['hiorg', 'eigen', 'hiorg', 'eigen']);
    expect(liste.vergangen).toEqual([]);
  });

  it('legt Vergangenes getrennt ab, neueste zuerst', () => {
    const liste = baueEinsatzListe(
      [gruppe('1', 'Altes Fest', '2026-09-01T10:00', '2026-09-01T18:00')],
      [eintrag({ titel: 'Jüngerer', beginn: '2026-10-10T10:00', ende: '2026-10-10T12:00' })],
      JETZT,
    );
    expect(liste.anstehend).toEqual([]);
    expect(liste.vergangen.map((z) => z.titel)).toEqual(['Jüngerer', 'Altes Fest']);
  });

  it('verknüpft Veranstaltungen mit ihrem Einsatz (PEP, VB) und ignoriert dessen eigene Zeile', () => {
    const einsatz = {
      ...eintrag({ hiorgVeranstaltungId: 'dienst-1' }),
      vb: { laufzettel: 22, positionen: 64 },
      pep: { posten: 3, positionen: 9, besetzt: 4 },
    };
    const liste = baueEinsatzListe([gruppe('1', 'Markt', '2026-12-01T10:00')], [einsatz], JETZT);
    expect(liste.anstehend).toHaveLength(1);
    expect(liste.anstehend[0]).toMatchObject({
      schluessel: 'hiorg:dienst-1',
      beginn: '2026-12-01T10:00',
      pepVorhanden: true,
      pep: { posten: 3, positionen: 9, besetzt: 4 },
      vb: { laufzettel: 22, positionen: 64 },
    });
  });

  it('zeigt einen gespeicherten HiOrg-Einsatz weiter, wenn der Feed seine Veranstaltung nicht mehr liefert', () => {
    const alt = {
      ...eintrag({
        titel: 'Altes Fest',
        beginn: '2026-03-01T10:00',
        ende: '2026-03-01T18:00',
        hiorgVeranstaltungId: 'termin-77',
      }),
      pep: { posten: 1, positionen: 2, besetzt: 2 },
    };
    const liste = baueEinsatzListe([], [alt], JETZT);
    expect(liste.vergangen).toHaveLength(1);
    expect(liste.vergangen[0]).toMatchObject({
      titel: 'Altes Fest',
      herkunft: 'hiorg',
      art: 'termin',
      pepVorhanden: true,
    });
  });

  it('kennt bei Altbestand ohne Art-Präfix keine Art', () => {
    const liste = baueEinsatzListe([], [eintrag({ hiorgVeranstaltungId: '4711' })], JETZT);
    expect(liste.anstehend[0]).toMatchObject({ herkunft: 'hiorg', art: null });
  });

  it('übernimmt die Art der Veranstaltung', () => {
    const liste = baueEinsatzListe(
      [gruppe('1', 'Markt', '2026-12-01T10:00', '2026-12-01T12:00', 'termin')],
      [],
      JETZT,
    );
    expect(liste.anstehend[0].art).toBe('termin');
  });

  it('zeigt Veranstaltungen ohne Einsatz mit fehlendem PEP und VB', () => {
    const liste = baueEinsatzListe([gruppe('9', 'Neu', '2026-12-01T10:00')], [], JETZT);
    expect(liste.anstehend[0]).toMatchObject({ pepVorhanden: false, pep: null, vb: null });
  });
});

function zeile(teil: Partial<EinsatzListenZeile>): EinsatzListenZeile {
  return {
    schluessel: teil.titel ?? 'x',
    ziel: eintrag({}),
    titel: 'Einsatz',
    beginn: '2026-11-10T10:00',
    schichten: null,
    ort: null,
    herkunft: 'eigen',
    art: null,
    pepVorhanden: false,
    pep: null,
    vb: null,
    ...teil,
  };
}

describe('filtereEinsaetze', () => {
  const vb = { abschnitte: 1, laufzettel: 1, positionen: 1 };
  const zeilen = [
    zeile({ titel: 'Weihnachtsmarkt', ort: 'Ummeln', herkunft: 'hiorg', pepVorhanden: true }),
    zeile({ titel: 'Stadtlauf', ort: 'Bielefeld', herkunft: 'hiorg', vb }),
    zeile({ titel: 'Dienst', ort: null }),
  ];
  const titel = (liste: EinsatzListenZeile[]) => liste.map((z) => z.titel);

  it('lässt ohne Bedingung alles durch', () => {
    expect(filtereEinsaetze(zeilen, KEIN_FILTER)).toHaveLength(3);
    expect(istFilterAktiv(KEIN_FILTER)).toBe(false);
  });

  it('sucht in Titel und Ort ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    expect(titel(filtereEinsaetze(zeilen, { ...KEIN_FILTER, suche: 'MARKT' }))).toEqual([
      'Weihnachtsmarkt',
    ]);
    expect(titel(filtereEinsaetze(zeilen, { ...KEIN_FILTER, suche: ' bielefeld ' }))).toEqual([
      'Stadtlauf',
    ]);
    expect(istFilterAktiv({ ...KEIN_FILTER, suche: 'a' })).toBe(true);
    expect(istFilterAktiv({ ...KEIN_FILTER, suche: '  ' })).toBe(false);
  });

  it('filtert fehlende PEP, fehlende VB und ohne HiOrg', () => {
    expect(titel(filtereEinsaetze(zeilen, { ...KEIN_FILTER, pepFehlt: true }))).toEqual([
      'Stadtlauf',
      'Dienst',
    ]);
    expect(titel(filtereEinsaetze(zeilen, { ...KEIN_FILTER, vbFehlt: true }))).toEqual([
      'Weihnachtsmarkt',
      'Dienst',
    ]);
    expect(titel(filtereEinsaetze(zeilen, { ...KEIN_FILTER, ohneHiorg: true }))).toEqual([
      'Dienst',
    ]);
  });

  it('filtert nach Dienst oder Veranstaltung; Einsätze ohne Art fallen dann heraus', () => {
    const mitArt = [
      zeile({ titel: 'Sanitätsdienst', art: 'dienst', herkunft: 'hiorg' }),
      zeile({ titel: 'Sommerfest', art: 'termin', herkunft: 'hiorg' }),
      zeile({ titel: 'Selbst angelegt' }),
    ];
    expect(titel(filtereEinsaetze(mitArt, { ...KEIN_FILTER, art: 'dienst' }))).toEqual([
      'Sanitätsdienst',
    ]);
    expect(titel(filtereEinsaetze(mitArt, { ...KEIN_FILTER, art: 'termin' }))).toEqual([
      'Sommerfest',
    ]);
    expect(filtereEinsaetze(mitArt, KEIN_FILTER)).toHaveLength(3);
    expect(istFilterAktiv({ ...KEIN_FILTER, art: 'dienst' })).toBe(true);
  });

  it('verknüpft Bedingungen mit UND', () => {
    const filter = { ...KEIN_FILTER, pepFehlt: true, vbFehlt: true, suche: 'dienst' };
    expect(titel(filtereEinsaetze(zeilen, filter))).toEqual(['Dienst']);
    expect(filtereEinsaetze(zeilen, { ...filter, ohneHiorg: false, suche: 'markt' })).toEqual([]);
  });
});

describe('gruppiereNachMonat', () => {
  it('gruppiert nach Monat in Listenreihenfolge, „Ohne Datum“ zuletzt', () => {
    const gruppen = gruppiereNachMonat([
      zeile({ titel: 'A', beginn: '2026-11-30T23:30' }),
      zeile({ titel: 'B', beginn: null }),
      zeile({ titel: 'C', beginn: '2026-12-01T00:30' }),
      zeile({ titel: 'D', beginn: '2026-11-02T10:00' }),
    ]);
    expect(gruppen.map((g) => [g.titel, g.eintraege.map((e) => e.titel)])).toEqual([
      ['November 2026', ['A', 'D']],
      ['Dezember 2026', ['C']],
      ['Ohne Datum', ['B']],
    ]);
  });

  it('behält absteigende Reihenfolge und trennt Jahre', () => {
    const gruppen = gruppiereNachMonat([
      zeile({ titel: 'A', beginn: '2026-01-05T10:00' }),
      zeile({ titel: 'B', beginn: '2025-12-31T10:00' }),
    ]);
    expect(gruppen.map((g) => g.schluessel)).toEqual(['2026-01', '2025-12']);
  });

  it('liefert ohne Einträge keine Gruppe', () => {
    expect(gruppiereNachMonat([])).toEqual([]);
  });
});

describe('mitAbstand', () => {
  const vb = { abschnitte: 1, laufzettel: 1, positionen: 1 };

  it('setzt Abstand und Dringlichkeit nur für Anstehendes', () => {
    const liste = [
      zeile({ titel: 'bald fehlt', beginn: '2026-11-19T10:00' }),
      zeile({ titel: 'bald komplett', beginn: '2026-11-19T10:00', pepVorhanden: true, vb }),
      zeile({ titel: 'weit', beginn: '2026-11-20T10:00' }),
      zeile({ titel: 'ohne Datum', beginn: null }),
    ];
    const mit = mitAbstand(liste, JETZT, true);
    expect(mit.map((z) => [z.abstandTage, z.dringend])).toEqual([
      [14, true],
      [14, false],
      [15, false],
      [null, false],
    ]);
    const ohne = mitAbstand(liste, JETZT, false);
    expect(ohne.every((z) => z.abstandTage === null && !z.dringend)).toBe(true);
  });

  it('zeigt für einen laufenden Einsatz mit Beginn vor heute keinen Hinweis', () => {
    expect(
      mitAbstand([zeile({ beginn: '2026-11-04T10:00' })], JETZT, true)[0].abstandTage,
    ).toBeNull();
  });
});
