import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { WorkerFehler } from '../../../kern/worker-client';
import { leererTermin } from '../../models/plan.model';
import { schreibeArbeitsmappe } from '../../services/excel-schreiben';
import { KalenderDatenService } from '../../services/kalender-daten.service';
import { ApiKalenderStorage } from '../../storage/api-kalender-storage';
import { KalenderBereitsBefuelltFehler } from '../../storage/kalender-storage';
import { KalenderMigration } from './kalender-migration';

/** Erfundene Arbeitsmappe mit zwei Jahren und einer Idee. */
function testDatei(): File {
  const daten = schreibeArbeitsmappe({
    jahre: [2025, 2026].map((jahr) => ({
      jahr,
      titel: `Erfundener Plan ${jahr}`,
      termine: [{ ...leererTermin(`${jahr}-03-03`), id: `t${jahr}`, thema: 'Erfundenes Thema' }],
      katsThemen: [],
    })),
    backlog: [{ ...leererTermin(null), id: 'i1', thema: 'Erfundene Idee' }],
  });
  return new File([daten], 'Erfundene_Mappe.xlsx');
}

function dateiEreignis(datei: File): Event {
  const eingabe = document.createElement('input');
  eingabe.type = 'file';
  Object.defineProperty(eingabe, 'files', { value: [datei] });
  return { target: eingabe } as unknown as Event;
}

describe('KalenderMigration', () => {
  const storage = { laden: vi.fn(), migriere: vi.fn() };
  const kalender = { uebernimm: vi.fn() };
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };

  function erzeuge(): KalenderMigration {
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiKalenderStorage, useValue: storage },
        { provide: KalenderDatenService, useValue: kalender },
        { provide: DialogDienst, useValue: dialog },
      ],
    });
    return TestBed.runInInjectionContext(() => new KalenderMigration());
  }

  beforeEach(() => vi.resetAllMocks());

  it('erlaubt die Übernahme nur bei leerer Datenbank', async () => {
    storage.laden.mockResolvedValue({ jahre: [{}], ideen: null });
    const seite = erzeuge();
    await vi.waitFor(() => expect(seite.befund()).toBe('befuellt'));
    await seite.dateiGewaehlt(dateiEreignis(testDatei()));
    expect(seite.kannUebernehmen()).toBe(false);
  });

  it('erkennt eine nicht eingerichtete Datenbank', async () => {
    storage.laden.mockRejectedValue(new WorkerFehler('nicht eingerichtet', 503));
    const seite = erzeuge();
    await vi.waitFor(() => expect(seite.befund()).toBe('nicht-eingerichtet'));
  });

  it('liest die Excel-Datei und zeigt Jahre, Einträge und Ideen als Vorschau', async () => {
    storage.laden.mockResolvedValue({ jahre: [], ideen: null });
    const seite = erzeuge();
    await vi.waitFor(() => expect(seite.befund()).toBe('leer'));
    await seite.dateiGewaehlt(dateiEreignis(testDatei()));
    expect(seite.vorschau()?.jahre.map((j) => j.jahr)).toEqual([2025, 2026]);
    expect(seite.vorschau()?.ideen).toBe(1);
    expect(seite.kannUebernehmen()).toBe(true);
  });

  it('überträgt erst nach Bestätigung und übernimmt den gelieferten Stand', async () => {
    storage.laden.mockResolvedValue({ jahre: [], ideen: null });
    const stand = { jahre: [], ideen: null };
    storage.migriere.mockResolvedValue(stand);
    const seite = erzeuge();
    await vi.waitFor(() => expect(seite.befund()).toBe('leer'));
    await seite.dateiGewaehlt(dateiEreignis(testDatei()));

    dialog.bestaetigen.mockResolvedValue(false);
    await seite.uebernehmen();
    expect(storage.migriere).not.toHaveBeenCalled();

    dialog.bestaetigen.mockResolvedValue(true);
    await seite.uebernehmen();
    expect(storage.migriere).toHaveBeenCalledTimes(1);
    expect(kalender.uebernimm).toHaveBeenCalledWith(stand);
    expect(seite.erledigt()).toBe(true);
    expect(seite.kannUebernehmen()).toBe(false);
  });

  it('meldet eine inzwischen befüllte Datenbank, ohne etwas zu übernehmen', async () => {
    storage.laden.mockResolvedValue({ jahre: [], ideen: null });
    storage.migriere.mockRejectedValue(new KalenderBereitsBefuelltFehler());
    dialog.bestaetigen.mockResolvedValue(true);
    const seite = erzeuge();
    await vi.waitFor(() => expect(seite.befund()).toBe('leer'));
    await seite.dateiGewaehlt(dateiEreignis(testDatei()));

    await seite.uebernehmen();

    expect(seite.befund()).toBe('befuellt');
    expect(seite.fehler()).toMatch(/nur einmal/);
    expect(kalender.uebernimm).not.toHaveBeenCalled();
  });

  it('weist eine Datei ohne Jahresblatt ab', async () => {
    storage.laden.mockResolvedValue({ jahre: [], ideen: null });
    const seite = erzeuge();
    await vi.waitFor(() => expect(seite.befund()).toBe('leer'));
    await seite.dateiGewaehlt(dateiEreignis(new File(['kein excel'], 'kaputt.xlsx')));
    expect(seite.arbeitsmappe()).toBeNull();
    expect(seite.fehler()).not.toBe('');
  });
});
