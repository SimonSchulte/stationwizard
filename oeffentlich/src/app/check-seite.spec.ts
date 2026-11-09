import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckSeite } from './check-seite';
import { leseCheckEntwurf } from './gemerkter-check';

const TOKEN = 'b'.repeat(32);

const BEHAELTER = {
  behaelterBezeichnung: 'Erfundener Rucksack',
  fahrzeugBezeichnung: 'MTW Übung 1',
  fahrzeugFunkrufname: 'Florian Testort 1/85/1',
  vorlage: {
    bezeichnung: 'Erfundene Vorlage',
    faecher: [
      {
        id: 'f1',
        bezeichnung: 'Fach 1',
        artikel: [
          {
            id: 'a1',
            bezeichnung: 'Erfundener Artikel',
            sollMenge: 2,
            einheit: 'Stk',
            herkunft: 'land',
            verfallsdatumPflicht: false,
          },
        ],
      },
    ],
  },
};

async function erzeuge(): Promise<CheckSeite> {
  history.replaceState({}, '', `/c/${TOKEN}`);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(BEHAELTER), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const seite = TestBed.runInInjectionContext(() => new CheckSeite());
  await seite.bereit;
  return seite;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  history.replaceState({}, '', '/');
});

describe('CheckSeite – Zwischenstand', () => {
  it('schreibt entprellt und sofort, sobald die Seite in den Hintergrund geht', async () => {
    const seite = await erzeuge();
    seite.umschalten('a1');
    expect(leseCheckEntwurf(TOKEN)).toBeNull();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    expect(leseCheckEntwurf(TOKEN)?.stand.positionen['a1']?.geprueft).toBe(true);
  });

  it('schreibt einen verworfenen Entwurf nicht nachträglich wieder', async () => {
    vi.useFakeTimers();
    const seite = await erzeuge();
    seite.umschalten('a1');
    seite.entwurfVerwerfen();

    vi.advanceTimersByTime(5000);
    seite.sofortSichern();

    expect(leseCheckEntwurf(TOKEN)).toBeNull();
  });
});
