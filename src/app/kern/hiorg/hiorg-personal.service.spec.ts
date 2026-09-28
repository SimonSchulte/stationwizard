import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../worker-client';
import {
  HiorgPersonalService,
  hiorgVerbindenAdresse,
  type HiorgPerson,
} from './hiorg-personal.service';

function person(teil: Partial<HiorgPerson> = {}): HiorgPerson {
  return {
    id: 'p1',
    vorname: 'Erika',
    nachname: 'Beispiel',
    gruppen: ['Bereitschaft'],
    qualifikationen: [],
    ...teil,
  };
}

function dienstMit(json: ReturnType<typeof vi.fn>): HiorgPersonalService {
  TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: { json } }] });
  return TestBed.inject(HiorgPersonalService);
}

describe('HiorgPersonalService', () => {
  it.each([
    [{ eingerichtet: false, verbunden: false }, 'nicht-eingerichtet'],
    [{ eingerichtet: true, verbunden: false }, 'getrennt'],
    [{ eingerichtet: true, verbunden: true }, 'verbunden'],
  ])('leitet den Verbindungszustand aus %o ab', async (antwort, zustand) => {
    const dienst = dienstMit(vi.fn().mockResolvedValue(antwort));
    expect(await dienst.verbindungLaden()).toBe(zustand);
    expect(dienst.verbindung()).toBe(zustand);
  });

  it('prüft die Personalliste und sortiert nach Nachname', async () => {
    const dienst = dienstMit(
      vi.fn().mockResolvedValue({
        personen: [person({ id: 'b', nachname: 'Zeta' }), person({ id: 'a', nachname: 'Ahorn' })],
      }),
    );
    expect((await dienst.personalLaden()).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('lehnt eine ungültige Personalliste ab', async () => {
    const dienst = dienstMit(vi.fn().mockResolvedValue({ personen: [{ id: 1 }] }));
    await expect(dienst.personalLaden()).rejects.toThrow('keine gültige Personalliste');
  });

  it('merkt sich eine verlorene Verbindung', async () => {
    const dienst = dienstMit(vi.fn().mockRejectedValue(new WorkerFehler('HTTP 409', 409)));
    dienst.verbindung.set('verbunden');
    await expect(dienst.personalLaden()).rejects.toThrow('erneut verbinden');
    expect(dienst.verbindung()).toBe('getrennt');
  });
});

describe('hiorgVerbindenAdresse', () => {
  it('bleibt ein relativer Pfad derselben Origin mit festem Ziel', () => {
    expect(hiorgVerbindenAdresse('personal')).toBe('/hiorg/verbinden?ziel=personal');
  });
});
