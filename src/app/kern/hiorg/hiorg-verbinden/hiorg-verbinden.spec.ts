import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../dialog/dialog-dienst';
import { VerlassenSchutz } from '../../verlassen-schutz';
import { WorkerClient, WorkerFehler } from '../../worker-client';
import { HiorgPersonalService } from '../hiorg-personal.service';
import { HiorgVerbinden } from './hiorg-verbinden';

function aufbauen(json: ReturnType<typeof vi.fn>, ungesichert = false) {
  const bestaetigen = vi.fn().mockResolvedValue(false);
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkerClient, useValue: { json } },
      { provide: DialogDienst, useValue: { bestaetigen } },
    ],
  });
  TestBed.inject(VerlassenSchutz).registrieren(() => ungesichert);
  const fixture = TestBed.createComponent(HiorgVerbinden);
  fixture.componentRef.setInput('ziel', 'personal');
  const komponente = fixture.componentInstance;
  const verbunden = vi.fn();
  komponente.verbunden.subscribe(verbunden);
  return { komponente, fixture, bestaetigen, verbunden };
}

describe('HiorgVerbinden', () => {
  it('reicht im manuellen Modus die eingefügte Adresse ein und meldet die Verbindung', async () => {
    const json = vi.fn().mockResolvedValue({ eingerichtet: true, verbunden: true });
    const { komponente, verbunden } = aufbauen(json);
    TestBed.inject(HiorgPersonalService).modus.set('manuell');
    komponente.adresse.set('  https://team.cloudflareaccess.com/cdn-cgi/access/callback?code=a  ');
    await komponente.abschliessen();
    expect(json).toHaveBeenCalledWith('/api/hiorg/verbindung/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adresse: 'https://team.cloudflareaccess.com/cdn-cgi/access/callback?code=a',
      }),
    });
    expect(verbunden).toHaveBeenCalledOnce();
    expect(TestBed.inject(HiorgPersonalService).verbindung()).toBe('verbunden');
  });

  it('übersetzt einen abgelaufenen Code in einen verständlichen Hinweis', async () => {
    const json = vi
      .fn()
      .mockRejectedValue(new WorkerFehler('HTTP 400', 400, 'HIORG_CODE_ABGELEHNT'));
    const { komponente, verbunden } = aufbauen(json);
    komponente.adresse.set('https://team.cloudflareaccess.com/cdn-cgi/access/callback?code=a');
    await komponente.abschliessen();
    expect(komponente.fehler()).toContain('erneut öffnen');
    expect(verbunden).not.toHaveBeenCalled();
  });

  it('verlässt die Seite im automatischen Modus nicht ohne Bestätigung bei ungesicherten Änderungen', async () => {
    const { komponente, bestaetigen } = aufbauen(vi.fn(), true);
    const vorher = document.location.href;
    await komponente.automatischVerbinden();
    expect(bestaetigen).toHaveBeenCalledOnce();
    expect(document.location.href).toBe(vorher);
  });

  it('öffnet die Anmeldung mit festem Rückkehrziel', () => {
    const { komponente } = aufbauen(vi.fn());
    expect(komponente.anmeldeAdresse()).toBe('/hiorg/verbinden?ziel=personal');
  });
});
