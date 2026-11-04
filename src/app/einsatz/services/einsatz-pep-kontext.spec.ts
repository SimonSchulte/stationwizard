import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiEinsatzStorage } from '../storage/api-einsatz-storage';
import { InMemoryEinsatzStorage } from '../testing/in-memory-einsatzplanung';
import { testEinsatz } from '../testing/vb-testdaten';
import { EinsatzPepKontext } from './einsatz-pep-kontext';

describe('EinsatzPepKontext', () => {
  let storage: InMemoryEinsatzStorage;
  let kontext: EinsatzPepKontext;
  let schreiben: ReturnType<typeof vi.spyOn>;
  const planungId = crypto.randomUUID();

  beforeEach(() => {
    storage = new InMemoryEinsatzStorage();
    schreiben = vi.spyOn(storage, 'speichereEinsatz');
    TestBed.configureTestingModule({
      providers: [{ provide: ApiEinsatzStorage, useValue: storage }],
    });
    kontext = TestBed.inject(EinsatzPepKontext);
  });

  it('trägt die Datei nach dem ersten Speichern genau einmal ein', async () => {
    const einsatz = testEinsatz();
    storage._vorbelegen(einsatz);
    kontext.merken(einsatz.id, planungId, null);

    expect(await kontext.nachSpeichern(planungId)).toBe('');
    expect((await storage.ladeEinsatz(einsatz.id))?.daten.pepId).toBe(planungId);
    expect(schreiben).toHaveBeenCalledTimes(1);

    // Weitere Speichervorgänge derselben Planung ändern nichts mehr.
    expect(await kontext.nachSpeichern(planungId)).toBe('');
    expect(await kontext.nachSpeichern(planungId)).toBe('');
    expect(schreiben).toHaveBeenCalledTimes(1);
  });

  it('schreibt nicht, wenn der Einsatz die Datei schon trägt', async () => {
    const einsatz = testEinsatz({ pepId: planungId });
    storage._vorbelegen(einsatz);
    kontext.merken(einsatz.id, planungId, planungId);
    expect(await kontext.nachSpeichern(planungId)).toBe('');
    expect(schreiben).not.toHaveBeenCalled();
  });

  it('schreibt nicht ohne Kontext und nicht für eine andere Planung', async () => {
    const einsatz = testEinsatz();
    storage._vorbelegen(einsatz);
    expect(await kontext.nachSpeichern(planungId)).toBe('');
    kontext.merken(einsatz.id, planungId, null);
    expect(await kontext.nachSpeichern(crypto.randomUUID())).toBe('');
    kontext.verwerfen();
    expect(await kontext.nachSpeichern(planungId)).toBe('');
    expect(schreiben).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler und versucht es beim nächsten Speichern erneut', async () => {
    const einsatz = testEinsatz();
    storage._vorbelegen(einsatz);
    kontext.merken(einsatz.id, planungId, null);
    schreiben.mockRejectedValueOnce(new Error('Server nicht erreichbar'));

    expect(await kontext.nachSpeichern(planungId)).toBe('Server nicht erreichbar');
    expect(kontext.fehler()).toBe('Server nicht erreichbar');

    expect(await kontext.nachSpeichern(planungId)).toBe('');
    expect(kontext.fehler()).toBe('');
    expect((await storage.ladeEinsatz(einsatz.id))?.daten.pepId).toBe(planungId);
  });
});
