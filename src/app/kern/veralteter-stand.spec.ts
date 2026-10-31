import { describe, expect, it } from 'vitest';
import { istVeralteterChunk, neuladenErlaubt } from './veralteter-stand';

function speicher(): Storage {
  const daten = new Map<string, string>();
  return {
    getItem: (k: string) => daten.get(k) ?? null,
    setItem: (k: string, v: string) => void daten.set(k, v),
  } as unknown as Storage;
}

describe('veralteter Stand', () => {
  it('erkennt den Chunk-Ladefehler der gängigen Browser', () => {
    expect(
      istVeralteterChunk(
        new TypeError('Failed to fetch dynamically imported module: https://x/a.js'),
      ),
    ).toBe(true);
    expect(istVeralteterChunk(new Error('error loading dynamically imported module'))).toBe(true);
    expect(istVeralteterChunk(new Error('Importing a module script failed.'))).toBe(true);
    expect(istVeralteterChunk(new Error('HTTP 500'))).toBe(false);
  });

  it('lädt höchstens einmal je 30 Sekunden neu (keine Schleife)', () => {
    const s = speicher();
    expect(neuladenErlaubt(s, 1_000_000)).toBe(true);
    expect(neuladenErlaubt(s, 1_010_000)).toBe(false);
    expect(neuladenErlaubt(s, 1_031_000)).toBe(true);
  });
});
