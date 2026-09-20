import { describe, expect, it } from 'vitest';
import {
  erzeugeTestAngebot,
  erzeugeTestPosition,
  erzeugeTestSchicht,
} from '../testing/angebot-testdaten';
import { angebotAlsHtmlTabelle, angebotAlsKlartextTabelle } from './angebot-word-export';

const ANGEBOT = erzeugeTestAngebot({
  schichten: [
    erzeugeTestSchicht({
      von: '08:00',
      bis: '20:00',
      positionen: [
        erzeugeTestPosition({
          art: 'einsatzkraft',
          bezeichnung: 'Sanitätshelfer',
          einzelpreisCent: 1200,
          anzahl: 2,
          stunden: 1,
        }),
        erzeugeTestPosition({
          art: 'fahrzeug',
          bezeichnung: 'Krankentransportwagen',
          einzelpreisCent: 5000,
          anzahl: 1,
          stunden: null,
        }),
      ],
    }),
  ],
});

describe('angebotAlsKlartextTabelle', () => {
  it('enthält die Kopfzeile und beide Beispielpositionen mit ihren Werten', () => {
    const text = angebotAlsKlartextTabelle(ANGEBOT);
    expect(text).toContain('Pos.\tBezeichnung\tEinzelpreis\tAnzahl\tStunde(n)\tGesamt');
    expect(text).toContain('Sanitätshelfer');
    expect(text).toContain('24,00');
    expect(text).toContain('Krankentransportwagen');
    expect(text).toContain('50,00');
  });

  it('zeigt bei einem aktiven Pauschalpreis sowohl den Pauschal- als auch den rechnerischen Wert', () => {
    const text = angebotAlsKlartextTabelle({
      ...ANGEBOT,
      pauschalpreisAktiv: true,
      pauschalpreisCent: 10_000,
    });
    expect(text).toContain('Gesamt (Pauschalpreis)');
    expect(text).toContain('rechnerisch');
    expect(text).toContain('100,00');
  });
});

describe('angebotAlsHtmlTabelle', () => {
  it('erzeugt eine echte HTML-Tabelle mit Kopfzeile und Positionen', () => {
    const html = angebotAlsHtmlTabelle(ANGEBOT);
    expect(html).toContain('<table');
    expect(html).toContain('<thead>');
    expect(html).toContain('Sanitätshelfer');
    expect(html).toContain('Krankentransportwagen');
  });

  it('escaped Sonderzeichen in der Bezeichnung', () => {
    const angebot = erzeugeTestAngebot({
      schichten: [
        erzeugeTestSchicht({
          positionen: [erzeugeTestPosition({ bezeichnung: '<script>alert(1)</script>' })],
        }),
      ],
    });
    const html = angebotAlsHtmlTabelle(angebot);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('hebt die Gesamtzeile mit einer Inline-Auszeichnung hervor, nicht nur per CSS-Klasse', () => {
    const html = angebotAlsHtmlTabelle(ANGEBOT);
    expect(html).toMatch(/style="font-weight:700"/);
  });
});
