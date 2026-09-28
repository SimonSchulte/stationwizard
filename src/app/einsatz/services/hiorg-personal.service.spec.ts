import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { HiorgPersonalService, type HiorgPerson } from './hiorg-personal.service';
import { ImportService } from './import.service';

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

describe('ImportService.mapHiorgPerson', () => {
  it('nutzt das übernommene EFS-Mapping und behält Unbekanntes als Zusatz', () => {
    const kraft = TestBed.inject(ImportService).mapHiorgPerson(
      person({
        qualifikationen: [
          { liste: 'med. Qualifikation', name: 'Rettungssanitäter/in', kurz: 'RettSan' },
          { liste: 'Führung', name: 'Gruppenführer:in', kurz: null },
          { liste: 'Sonstiges', name: 'Bootsführer', kurz: 'BF' },
          { liste: 'Nur Kürzel', name: null, kurz: 'SSD' },
        ],
        telefon: '+49000000000',
      }),
    );
    expect(kraft.name).toBe('Beispiel Erika');
    expect(kraft.tags).toEqual({
      taktisch: ['GF'],
      medizinisch: ['RS', 'SSD'],
      zusatz: ['Bootsführer'],
    });
    expect(kraft.telefonnummer).toBe('+49000000000');
    // Die HiOrg-Personen-ID ist keine EFS-Einsatzkraft-ID.
    expect(kraft.hiorg_org_id).toBeUndefined();
  });
});
