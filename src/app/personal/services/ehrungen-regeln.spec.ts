import { describe, expect, it } from 'vitest';
import {
  ansprueche,
  ehrenzeichenErfuellt,
  istErhalten,
  jubilaeumErfuellt,
  leistungAbgleich,
  leistungsabzeichenErfuellt,
  mitgliedsjahre,
  personSchluessel,
  type Erhalten,
  uhrArtAusAnrede,
  uhrErfuellt,
  zuEhrende,
  stundenLesen,
  stundenTextLesen,
} from './ehrungen-regeln';

describe('Leistungsabzeichen', () => {
  it('vergibt erst bei echt mehr als der Schwelle', () => {
    expect(leistungsabzeichenErfuellt(1000)).toBeNull();
    expect(leistungsabzeichenErfuellt(1000.01)).toBe('bronze');
    expect(leistungsabzeichenErfuellt(2000)).toBe('bronze');
    expect(leistungsabzeichenErfuellt(2000.5)).toBe('silber');
    expect(leistungsabzeichenErfuellt(4000)).toBe('silber');
    expect(leistungsabzeichenErfuellt(4000.01)).toBe('gold');
  });
});

describe('Jubiläumszeichen', () => {
  it('nimmt das höchste erreichte Jubiläum, ab erreicht', () => {
    expect(jubilaeumErfuellt(null)).toBeNull();
    expect(jubilaeumErfuellt(24)).toBeNull();
    expect(jubilaeumErfuellt(25)).toBe('jubilaeum-25');
    expect(jubilaeumErfuellt(39)).toBe('jubilaeum-25');
    expect(jubilaeumErfuellt(40)).toBe('jubilaeum-40');
    expect(jubilaeumErfuellt(50)).toBe('jubilaeum-50');
    expect(jubilaeumErfuellt(61)).toBe('jubilaeum-60');
  });

  it('rechnet Mitgliedsjahre als Kalenderjahrdifferenz und ohne Datum gar nicht', () => {
    expect(mitgliedsjahre('2001-12-31', 2026)).toBe(25);
    expect(mitgliedsjahre(null, 2026)).toBeNull();
  });
});

describe('Ehrenzeichen', () => {
  it('braucht besondere Verdienste und ein Eintrittsdatum', () => {
    expect(ehrenzeichenErfuellt(false, 30)).toBeNull();
    expect(ehrenzeichenErfuellt(true, null)).toBeNull();
  });

  it('staffelt nach Dienstjahren ab 4 und ab 6', () => {
    expect(ehrenzeichenErfuellt(true, 3)).toBeNull();
    expect(ehrenzeichenErfuellt(true, 4)).toBe('ehrenzeichen');
    expect(ehrenzeichenErfuellt(true, 5)).toBe('ehrenzeichen');
    expect(ehrenzeichenErfuellt(true, 6)).toBe('ehrenzeichen-bande');
    expect(ehrenzeichenErfuellt(true, 40)).toBe('ehrenzeichen-bande');
  });

  it('vergibt die Ehrennadel erst 12 Jahre nach der Verleihung des Ehrenzeichens am Bande', () => {
    expect(ehrenzeichenErfuellt(true, 40, { 'ehrenzeichen-bande': 2015 }, 2026)).toBe(
      'ehrenzeichen-bande',
    );
    expect(ehrenzeichenErfuellt(true, 40, { 'ehrenzeichen-bande': 2014 }, 2026)).toBe('ehrennadel');
    expect(ehrenzeichenErfuellt(true, 40, { 'ehrenzeichen-bande': 2000 }, 2026)).toBe('ehrennadel');
  });

  it('kann die Ehrennadel ohne Vergabejahr der Bande oder ohne Verdienste nicht ableiten', () => {
    expect(ehrenzeichenErfuellt(true, 40, { 'ehrenzeichen-bande': null }, 2026)).toBe(
      'ehrenzeichen-bande',
    );
    expect(ehrenzeichenErfuellt(false, 40, { 'ehrenzeichen-bande': 2000 }, 2026)).toBeNull();
  });
});

