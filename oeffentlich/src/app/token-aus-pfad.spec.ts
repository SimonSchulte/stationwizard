import { describe, expect, it } from 'vitest';
import { ERFASSUNG_TOKEN_MUSTER, tokenAusPfad } from './token-aus-pfad';

const TOKEN = 'a'.repeat(32);

describe('tokenAusPfad', () => {
  it('liest das Token aus dem öffentlichen Pfad', () => {
    expect(tokenAusPfad(`/e/${TOKEN}`)).toBe(TOKEN);
  });

  it('gibt für jede andere Form null zurück', () => {
    // Wortgleich mit dem Muster im Worker: hier wie dort darf nichts anderes
    // als die 32-stellige Hex-Form durchkommen.
    for (const pfad of [
      '/e/',
      '/e',
      `/e/${TOKEN}/`,
      `/e/${TOKEN}/extra`,
      `/e/${TOKEN}a`,
      `/e/${'A'.repeat(32)}`,
      `/ef/${TOKEN}`,
      '/',
    ]) {
      expect(tokenAusPfad(pfad), pfad).toBeNull();
    }
  });

  it('beschreibt dieselbe Form wie das Muster', () => {
    expect(ERFASSUNG_TOKEN_MUSTER.test(TOKEN)).toBe(true);
    expect(ERFASSUNG_TOKEN_MUSTER.test('A'.repeat(32))).toBe(false);
    expect(ERFASSUNG_TOKEN_MUSTER.test('a'.repeat(31))).toBe(false);
  });
});
