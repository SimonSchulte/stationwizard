import { describe, expect, it } from 'vitest';
import { starkesEtag, versionAusEtag } from '../src/etag';

describe('starkesEtag', () => {
  it('gibt die Version immer als starken ETag aus', () => {
    expect(starkesEtag(1)).toBe('"1"');
    expect(starkesEtag(42)).toBe('"42"');
  });
});

describe('versionAusEtag', () => {
  it('liest die Version aus einem starken ETag', () => {
    expect(versionAusEtag('"1"')).toBe(1);
    expect(versionAusEtag('"42"')).toBe(42);
  });

  // Der eigentliche Anlass: Cloudflare wandelt den starken ETag unterwegs in
  // einen schwachen um, sobald es die Antwort komprimiert. Genau diese Form
  // kommt aus dem Browser als If-Match zurück.
  it('liest die Version auch aus einem abgeschwächten ETag', () => {
    expect(versionAusEtag('W/"1"')).toBe(1);
    expect(versionAusEtag('W/"42"')).toBe(42);
  });

  it('weist alles zurück, aus dem sich keine Version ergibt', () => {
    for (const wert of [
      '',
      '1',
      '"1',
      '1"',
      '""',
      '"abc"',
      'W/"abc"',
      'w/"1"',
      '*',
      '"0"',
      '"-1"',
      '"1.5"',
      '"0x10"',
      '"1e3"',
      '"1", "2"',
    ]) {
      expect(versionAusEtag(wert), wert).toBeNull();
    }
  });
});
