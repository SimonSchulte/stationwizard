import { describe, expect, it } from 'vitest';
import { AufbauKistenEintrag } from '../models/aufbau.model';
import { baueAufbauInhalt } from './packliste-aufbau';
import { istAufbauInhalt } from './aufbau-pruefung';
import { liesMenge, leitePacklisteAb, PacklisteZeile } from './packliste-import';

let zeilenNummer = 1;
function zeile(
  anzahl: unknown,
  material: string,
  lagerort: string,
  transportMit: string,
  lagerplatz = '',
): PacklisteZeile {
  zeilenNummer += 1;
  return { zeile: zeilenNummer, anzahl, material, lagerort, lagerplatz, transportMit };
}

/** Erfundene, aber gleich gebaute Liste: Fahrzeug → Wagen → Kiste → Artikel. */
function beispiel(): PacklisteZeile[] {
  zeilenNummer = 1;
  return [
    zeile(3, 'Kabeltrommel', 'Technik-Lager', 'Gitterwagen', 'Regal'),
    zeile(1, 'Leiter', '', 'Testfahrzeug A'),
    zeile('80-90', 'Saft, Liter', 'Getränkelager (Palette)', 'Testfahrzeug B'),
    zeile(1, 'Gitterwagen', '', 'Testfahrzeug A'),
    zeile(1, 'Kiste "Werkzeug"', 'Technik-Lager', 'Gitterwagen', 'Spind'),
    zeile(2, 'Hammer', 'Technik-Lager', 'Kiste "Werkzeug"'),
    zeile(10, 'Nägel', 'Technik-Lager', 'Kiste "Werkzeug"'),
    zeile(2, 'Kiste "Hygiene"', 'Küchenlager', 'Testfahrzeug B'),
    zeile(1, 'Kiste "Gewürze"', '', 'Testfahrzeug B'),
    zeile(1, 'Salz', 'Küchenlager', 'Kiste "Gewürze"'),
    zeile(1, 'Pfeffer', 'Küchenlager', 'Kiste "Gewürze"'),
    zeile(1, 'Spülmodul', 'Küchenlager', 'Testfahrzeug B'),
    zeile(1, 'Seife', 'Küchenlager', 'Spülmodul'),
  ];
}

describe('liesMenge', () => {
  it('nimmt Zahlen, Spannen und Text und meldet Unklares', () => {
    expect(liesMenge(5)).toEqual({ menge: 5, bemerkung: '', warnung: null });
    expect(liesMenge('2,5')).toMatchObject({ menge: 2.5, warnung: null });
    expect(liesMenge('80-90')).toEqual({ menge: 85, bemerkung: '80–90', warnung: null });
    expect(liesMenge('div')).toMatchObject({ menge: 1, bemerkung: 'div' });
    expect(liesMenge('div').warnung).not.toBeNull();
    expect(liesMenge(undefined)).toMatchObject({ menge: 1, bemerkung: 'Menge klären' });
    expect(liesMenge(0).warnung).not.toBeNull();
  });
});