describe('Ansprüche', () => {
  const person = {
    stunden: 4500,
    eintrittsdatum: '1990-05-01',
    besondereVerdienste: true,
    erhalten: {} as Erhalten,
  };

  it('meldet erfüllte, noch nicht erhaltene Auszeichnungen als fällig', () => {
    const a = ansprueche(person, 2026);
    expect(a.leistung).toEqual({ erfuellt: 'gold', faellig: true });
    expect(a.jubilaeum).toEqual({ erfuellt: 'jubilaeum-25', faellig: true });
    expect(a.ehrenzeichen).toEqual({ erfuellt: 'ehrenzeichen-bande', faellig: true });
  });

  it('ist nicht mehr fällig, sobald die erfüllte Stufe angehakt ist', () => {
    const a = ansprueche(
      { ...person, erhalten: { gold: 2020, 'jubilaeum-25': null, 'ehrenzeichen-bande': 2018 } },
      2026,
    );
    expect(a.leistung.faellig).toBe(false);
    expect(a.jubilaeum.faellig).toBe(false);
    expect(a.ehrenzeichen.faellig).toBe(false);
  });

  it('bleibt fällig, wenn nur eine niedrigere Stufe erhalten ist', () => {
    expect(ansprueche({ ...person, erhalten: { bronze: 2015 } }, 2026).leistung.faellig).toBe(true);
  });
});

describe('Stundenimport', () => {
  it('liest deutsche und Excel-Schreibweise', () => {
    expect(stundenLesen('6.546,98')).toBe(6546.98);
    expect(stundenLesen('947.62')).toBe(947.62);
    expect(stundenLesen('6.546')).toBe(6546);
    expect(stundenLesen('35,25')).toBe(35.25);
    expect(stundenLesen('9')).toBe(9);
    expect(stundenLesen('abc')).toBeNull();
    expect(stundenLesen('1,2,3')).toBeNull();
  });

  it('liest Zeilen „Nachname, Vorname Stunden" und meldet Fehlerzeilen', () => {
    const { eintraege, fehler } = stundenTextLesen(
      [
        'Muster, Max 6.546,98',
        '',
        'Beispiel-Test, Erika Maria\t10,5',
        'Ohne Komma 12',
        'Muster, Anna keine',
        '(gelöschter Benutzer), 947.62',
        'Allein',
      ].join('\n'),
    );
    expect(eintraege).toEqual([
      { nachname: 'Muster', vorname: 'Max', stunden: 6546.98 },
      { nachname: 'Beispiel-Test', vorname: 'Erika Maria', stunden: 10.5 },
    ]);
    expect(fehler.map((f) => f.zeile)).toEqual([4, 5, 6, 7]);
  });

  it('gleicht Namen unabhängig von Groß-/Kleinschreibung und Leerraum ab', () => {
    expect(personSchluessel(' MUSTER ', 'Max  Karl')).toBe(personSchluessel('muster', 'max karl'));
  });
});

describe('Erhaltene Auszeichnungen mit Jahr', () => {
  it('prüft Schlüssel und Vergabejahr', () => {
    expect(istErhalten({})).toBe(true);
    expect(istErhalten({ gold: 2021, bronze: null })).toBe(true);
    expect(istErhalten({ platin: 2021 })).toBe(false);
    expect(istErhalten({ gold: 1850 })).toBe(false);
    expect(istErhalten({ gold: '2021' })).toBe(false);
    expect(istErhalten(['gold'])).toBe(false);
  });
});

describe('Abgleich der Leistungsabzeichen', () => {
  it('passt, wenn das höchste angehakte Abzeichen dem Anspruch entspricht', () => {
    expect(leistungAbgleich(500, {})).toBe('passt');
    expect(leistungAbgleich(4500, { gold: 2020 })).toBe('passt');
    expect(leistungAbgleich(2500, { bronze: null, silber: 2019 })).toBe('passt');
  });

  it('meldet ein fehlendes Abzeichen, auch wenn nur eine niedrigere Stufe angehakt ist', () => {
    expect(leistungAbgleich(4500, {})).toBe('fehlt');
    expect(leistungAbgleich(4500, { bronze: 2015 })).toBe('fehlt');
  });

  it('meldet mehr angehakte Abzeichen, als die Stunden hergeben', () => {
    expect(leistungAbgleich(500, { bronze: 2015 })).toBe('zuviel');
    expect(leistungAbgleich(1200, { gold: 2015 })).toBe('zuviel');
  });
});

