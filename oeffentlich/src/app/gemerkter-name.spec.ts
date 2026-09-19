import { afterEach, describe, expect, it, vi } from 'vitest';
import { leseGemerktenNamen, merkeNamen, vergissNamen } from './gemerkter-name';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('gemerkter Name', () => {
  it('merkt, liest und vergisst den Namen', () => {
    expect(leseGemerktenNamen()).toBe('');
    merkeNamen('Maxi Muster');
    expect(leseGemerktenNamen()).toBe('Maxi Muster');
    vergissNamen();
    expect(leseGemerktenNamen()).toBe('');
  });

  it('bleibt benutzbar, wenn der Seitenspeicher gesperrt ist', () => {
    // Privates Fenster oder gesperrte Seitendaten: jeder Zugriff wirft. Die
    // Seite muss trotzdem funktionieren, nur eben ohne Vorbelegung.
    for (const name of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, name).mockImplementation(() => {
        throw new Error('Seitenspeicher gesperrt');
      });
    }
    expect(leseGemerktenNamen()).toBe('');
    expect(() => merkeNamen('Maxi')).not.toThrow();
    expect(() => vergissNamen()).not.toThrow();
  });
});
