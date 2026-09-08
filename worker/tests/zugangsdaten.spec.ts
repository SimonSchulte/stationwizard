import { describe, expect, it, vi } from 'vitest';
import { leseZugangsdatum } from '../src/zugangsdaten';

describe('Zugangsdaten aus bestehenden Worker-Konfigurationen', () => {
  it('liest klassische Secrets als String', async () => {
    expect(await leseZugangsdatum('erfundener-testwert')).toBe('erfundener-testwert');
  });

  it('löst Secrets-Store-Bindings über get() auf', async () => {
    const get = vi.fn(async () => 'erfundener-store-wert');
    expect(await leseZugangsdatum({ get })).toBe('erfundener-store-wert');
    expect(get).toHaveBeenCalledOnce();
  });

  it('erkennt fehlende Bindings und nicht erreichbare Store-Einträge', async () => {
    expect(await leseZugangsdatum(undefined)).toBeUndefined();
    expect(
      await leseZugangsdatum({ get: vi.fn().mockRejectedValue(new Error('privater-fehler')) }),
    ).toBeUndefined();
  });
});
