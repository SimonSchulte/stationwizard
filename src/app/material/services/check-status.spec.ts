import { describe, expect, it } from 'vitest';
import { PruefFach } from '../models/pruefvorlage.model';
import {
  artikelVerfallsstatus,
  fachStand,
  fortschritt,
  heuteBerlin,
  leererStand,
  verfallsdatumStatus,
} from './check-status';

const HEUTE = '2026-09-21';

function faecher(): PruefFach[] {
  return [
    {
      id: 'f1',
      bezeichnung: 'Erstes Fach',
      artikel: [
        {
          id: 'a1',
          bezeichnung: 'Erfundene Binde',
          sollMenge: 2,
          einheit: '',
          herkunft: 'land',
          verfallsdatumPflicht: true,
        },
        {
          id: 'a2',
          bezeichnung: 'Erfundene Schere',
          sollMenge: 1,
          einheit: '',
          herkunft: 'seg',
          verfallsdatumPflicht: false,
        },
      ],
    },
  ];
}

describe('verfallsdatumStatus', () => {
  it('gilt bis zum letzten Tag des Monats', () => {
    expect(verfallsdatumStatus('2026-09', HEUTE)).toBe('laeuft-ab');
    expect(verfallsdatumStatus('2026-08', HEUTE)).toBe('abgelaufen');
    expect(verfallsdatumStatus('2026-12', HEUTE)).toBe('ok');
  });

  it('behandelt Fehlendes und Unlesbares als nicht erfasst, nicht als abgelaufen', () => {
    expect(verfallsdatumStatus(null, HEUTE)).toBe('keines');
    expect(verfallsdatumStatus('', HEUTE)).toBe('keines');
    expect(verfallsdatumStatus('2026-13', HEUTE)).toBe('keines');
  });

  it('stimmt mit der verbindlichen Fassung im Worker überein', () => {
    // Beide Fassungen sind gemeinsam zu ändern; die Werte stammen aus
    // worker/tests/material-check.spec.ts.
    expect(verfallsdatumStatus('2026-11', HEUTE)).toBe('laeuft-ab');
    expect(verfallsdatumStatus('2026-12', HEUTE)).toBe('ok');
  });
});

describe('artikelVerfallsstatus', () => {
  it('meldet den schlechtesten Status über alle Stücke', () => {
    expect(artikelVerfallsstatus(['2027-12', '2026-08'], HEUTE)).toBe('abgelaufen');
    expect(artikelVerfallsstatus(['2027-12', '2026-11'], HEUTE)).toBe('laeuft-ab');
    expect(artikelVerfallsstatus(['2027-12', null], HEUTE)).toBe('ok');
    expect(artikelVerfallsstatus([null, null], HEUTE)).toBe('keines');
  });
});

describe('leererStand', () => {
  it('belegt die Istmenge mit dem Soll vor, hakt aber nichts ab', () => {
    const stand = leererStand('b1', faecher());
    expect(stand.positionen['a1']?.istMenge).toBe(2);
    expect(stand.positionen['a1']?.geprueft).toBe(false);
  });

  it('legt genau ein Verfallsdatum je Stück an', () => {
    const stand = leererStand('b1', faecher());
    expect(stand.positionen['a1']?.verfallsdaten).toEqual([null, null]);
    expect(stand.positionen['a2']?.verfallsdaten).toEqual([null]);
  });
});

describe('fortschritt', () => {
  it('zählt einen leeren Stand als null Prozent ohne Abweichung', () => {
    const ergebnis = fortschritt(leererStand('b1', faecher()), faecher(), HEUTE);
    expect(ergebnis.prozent).toBe(0);
    expect(ergebnis.fehlmengen).toBe(0);
    expect(ergebnis.verfallsdatenGesamt).toBe(2);
    expect(ergebnis.verfallsdatenErfasst).toBe(0);
  });

  it('rechnet Fehlmengen, Unbrauchbares und Verfallsdaten getrennt', () => {
    const stand = leererStand('b1', faecher());
    stand.positionen['a1'] = {
      artikelId: 'a1',
      geprueft: true,
      istMenge: 1,
      unbrauchbar: true,
      verfallsdaten: ['2026-08', '2027-12'],
    };
    const ergebnis = fortschritt(stand, faecher(), HEUTE);
    expect(ergebnis.geprueft).toBe(1);
    expect(ergebnis.prozent).toBe(50);
    expect(ergebnis.fehlmengen).toBe(1);
    expect(ergebnis.unbrauchbar).toBe(1);
    expect(ergebnis.abgelaufen).toBe(1);
    expect(ergebnis.verfallsdatenErfasst).toBe(2);
  });

  it('lässt Verfallsdaten unberücksichtigt, wenn die Erfassung abgeschaltet ist', () => {
    const stand = leererStand('b1', faecher(), false);
    stand.positionen['a1']!.verfallsdaten = ['2026-08', '2026-08'];
    const ergebnis = fortschritt(stand, faecher(), HEUTE);
    expect(ergebnis.abgelaufen).toBe(0);
    expect(ergebnis.verfallsdatenGesamt).toBe(0);
  });

  it('zählt eine übererfüllte Menge nicht als Fehlmenge', () => {
    const stand = leererStand('b1', faecher());
    stand.positionen['a1']!.istMenge = 5;
    expect(fortschritt(stand, faecher(), HEUTE).fehlmengen).toBe(0);
  });
});

describe('fachStand', () => {
  it('meldet ein vollständig geprüftes Fach als fertig', () => {
    const stand = leererStand('b1', faecher());
    stand.positionen['a1']!.geprueft = true;
    stand.positionen['a2']!.geprueft = true;
    const ergebnis = fachStand(stand, faecher()[0]!, HEUTE);
    expect(ergebnis.vollstaendigGeprueft).toBe(true);
    expect(ergebnis.geprueft).toBe(2);
  });

  it('zählt einen Artikel mit Verfallsdatum-Hinweis genau einmal, nicht je Stück', () => {
    const stand = leererStand('b1', faecher());
    stand.positionen['a1']!.verfallsdaten = ['2026-08', '2026-08'];
    expect(fachStand(stand, faecher()[0]!, HEUTE).verfallshinweise).toBe(1);
  });
});

describe('heuteBerlin', () => {
  it('liefert den Berliner Kalendertag, nicht den UTC-Tag', () => {
    // 31.12.2026 um 23:30 UTC ist in Berlin bereits der 1.1.2027.
    expect(heuteBerlin(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});
