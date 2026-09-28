import { describe, expect, it } from 'vitest';
import { checkTokenAusPfad, tokenAusPfad } from './pfad';

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

describe('checkTokenAusPfad', () => {
  it('liest das Token aus einem gültigen Checkpfad', () => {
    expect(checkTokenAusPfad(`/c/${TOKEN}`)).toBe(TOKEN);
  });

  it.each([
    ['/c/'],
    ['/c'],
    [`/c/${TOKEN}/extra`],
    [`/c/${TOKEN.slice(0, 31)}`],
    [`/c/${TOKEN}a`],
    [`/c/${TOKEN.toUpperCase()}`],
    [`/cc/${TOKEN}`],
    [`/e/${TOKEN}`],
  ])('weist %s ab', (pfad) => {
    expect(checkTokenAusPfad(pfad)).toBeNull();
  });
});

describe('tokenAusPfad und checkTokenAusPfad', () => {
  it('halten die beiden öffentlichen Wege auseinander', () => {
    expect(tokenAusPfad(`/e/${TOKEN}`)).toBe(TOKEN);
    expect(checkTokenAusPfad(`/e/${TOKEN}`)).toBeNull();
    expect(tokenAusPfad(`/c/${TOKEN}`)).toBeNull();
    expect(checkTokenAusPfad(`/c/${TOKEN}`)).toBe(TOKEN);
  });
});
