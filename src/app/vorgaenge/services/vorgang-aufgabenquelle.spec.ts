import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ApiVorgangStorage } from '../storage/api-vorgang-storage';
import { VorgangAufgabenquelle } from './vorgang-aufgabenquelle';

describe('VorgangAufgabenquelle', () => {
  it('macht aus jeder Unterschriftsanfrage eine Aufgabe mit Link zur Meldung', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiVorgangStorage,
          useValue: {
            aufgaben: vi.fn().mockResolvedValue({
              postfachOffen: 0,
              unterschriften: [
                {
                  vorgangId: 'v-1',
                  slot: 'verantw',
                  angefragtVon: 'tim.beispiel@example.test',
                  angefragtAm: '2026-11-12T10:00:00.000Z',
                  titel: 'Stromaggregat defekt',
                  fahrzeugBezeichnung: 'GW SAN',
                },
              ],
            }),
          },
        },
      ],
    });
    const aufgaben = await TestBed.inject(VorgangAufgabenquelle).ladeAufgaben();
    expect(aufgaben).toEqual([
      {
        id: 'vorgang-unterschrift:v-1:verantw',
        quelle: 'vorgang-unterschrift',
        titel: 'Schadensmeldung unterschreiben',
        beschreibung: 'GW SAN · verantwortliche Person · angefragt von Tim Beispiel',
        eingegangenAm: '2026-11-12T10:00:00.000Z',
        routerLink: ['/vorgaenge', 'v-1', 'meldung'],
        dringlichkeit: 'normal',
      },
    ]);
  });

  it('meldet ungeordnete Mails als eigene Aufgabe mit Link zum Postfach', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiVorgangStorage,
          useValue: {
            aufgaben: vi.fn().mockResolvedValue({ postfachOffen: 3, unterschriften: [] }),
          },
        },
      ],
    });
    const aufgaben = await TestBed.inject(VorgangAufgabenquelle).ladeAufgaben();
    expect(aufgaben).toHaveLength(1);
    expect(aufgaben[0]).toMatchObject({
      titel: '3 Mails im Postfach zuordnen',
      routerLink: ['/vorgaenge', 'postfach'],
    });
  });
});
