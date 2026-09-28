import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { HiorgPerson } from '../../kern/hiorg/hiorg-personal.service';
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
