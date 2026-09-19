import { describe, expect, it } from 'vitest';
import {
  ERFASSUNG_TOKEN_MUSTER,
  erzeugeErfassungToken,
  gleichInKonstanterZeit,
} from '../src/erfassung-token';

describe('erzeugeErfassungToken', () => {
  it('erzeugt 32 Zeichen Kleinbuchstaben-Hex', () => {
    const token = erzeugeErfassungToken();
    expect(token).toMatch(ERFASSUNG_TOKEN_MUSTER);
    expect(token).toHaveLength(32);
  });

  it('wiederholt sich über viele Ziehungen nicht', () => {
    const gesehen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) gesehen.add(erzeugeErfassungToken());
    expect(gesehen.size).toBe(2000);
  });

  it('bildet dieselbe Form wie die Rückfüllung der Migration 0007', () => {
    // lower(hex(randomblob(16))) liefert genau dieses Muster; weicht eine der
    // beiden Seiten ab, findet der öffentliche Pfad den Bestand nicht mehr.
    const migrationsform = /^[0-9a-f]{32}$/;
    expect(erzeugeErfassungToken()).toMatch(migrationsform);
  });
});

describe('gleichInKonstanterZeit', () => {
  it('erkennt Gleichheit', () => {
    const token = erzeugeErfassungToken();
    expect(gleichInKonstanterZeit(token, token)).toBe(true);
  });

  it('weist ungleiche Länge ab', () => {
    expect(gleichInKonstanterZeit('abc', 'abcd')).toBe(false);
    expect(gleichInKonstanterZeit('', 'a')).toBe(false);
  });

  it('weist einen Unterschied an erster wie an letzter Stelle ab', () => {
    expect(gleichInKonstanterZeit('0abcdef0', '1abcdef0')).toBe(false);
    expect(gleichInKonstanterZeit('0abcdef0', '0abcdef1')).toBe(false);
  });
});