describe('Zu Ehrende', () => {
  const person = (nachname: string, ueberschreibung: object = {}) => ({
    nachname,
    vorname: 'Test',
    stunden: 0,
    eintrittsdatum: null,
    besondereVerdienste: false,
    erhalten: {} as Erhalten,
    ...ueberschreibung,
  });

  it('nimmt nur offene Ehrungen auf, je Gruppe die höchste', () => {
    const liste = zuEhrende(
      [
        person('Voll', { stunden: 4500, eintrittsdatum: '1990-05-01', besondereVerdienste: true }),
        person('Erledigt', { stunden: 4500, erhalten: { gold: 2020 } }),
        person('Nichts', { stunden: 100 }),
      ],
      2026,
    );
    expect(liste.map((e) => `${e.nachname}:${e.auszeichnung}`)).toEqual([
      'Voll:gold',
      'Voll:jubilaeum-25',
      'Voll:uhr-30',
      'Voll:ehrenzeichen-bande',
    ]);
  });

  it('nennt Grundlage und bisher Erhaltenes', () => {
    const [eintrag] = zuEhrende(
      [person('Anna', { stunden: 4500.5, erhalten: { bronze: 2012, silber: null } })],
      2026,
    );
    expect(eintrag.grundlage).toBe('4.500,5 Stunden');
    expect(eintrag.bisher).toBe('Bronze 2012, Silber');
  });

  it('sortiert nach Stufe, dann nach Name', () => {
    const liste = zuEhrende(
      [
        person('Zeta', { stunden: 1500 }),
        person('Alpha', { stunden: 1500 }),
        person('Mitte', { stunden: 2500 }),
      ],
      2026,
    );
    expect(liste.map((e) => e.nachname)).toEqual(['Alpha', 'Zeta', 'Mitte']);
  });
});

describe('Jubiläumsuhr', () => {
  it('staffelt ab 30, 40 und 50 Jahren', () => {
    expect(uhrErfuellt(null)).toBeNull();
    expect(uhrErfuellt(29)).toBeNull();
    expect(uhrErfuellt(30)).toBe('uhr-30');
    expect(uhrErfuellt(39)).toBe('uhr-30');
    expect(uhrErfuellt(40)).toBe('uhr-40');
    expect(uhrErfuellt(55)).toBe('uhr-50');
  });

  it('ist fällig, bis die erfüllte Stufe angehakt ist, unabhängig vom Jubiläumszeichen', () => {
    const person = {
      stunden: 0,
      eintrittsdatum: '1990-01-01',
      besondereVerdienste: false,
      erhalten: { 'jubilaeum-25': 2015 } as Erhalten,
    };
    expect(ansprueche(person, 2026).uhr).toEqual({ erfuellt: 'uhr-30', faellig: true });
    expect(ansprueche({ ...person, erhalten: { 'uhr-30': 2021 } }, 2026).uhr.faellig).toBe(false);
  });

  it('erscheint in „Zu Ehrende“ als eigene Gruppe', () => {
    const liste = zuEhrende(
      [
        {
          nachname: 'Alt',
          vorname: 'Anna',
          stunden: 0,
          eintrittsdatum: '1980-01-01',
          besondereVerdienste: false,
          erhalten: {},
        },
      ],
      2026,
    );
    expect(liste.map((e) => `${e.gruppe}:${e.auszeichnung}`)).toEqual([
      'Jubiläumszeichen:jubilaeum-40',
      'Jubiläumsuhr:uhr-40',
    ]);
  });

  it('leitet Damen-/Herrenuhr nur aus eindeutiger Anrede ab', () => {
    expect(uhrArtAusAnrede('Frau')).toBe('Damen');
    expect(uhrArtAusAnrede(' herr ')).toBe('Herren');
    expect(uhrArtAusAnrede('Divers')).toBeNull();
    expect(uhrArtAusAnrede('')).toBeNull();
    expect(uhrArtAusAnrede(undefined)).toBeNull();
  });
});
