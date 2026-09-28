import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Checkstand } from '../models/check.model';
import { leseEntwurf, merkeEntwurf, vergissEntwurf } from './check-entwurf';

function stand(behaelterId = 'b1'): Checkstand {
  return {
    behaelterId,
    verfallsdatumErfasst: true,
    bemerkung: '',
    positionen: {
      a1: {
        artikelId: 'a1',
        geprueft: true,
        istMenge: 2,
        unbrauchbar: false,
        verfallsdaten: [null],
      },
    },
  };
}

describe('check-entwurf', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('gibt einen gemerkten Stand unverändert zurück', () => {
    merkeEntwurf(stand());
    expect(leseEntwurf('b1')?.stand.positionen['a1']?.geprueft).toBe(true);
  });

  it('liefert null, wenn nichts gemerkt ist', () => {
    expect(leseEntwurf('b1')).toBeNull();
  });

  it('vergisst einen Stand auf Verlangen', () => {
    merkeEntwurf(stand());
    vergissEntwurf('b1');
    expect(leseEntwurf('b1')).toBeNull();
  });

  it('hält die Stände verschiedener Behälter auseinander', () => {
    merkeEntwurf(stand('b1'));
    merkeEntwurf(stand('b2'));
    vergissEntwurf('b1');
    expect(leseEntwurf('b1')).toBeNull();
    expect(leseEntwurf('b2')).not.toBeNull();
  });

  it('verwirft einen Stand, der zu einem anderen Behälter gehört', () => {
    localStorage.setItem(
      'stationwizard.materialcheck.b1',
      JSON.stringify({ gespeichertAm: new Date().toISOString(), stand: stand('b2') }),
    );
    expect(leseEntwurf('b1')).toBeNull();
    expect(localStorage.getItem('stationwizard.materialcheck.b1')).toBeNull();
  });

  it('verwirft einen zu alten Stand, statt veraltete Zahlen anzubieten', () => {
    const alt = new Date(Date.now() - 8 * 86_400_000).toISOString();
    localStorage.setItem(
      'stationwizard.materialcheck.b1',
      JSON.stringify({ gespeichertAm: alt, stand: stand() }),
    );
    expect(leseEntwurf('b1')).toBeNull();
  });

  it('verwirft unlesbaren Inhalt, statt zu werfen', () => {
    localStorage.setItem('stationwizard.materialcheck.b1', 'kein JSON');
    expect(leseEntwurf('b1')).toBeNull();
    expect(localStorage.getItem('stationwizard.materialcheck.b1')).toBeNull();
  });

  it('kommt ohne Seitenspeicher aus, statt die Seite scheitern zu lassen', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt');
    });
    expect(() => merkeEntwurf(stand())).not.toThrow();
    expect(leseEntwurf('b1')).toBeNull();
  });
});
