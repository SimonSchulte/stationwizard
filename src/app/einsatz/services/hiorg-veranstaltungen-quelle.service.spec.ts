import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { HiorgVeranstaltungenQuelle } from './hiorg-veranstaltungen-quelle.service';

/** Feed-Eintrag im Rohformat der Worker-Antwort; 2026-12-05 10:00–20:30 Berliner Zeit. */
function roh(id: number, name: string, typ: 'dienst' | 'termin' = 'dienst') {
  return {
    id,
    sortdate: Date.parse('2026-12-05T09:00:00Z') / 1000,
    enddate: Date.parse('2026-12-05T19:30:00Z') / 1000,
    verbez: name,
    typ,
  };
}

describe('HiorgVeranstaltungenQuelle', () => {
  const json = vi.fn();
  let quelle: HiorgVeranstaltungenQuelle;

  beforeEach(() => {
    json.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: WorkerClient, useValue: { json, zustand: () => 'erreichbar' } }],
    });
    quelle = TestBed.inject(HiorgVeranstaltungenQuelle);
  });

  it('fragt den Feed für ein Vorwärts- und ein Rückwärtsfenster ab und führt sie zusammen', async () => {
    json.mockImplementation(async (pfad: string) => ({
      status: 'OK',
      eintraege: pfad.includes('monat=2026-05') ? [roh(1, 'Alt')] : [roh(2, 'Neu')],
    }));

    await quelle.laden();

    const pfade = json.mock.calls.map((aufruf) => aufruf[0] as string);
    expect(pfade).toHaveLength(2);
    expect(pfade.every((p) => /^\/api\/hiorg\/kalender\?monat=\d{4}-\d{2}$/.test(p))).toBe(true);
    expect(quelle.zustand()).toBe('geladen');
    expect(quelle.fehler()).toBe('');
    expect(quelle.erreichbar()).toBe(true);
    expect(
      quelle
        .veranstaltungen()
        .map((v) => v.titel)
        .sort(),
    ).toEqual(['Alt', 'Neu'].sort());
    expect(quelle.veranstaltung('dienst-2')?.beginn).toBe('2026-12-05T10:00');
    expect(quelle.veranstaltung('dienst-99')).toBeNull();
  });

  it('meldet einen nicht eingerichteten Feed als Hinweis, nicht als Fehler', async () => {
    json.mockRejectedValue(new WorkerFehler('nicht eingerichtet', 503));
    await quelle.laden();
    expect(quelle.zustand()).toBe('nicht-konfiguriert');
    expect(quelle.fehler()).toContain('nicht eingerichtet');
    expect(quelle.erreichbar()).toBe(false);
    expect(quelle.veranstaltungen()).toEqual([]);
  });

  it('behält bei einem fehlenden Fenster die übrigen Einträge, meldet aber den Fehler', async () => {
    json.mockImplementation(async (pfad: string) => {
      if (pfad.includes('monat=2026-05')) throw new WorkerFehler('kaputt', 502);
      return { status: 'OK', eintraege: [roh(2, 'Neu')] };
    });
    await quelle.laden();
    expect(quelle.zustand()).toBe('fehler');
    expect(quelle.fehler()).toBe('kaputt');
    expect(quelle.veranstaltungen()).toHaveLength(1);
  });

  it('bündelt gleichzeitige Aufrufe und lädt in sicherstellenGeladen nur einmal', async () => {
    json.mockResolvedValue({ status: 'OK', eintraege: [] });
    await Promise.all([quelle.laden(), quelle.laden()]);
    expect(json).toHaveBeenCalledTimes(2);
    await quelle.sicherstellenGeladen();
    expect(json).toHaveBeenCalledTimes(2);
  });
});
