import { describe, expect, it } from 'vitest';
import { ermittleWartungsstatus, sortiereOffeneWartungen } from './wartungsstatus';
import { erzeugeTestwartung } from '../testing/fahrzeug-testdaten';

describe('ermittleWartungsstatus', () => {
  it('markiert einen erledigten Termin unabhängig vom Fälligkeitsdatum als erledigt', () => {
    const termin = erzeugeTestwartung({ faelligAm: '2026-01-01', erledigtAm: '2026-01-01' });
    expect(ermittleWartungsstatus(termin, '2026-06-01').ampel).toBe('erledigt');
  });

  it('zeigt ok, solange der Vorlauf noch nicht erreicht ist', () => {
    const termin = erzeugeTestwartung({ faelligAm: '2026-07-01', erinnerungTage: 30 });
    const status = ermittleWartungsstatus(termin, '2026-05-01');
    expect(status.ampel).toBe('ok');
    expect(status.tageBisFaellig).toBe(61);
  });

  it('zeigt warnung, sobald der individuelle Vorlauf erreicht ist', () => {
    const termin = erzeugeTestwartung({ faelligAm: '2026-07-01', erinnerungTage: 60 });
    const status = ermittleWartungsstatus(termin, '2026-05-05');
    expect(status.ampel).toBe('warnung');
  });

  it('respektiert einen abweichenden Vorlauf am HU-Termin', () => {
    const hu = erzeugeTestwartung({
      art: 'hu',
      bezeichnung: 'Hauptuntersuchung',
      faelligAm: '2026-07-01',
      erinnerungTage: 90,
    });
    expect(ermittleWartungsstatus(hu, '2026-05-01').ampel).toBe('warnung');
  });

  it('zeigt überfällig für ein verstrichenes Datum', () => {
    const termin = erzeugeTestwartung({ faelligAm: '2026-01-01', erinnerungTage: 30 });
    const status = ermittleWartungsstatus(termin, '2026-06-01');
    expect(status.ampel).toBe('ueberfaellig');
    expect(status.tageBisFaellig).toBeLessThan(0);
  });

  it('rechnet den Stichtag zeitzonenunabhängig, ohne UTC-Verschiebung um einen Tag', () => {
    const termin = erzeugeTestwartung({ faelligAm: '2026-03-02', erinnerungTage: 30 });
    expect(ermittleWartungsstatus(termin, '2026-03-01').tageBisFaellig).toBe(1);
  });
});

describe('sortiereOffeneWartungen', () => {
  it('lässt erledigte Termine weg und sortiert die übrigen nach Fälligkeit', () => {
    const termine = [
      erzeugeTestwartung({ bezeichnung: 'Später', faelligAm: '2026-12-01' }),
      erzeugeTestwartung({
        bezeichnung: 'Erledigt',
        faelligAm: '2026-01-01',
        erledigtAm: '2026-01-01',
      }),
      erzeugeTestwartung({ bezeichnung: 'Bald', faelligAm: '2026-05-01' }),
    ];
    const ergebnis = sortiereOffeneWartungen(termine, '2026-04-01');
    expect(ergebnis.map((s) => s.termin.bezeichnung)).toEqual(['Bald', 'Später']);
  });
});
