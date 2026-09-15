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
    expect(kontext.anzeigename()).toBe('Uebung');
    expect(kontext.initialen()).toBe('U');
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

  it('lädt zusätzlich ein optionales Profilbild, ohne die Anmeldung selbst zu kennen', async () => {
    json.mockImplementation((pfad: string) =>
      pfad === '/api/benutzer'
        ? Promise.resolve({ email: 'uebung@example.invalid' })
        : Promise.resolve({ profilbildUrl: 'https://bild.example.invalid/foto.png' }),
    );
    const kontext = TestBed.inject(Benutzerkontext);
    await kontext.laden();
    expect(json).toHaveBeenCalledWith('/api/benutzer/profilbild');
    expect(kontext.profilbildUrl()).toBe('https://bild.example.invalid/foto.png');
  });

  it('zeigt kein Profilbild, wenn der Zusatzabruf fehlschlägt oder unbrauchbar antwortet', async () => {
    json.mockImplementation((pfad: string) =>
      pfad === '/api/benutzer'
        ? Promise.resolve({ email: 'uebung@example.invalid' })
        : Promise.reject(new WorkerFehler('nicht erreichbar', 0)),
    );
    const kontext = TestBed.inject(Benutzerkontext);
    await kontext.laden();
    expect(kontext.email()).toBe('uebung@example.invalid');
    expect(kontext.profilbildUrl()).toBeNull();
  });
});
