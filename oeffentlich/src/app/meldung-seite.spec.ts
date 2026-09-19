import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeldungSeite } from './meldung-seite';

const TOKEN = 'a'.repeat(32);

const FAHRZEUG = {
  bezeichnung: 'MTW Übung 1',
  funkrufname: 'Florian Testort 1/85/1',
  kennzeichen: 'XY-TE 123',
};

function antwort(inhalt: unknown, status = 200): Response {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function erzeuge(pfad = `/e/${TOKEN}`): Promise<MeldungSeite> {
  history.replaceState({}, '', pfad);
  const komponente = TestBed.runInInjectionContext(() => new MeldungSeite());
  await komponente.bereit;
  return komponente;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  history.replaceState({}, '', '/');
});

describe('MeldungSeite', () => {
  it('lädt das Fahrzeug zum Token im Pfad', async () => {
    const holen = vi.spyOn(globalThis, 'fetch').mockResolvedValue(antwort(FAHRZEUG));
    const komponente = await erzeuge();
    expect(komponente.zustand()).toBe('formular');
    expect(komponente.fahrzeug()).toEqual(FAHRZEUG);
    expect(holen.mock.calls[0]?.[0]).toBe(`/api/oeffentlich/meldung/${TOKEN}`);
  });

  it('fragt bei einem unbrauchbaren Pfad gar nicht erst nach', async () => {
    const holen = vi.spyOn(globalThis, 'fetch');
    const komponente = await erzeuge('/e/zu-kurz');
    expect(komponente.zustand()).toBe('unbekannt');
    expect(holen).not.toHaveBeenCalled();
  });

  it('zeigt ein unbekanntes Token als "funktioniert nicht"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      antwort({ code: 'MELDUNG_UNBEKANNT', nachricht: 'unbekannt' }, 404),
    );
    expect((await erzeuge()).zustand()).toBe('unbekannt');
  });

  it('gibt erst frei, wenn Name und Stand gültig sind', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(antwort(FAHRZEUG));
    const komponente = await erzeuge();
    expect(komponente.absendbar()).toBe(false);

    komponente.name.set('M');
    komponente.standRoh.set('12345');
    expect(komponente.absendbar()).toBe(false);

    komponente.name.set('Maxi Muster');
    expect(komponente.absendbar()).toBe(true);

    for (const ungueltig of ['-1', '12,5', '12.5', '10000000', 'abc']) {
      komponente.standRoh.set(ungueltig);
      expect(komponente.absendbar(), ungueltig).toBe(false);
    }

    komponente.standRoh.set('12345');
    komponente.bemerkung.set('x'.repeat(201));
    expect(komponente.absendbar()).toBe(false);
  });

  it('sendet die Meldung und merkt den Namen erst nach Erfolg', async () => {
    const holen = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(antwort(FAHRZEUG))
      .mockResolvedValueOnce(antwort({ status: 'eingereicht' }, 201));
    const komponente = await erzeuge();
    komponente.name.set('  Maxi Muster  ');
    komponente.standRoh.set('12345');
    komponente.bemerkung.set(' Tank voll ');
    await komponente.absenden();

    expect(komponente.zustand()).toBe('gesendet');
    const [pfad, optionen] = holen.mock.calls[1] as [string, RequestInit];
    expect(pfad).toBe(`/api/oeffentlich/meldung/${TOKEN}`);
    expect(JSON.parse(String(optionen.body))).toEqual({
      name: 'Maxi Muster',
      stand: 12345,
      bemerkung: 'Tank voll',
    });
    expect(localStorage.getItem('stationwizard.erfassung.name')).toBe('Maxi Muster');
  });

  it('merkt den Namen nicht, wenn das Senden scheitert', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(antwort(FAHRZEUG))
      .mockResolvedValueOnce(
        antwort({ code: 'MELDUNG_ZU_HAEUFIG', nachricht: 'Bitte warten.' }, 429),
      );
    const komponente = await erzeuge();
    komponente.name.set('Maxi Muster');
    komponente.standRoh.set('12345');
    await komponente.absenden();

    expect(komponente.zustand()).toBe('formular');
    expect(komponente.fehler()).toBe('Bitte warten.');
    expect(localStorage.getItem('stationwizard.erfassung.name')).toBeNull();
  });

  it('belegt den Namen aus dem Seitenspeicher vor und vergisst ihn auf Wunsch', async () => {
    localStorage.setItem('stationwizard.erfassung.name', 'Maxi Muster');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(antwort(FAHRZEUG));
    const komponente = await erzeuge();
    expect(komponente.name()).toBe('Maxi Muster');

    komponente.namenVergessen();
    expect(komponente.name()).toBe('');
    expect(localStorage.getItem('stationwizard.erfassung.name')).toBeNull();
  });

  it('bricht nicht, wenn der Seitenspeicher gesperrt ist', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Seitenspeicher gesperrt');
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(antwort(FAHRZEUG));
    const komponente = await erzeuge();
    expect(komponente.zustand()).toBe('formular');
    expect(komponente.name()).toBe('');
  });
});