describe('leitePacklisteAb', () => {
  it('ordnet Fahrzeuge, Wagen, Kisten und Artikel nach „Transport mit“', () => {
    const { plan, zahlen, warnungen } = leitePacklisteAb(beispiel());
    expect(plan.einheiten.map((e) => [e.typ, e.name])).toEqual([
      ['fahrzeug', 'Testfahrzeug A'],
      ['fahrzeug', 'Testfahrzeug B'],
    ]);
    const a = plan.einheiten[0]!;
    // Behälter zuerst (wie auf dem Zettel), dann lose Artikel: der Wagen mit Kiste und Kabeltrommel, dann die Leiter.
    expect(a.eintraege.map((e) => [e.art, e.name])).toEqual([
      ['wagen', 'Gitterwagen'],
      ['frei', 'Leiter'],
    ]);
    const wagen = a.eintraege[0]!;
    expect(wagen.art === 'wagen' && wagen.eintraege.map((e) => e.name)).toEqual([
      'Werkzeug',
      'Kabeltrommel',
    ]);
    const werkzeug = (wagen.art === 'wagen' ? wagen.eintraege : []).find((e) => e.art === 'kiste');
    expect(werkzeug).toMatchObject({
      name: 'Werkzeug',
      lager: 'Technik-Lager',
      platz: 'Spind',
      standard: false,
    });
    expect(werkzeug?.art === 'kiste' && werkzeug.inhalt.map((p) => [p.name, p.menge])).toEqual([
      ['Hammer', 2],
      ['Nägel', 10],
    ]);
    expect(zahlen).toMatchObject({ fahrzeuge: 2, wagen: 1, kisten: 4, artikel: 3, positionen: 5 });
    expect(warnungen).toEqual([]);
  });

  it('macht Kisten ohne Inhalt zu Standard-Kisten und erbt das Lager vom Inhalt', () => {
    const { plan } = leitePacklisteAb(beispiel());
    const b = plan.einheiten[1]!;
    const kisten = b.eintraege.filter(
      (e): e is Extract<typeof e, { art: 'kiste' }> => e.art === 'kiste',
    );
    expect(kisten.map((k) => [k.name, k.anzahl, k.standard, k.lager])).toEqual([
      ['Hygiene', 2, true, 'Küchenlager'],
      ['Gewürze', 1, false, 'Küchenlager'],
      ['Spülmodul', 1, false, 'Küchenlager'],
    ]);
  });

  it('sammelt Lager in der Reihenfolge des Vorkommens (Behälter zuerst) und trennt Platz in Klammern ab', () => {
    const { plan } = leitePacklisteAb(beispiel());
    expect(plan.lager).toEqual([
      { name: 'Technik-Lager', plaetze: ['Spind', 'Regal'] },
      { name: 'Küchenlager', plaetze: [] },
      { name: 'Getränkelager', plaetze: ['Palette'] },
    ]);
  });

  it('übernimmt eine Spanne als Menge mit Bemerkung', () => {
    const { plan } = leitePacklisteAb(beispiel());
    const saft = plan.einheiten[1]!.eintraege.find((e) => e.art === 'frei');
    expect(saft).toMatchObject({ name: 'Saft, Liter', menge: 85, bemerkung: '80–90' });
  });

  it('unterscheidet eine Kiste von einem gleich benannten Artikel', () => {
    zeilenNummer = 1;
    const { plan, warnungen } = leitePacklisteAb([
      zeile(1, 'Kiste "Kocher"', 'Lager', 'Fahrzeug Y'),
      zeile(2, 'Kocher', 'Lager', 'Kiste "Kocher"'),
    ]);
    const kiste = plan.einheiten[0]!.eintraege[0]!;
    expect(kiste).toMatchObject({ art: 'kiste', name: 'Kocher' });
    expect(kiste.art === 'kiste' && kiste.inhalt).toEqual([
      { name: 'Kocher', menge: 2, bemerkung: '' },
    ]);
    expect(warnungen).toEqual([]);
  });

  it('verliert nichts: fehlendes Ziel, Kiste ohne Zeile und Kiste in Kiste landen mit Warnung', () => {
    zeilenNummer = 1;
    const ergebnis = leitePacklisteAb([
      zeile(1, 'Fahrzeug-Helm', 'Lager', 'Fahrzeug X'),
      zeile(1, 'Schraube', 'Lager', ''),
      zeile(4, 'Dübel', 'Lager', 'Kiste "Befestigung"'),
      zeile(1, 'Kiste "Innen"', 'Lager', 'Kiste "Aussen"'),
      zeile(1, 'Kiste "Aussen"', 'Lager', 'Fahrzeug X'),
      zeile(7, 'Klebeband', 'Lager', 'Kiste "Innen"'),
    ]);
    const x = ergebnis.plan.einheiten.find((e) => e.name === 'Fahrzeug X')!;
    const aussen = x.eintraege.find((e) => e.art === 'kiste');
    expect(aussen?.name).toBe('Aussen');
    expect(aussen?.art === 'kiste' && aussen.inhalt.map((p) => p.name)).toContain('Innen');
    const ohneZiel = ergebnis.plan.einheiten.find((e) => e.name.startsWith('Ohne Ziel'))!;
    expect(ohneZiel.eintraege.map((e) => e.name)).toEqual(['Schraube', 'Dübel']);
    expect(ergebnis.warnungen.join('\n')).toContain('Kein Ziel');
    expect(ergebnis.warnungen.join('\n')).toContain('keine eigene Zeile');
    expect(ergebnis.warnungen.join('\n')).toContain('nicht in einer Kiste stehen');
  });
});

describe('baueAufbauInhalt', () => {
  const aufloesen = (lager: string | null, platz: string | null) => ({
    lagerId: lager ? `00000000-0000-4000-8000-${String(lager.length).padStart(12, '0')}` : null,
    platzId: platz
      ? `00000000-0000-4000-8000-${String(900 + platz.length).padStart(12, '0')}`
      : null,
  });

  it('erzeugt einen gültigen Aufbau-Inhalt mit Farben, Plätzen und Standard-Kisten', () => {
    const inhalt = baueAufbauInhalt(leitePacklisteAb(beispiel()).plan, aufloesen);
    expect(istAufbauInhalt(inhalt)).toBe(true);
    expect(inhalt.einheiten.map((e) => e.farbe)).toEqual(['abschnitt-1', 'abschnitt-2']);
    const hygiene = inhalt.einheiten[1]!.inhalt.find(
      (e) => e.art === 'kiste' && e.name === 'Hygiene',
    ) as AufbauKistenEintrag;
    expect(hygiene).toMatchObject({ anzahl: 2, standardInhalt: true, inhalt: [] });
    const wagen = inhalt.einheiten[0]!.inhalt.find((e) => e.art === 'wagen');
    expect(wagen?.art === 'wagen' && wagen.einheit.farbe).toBe('abschnitt-1');
    const trommel = wagen?.art === 'wagen' ? wagen.einheit.inhalt.at(-1) : undefined;
    expect(trommel).toMatchObject({ art: 'frei', name: 'Kabeltrommel' });
    expect(trommel && 'platzId' in trommel).toBe(true);
  });

  it('lässt den Platz weg, wenn es kein Lager gibt', () => {
    const inhalt = baueAufbauInhalt(leitePacklisteAb(beispiel()).plan, () => ({
      lagerId: null,
      platzId: 'egal',
    }));
    expect(istAufbauInhalt(inhalt)).toBe(true);
    expect(JSON.stringify(inhalt)).not.toContain('platzId');
  });
});
