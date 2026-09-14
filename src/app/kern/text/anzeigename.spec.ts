import { describe, expect, it } from 'vitest';
import { anzeigenameAusEmail, initialenAusAnzeigename } from './anzeigename';

describe('Anzeigename aus E-Mail-Adresse', () => {
  it('leitet Vor- und Nachname aus einem punktgetrennten Postfach ab', () => {
    expect(anzeigenameAusEmail('max.mustermann@juh-beispiel.de')).toBe('Max Mustermann');
  });

  it('normalisiert Großschreibung im Postfach', () => {
    expect(anzeigenameAusEmail('ERIKA.MUSTERFRAU@beispiel.de')).toBe('Erika Musterfrau');
  });

  it('erkennt Unterstrich, Punkt, Bindestrich und Plus als Trenner', () => {
    expect(anzeigenameAusEmail('anna_maria-schulz+test@beispiel.de')).toBe(
      'Anna Maria Schulz Test',
    );
  });

  it('fällt bei einem einzelnen Wort auf dieses zurück', () => {
    expect(anzeigenameAusEmail('uebung@example.invalid')).toBe('Uebung');
  });

  it('fällt ohne verwertbares Postfach auf die vollständige Adresse zurück', () => {
    expect(anzeigenameAusEmail('...@beispiel.de')).toBe('...@beispiel.de');
  });
});

describe('Initialen aus Anzeigename', () => {
  it('bildet Initialen aus Vor- und Nachname', () => {
    expect(initialenAusAnzeigename('Max Mustermann')).toBe('MM');
  });

  it('bildet die Initiale aus einem einzelnen Wort', () => {
    expect(initialenAusAnzeigename('Uebung')).toBe('U');
  });

  it('nimmt bei mehreren Vornamen den ersten und letzten Namensteil', () => {
    expect(initialenAusAnzeigename('Anna Maria Schulz Test')).toBe('AT');
  });

  it('liefert bei leerem Namen einen Platzhalter', () => {
    expect(initialenAusAnzeigename('   ')).toBe('?');
  });
});
