import { TestBed } from '@angular/core/testing';
import { Benutzerkontext } from './benutzerkontext';
import { WorkerClient, WorkerFehler } from './worker-client';

describe('Benutzerkontext', () => {
  const json = vi.fn();
  beforeEach(() => {
    json.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: { json } }] });
  });

  it('lädt ausschließlich die serverseitig geprüfte Identität', async () => {
    json.mockResolvedValue({ email: 'uebung@example.invalid' });
    const kontext = TestBed.inject(Benutzerkontext);
    await kontext.laden();
    expect(json).toHaveBeenCalledWith('/api/benutzer');
    expect(kontext.email()).toBe('uebung@example.invalid');
    expect(kontext.laedt()).toBe(false);
  });

  it('entfernt die bisherige Anzeige nach Ablauf der Sitzung', async () => {
    json.mockResolvedValueOnce({ email: 'uebung@example.invalid' });
    const kontext = TestBed.inject(Benutzerkontext);
    await kontext.laden();
    json.mockRejectedValueOnce(new WorkerFehler('Sitzung abgelaufen', 401));
    await kontext.laden();
    expect(kontext.email()).toBe('');
    expect(kontext.fehler()).toBe('Sitzung abgelaufen');
    expect(kontext.laedt()).toBe(false);
  });

  it('zeigt keine ungeprüfte oder unvollständige Antwort als Benutzer', async () => {
    json.mockResolvedValue({ email: 42 });
    const kontext = TestBed.inject(Benutzerkontext);
    await kontext.laden();
    expect(kontext.email()).toBe('');
    expect(kontext.fehler()).toContain('unvollständig');
  });
});
