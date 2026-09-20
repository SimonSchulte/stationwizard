import { describe, expect, it } from 'vitest';
import { erzeugeTestPreiskatalogEintrag } from '../testing/preiskatalog-testdaten';
import { istPreiskatalogEintrag } from './preiskatalog-pruefung';

describe('istPreiskatalogEintrag', () => {
  it('akzeptiert einen gültigen Eintrag', () => {
    expect(istPreiskatalogEintrag(erzeugeTestPreiskatalogEintrag())).toBe(true);
  });

  it('lehnt eine unbekannte art ab', () => {
    expect(
      istPreiskatalogEintrag(erzeugeTestPreiskatalogEintrag({ art: 'unbekannt' as never })),
    ).toBe(false);
  });

  it('lehnt einen negativen Preis ab', () => {
    expect(istPreiskatalogEintrag(erzeugeTestPreiskatalogEintrag({ einzelpreisCent: -1 }))).toBe(
      false,
    );
  });

  it('lehnt einen nicht-ganzzahligen Preis ab', () => {
    expect(istPreiskatalogEintrag(erzeugeTestPreiskatalogEintrag({ einzelpreisCent: 12.5 }))).toBe(
      false,
    );
  });

  it('lehnt eine fehlende Version ab', () => {
    expect(istPreiskatalogEintrag(erzeugeTestPreiskatalogEintrag({ version: 0 }))).toBe(false);
  });

  it('lehnt eine leere Bezeichnung ab', () => {
    expect(istPreiskatalogEintrag(erzeugeTestPreiskatalogEintrag({ bezeichnung: '  ' }))).toBe(
      false,
    );
  });

  it('lehnt Nicht-Objekte ab', () => {
    expect(istPreiskatalogEintrag(null)).toBe(false);
    expect(istPreiskatalogEintrag('text')).toBe(false);
    expect(istPreiskatalogEintrag([])).toBe(false);
  });
});
