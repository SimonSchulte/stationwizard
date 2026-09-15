import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import { Einstellungen, Systemkonfiguration } from '../models/systemkonfiguration.model';
import { ApiSystemkonfigurationStorage } from '../storage/api-systemkonfiguration-storage';
import { SystemkonfigurationStoreService } from './systemkonfiguration-store.service';

function einstellungen(ueberschreibung: Partial<Einstellungen> = {}): Einstellungen {
  return {
    kmBerichtEmpfaenger: 'leitung@example.test',
    kmBerichtVersandweg: 'email-routing',
    kmBerichtBetreff: 'Kilometerstandsbericht',
    ...ueberschreibung,
  };
}

function konfiguration(ueberschreibung: Partial<Systemkonfiguration> = {}): Systemkonfiguration {
  return {
    einstellungen: einstellungen(),
    versandwege: [
      { weg: 'email-routing', verfuegbar: true },
      { weg: 'resend', verfuegbar: false },
    ],
    ...ueberschreibung,
  };
}

describe('SystemkonfigurationStoreService', () => {
  const storage = { laden: vi.fn(), speichern: vi.fn() };
  let service: SystemkonfigurationStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiSystemkonfigurationStorage, useValue: storage }],
    });
    service = TestBed.inject(SystemkonfigurationStoreService);
  });

  it('lädt Einstellungen und Verfügbarkeit und meldet Fehler, statt zu werfen', async () => {
    storage.laden.mockResolvedValue(konfiguration());
    await service.laden();
    expect(service.gespeicherteEinstellungen()).toEqual(einstellungen());
    expect(service.istVerfuegbar('email-routing')).toBe(true);
    expect(service.istVerfuegbar('resend')).toBe(false);
    expect(service.verfuegbareWege()).toHaveLength(1);

    storage.laden.mockRejectedValue(new Error('kaputt'));
    await service.laden();
    expect(service.ladeFehler()).toBe('kaputt');
  });

  it('meldet einen geänderten Entwurf als ungespeichert', async () => {
    storage.laden.mockResolvedValue(konfiguration());
    await service.laden();
    expect(service.ungespeichert()).toBe(false);

    service.entwurfAendern({ kmBerichtEmpfaenger: 'andere@example.test' });
    expect(service.ungespeichert()).toBe(true);
  });

  it('meldet ungespeicherte Änderungen an den Verlassenschutz', async () => {
    storage.laden.mockResolvedValue(konfiguration());
    await service.laden();
    service.entwurfAendern({ kmBerichtBetreff: 'Anders' });

    expect(TestBed.inject(VerlassenSchutz).hatUngesicherteAenderungen()).toBe(true);
  });

  it('verwirft einen laufenden Entwurf beim erneuten Laden nicht', async () => {
    storage.laden.mockResolvedValue(konfiguration());
    await service.laden();
    service.entwurfAendern({ kmBerichtEmpfaenger: 'andere@example.test' });

    await service.laden();

    expect(service.entwurf()?.kmBerichtEmpfaenger).toBe('andere@example.test');
    expect(service.gespeicherteEinstellungen()?.kmBerichtEmpfaenger).toBe('leitung@example.test');
  });

  it('übernimmt den Serverstand nur bei erfolgreichem Speichern', async () => {
    storage.laden.mockResolvedValue(konfiguration());
    await service.laden();
    service.entwurfAendern({ kmBerichtEmpfaenger: 'andere@example.test' });

    storage.speichern.mockResolvedValue(
      konfiguration({
        einstellungen: einstellungen({ kmBerichtEmpfaenger: 'andere@example.test' }),
      }),
    );
    expect(await service.speichern()).toBe(true);
    expect(service.gespeicherteEinstellungen()?.kmBerichtEmpfaenger).toBe('andere@example.test');
    expect(service.ungespeichert()).toBe(false);
    expect(service.gespeichert()).toBe(true);
  });

  it('behält den Entwurf und den alten Serverstand, wenn das Speichern scheitert', async () => {
    storage.laden.mockResolvedValue(konfiguration());
    await service.laden();
    service.entwurfAendern({ kmBerichtEmpfaenger: 'andere@example.test' });

    storage.speichern.mockRejectedValue(new Error('Ungültige Einstellungen.'));
    expect(await service.speichern()).toBe(false);
    expect(service.speicherFehler()).toBe('Ungültige Einstellungen.');
    expect(service.entwurf()?.kmBerichtEmpfaenger).toBe('andere@example.test');
    expect(service.gespeicherteEinstellungen()?.kmBerichtEmpfaenger).toBe('leitung@example.test');
    expect(service.ungespeichert()).toBe(true);
  });

  it('setzt den Entwurf beim Verwerfen auf den gespeicherten Stand zurück', async () => {
    storage.laden.mockResolvedValue(konfiguration());
    await service.laden();
    service.entwurfAendern({ kmBerichtBetreff: 'Anders' });

    service.entwurfVerwerfen();

    expect(service.ungespeichert()).toBe(false);
    expect(service.entwurf()?.kmBerichtBetreff).toBe('Kilometerstandsbericht');
  });
});
