import { describe, expect, it } from 'vitest';
import {
  ansprueche,
  ehrenzeichenErfuellt,
  istErhalten,
  jubilaeumErfuellt,
  leistungsabzeichenErfuellt,
  mitgliedsjahre,
  personSchluessel,
  type Erhalten,
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

  it('staffelt nach Mitgliedsjahren echt größer 4, 6 und 12', () => {
    expect(ehrenzeichenErfuellt(true, 4)).toBeNull();
    expect(ehrenzeichenErfuellt(true, 5)).toBe('ehrenzeichen');
    expect(ehrenzeichenErfuellt(true, 6)).toBe('ehrenzeichen');
    expect(ehrenzeichenErfuellt(true, 7)).toBe('ehrenzeichen-bande');
    expect(ehrenzeichenErfuellt(true, 12)).toBe('ehrenzeichen-bande');
    expect(ehrenzeichenErfuellt(true, 13)).toBe('ehrennadel');
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
    expect(a.ehrenzeichen).toEqual({ erfuellt: 'ehrennadel', faellig: true });
  });

  it('ist nicht mehr fällig, sobald die erfüllte Stufe angehakt ist', () => {
    const a = ansprueche(
      { ...person, erhalten: { gold: 2020, 'jubilaeum-25': null, ehrennadel: 2024 } },
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
