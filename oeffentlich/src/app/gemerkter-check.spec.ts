import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Checkstand } from '../../../src/app/material/models/check.model';
import { leseCheckEntwurf, merkeCheckEntwurf, vergissCheckEntwurf } from './gemerkter-check';

const TOKEN = 'a'.repeat(32);

function stand(): Checkstand {
  return {
    behaelterId: 'oeffentlich',
    verfallsdatumErfasst: true,
    bemerkung: 'halb fertig',
    positionen: {
      a1: {
        artikelId: 'a1',
        geprueft: true,
        istMenge: 1,
        unbrauchbar: false,
        verfallsdaten: [null],
      },
    },
  };
}

describe('gemerkter-check', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('gibt einen gemerkten Stand wieder heraus', () => {
    merkeCheckEntwurf(TOKEN, stand());
    expect(leseCheckEntwurf(TOKEN)?.stand.bemerkung).toBe('halb fertig');
  });

  it('hält die Stände verschiedener Token auseinander', () => {
    merkeCheckEntwurf(TOKEN, stand());
    expect(leseCheckEntwurf('b'.repeat(32))).toBeNull();
  });

  it('vergisst einen Stand auf Verlangen', () => {
    merkeCheckEntwurf(TOKEN, stand());
    vergissCheckEntwurf(TOKEN);
    expect(leseCheckEntwurf(TOKEN)).toBeNull();
  });

  it('verwirft einen Stand, der älter als einen Tag ist', () => {
    localStorage.setItem(
      `stationwizard.check.entwurf.${TOKEN}`,
      JSON.stringify({
        gespeichertAm: new Date(Date.now() - 25 * 3_600_000).toISOString(),
        stand: stand(),
      }),
    );
    expect(leseCheckEntwurf(TOKEN)).toBeNull();
  });

  it('verwirft unlesbaren Inhalt, statt zu werfen', () => {
    localStorage.setItem(`stationwizard.check.entwurf.${TOKEN}`, 'kein JSON');
    expect(leseCheckEntwurf(TOKEN)).toBeNull();
    expect(localStorage.getItem(`stationwizard.check.entwurf.${TOKEN}`)).toBeNull();
  });

  it('kommt ohne Seitenspeicher aus, statt die Seite scheitern zu lassen', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt');
    });
    expect(() => merkeCheckEntwurf(TOKEN, stand())).not.toThrow();
    expect(leseCheckEntwurf(TOKEN)).toBeNull();
  });
});
