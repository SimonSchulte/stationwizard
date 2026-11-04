import { describe, expect, it } from 'vitest';
import { versionAlsZahl } from './einsatzplanung-version';

describe('versionAlsZahl', () => {
  it('liest starke und schwache ETags', () => {
    expect(versionAlsZahl('"3"')).toBe(3);
    expect(versionAlsZahl('W/"12"')).toBe(12);
  });

  it('lehnt alles andere ab', () => {
    for (const wert of ['3', '"0"', '"abc"', '"-1"', '', '*']) {
      expect(versionAlsZahl(wert)).toBeNull();
    }
  });
});
