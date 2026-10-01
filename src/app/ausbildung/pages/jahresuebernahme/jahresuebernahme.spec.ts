import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Jahresblatt, KatsThema, leererTermin, leeresJahresblatt } from '../../models/plan.model';
import { KalenderDatenService } from '../../services/kalender-daten.service';
import { Jahresuebernahme } from './jahresuebernahme';

const THEMA: KatsThema = {
  id: 'k1',
  nummer: '1.1',
  titel: 'Erfundenes Thema',
  beschreibung: '',
  pflicht: true,
};

const BLAETTER: Record<number, Jahresblatt> = {
  2026: {
    ...leeresJahresblatt(2026),
    ideen: [
      { ...leererTermin(null), id: 'i1', thema: 'Erfundene Idee A', katsThemaId: 'k1' },
      { ...leererTermin(null), id: 'i2', thema: 'Erfundene Idee B' },
    ],
    katsThemen: [THEMA],
  },
  2027: {
    ...leeresJahresblatt(2027),
    ideen: [{ ...leererTermin(null), id: 'z1', thema: 'Erfundene Idee B' }],
  },
};

describe('Jahresuebernahme', () => {
  const kalender = {
    zustand: signal('verbunden'),
    verfuegbareJahre: signal([2026, 2027]),
    beschaeftigt: signal(false),
    blatt: (jahr: number) => BLAETTER[jahr],
    uebernehmeInJahr: vi.fn(),
    laden: vi.fn(),
  };
  const snackBar = { open: vi.fn() };

  function erzeuge(): Jahresuebernahme {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: KalenderDatenService, useValue: kalender },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    return TestBed.createComponent(Jahresuebernahme).componentInstance;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    kalender.zustand.set('verbunden');
    kalender.verfuegbareJahre.set([2026, 2027]);
  });

  it('nimmt das vorletzte Jahr als Quelle und das jüngste als Ziel', () => {
    const seite = erzeuge();
    expect(seite.quellJahr()).toBe(2026);
    expect(seite.zielJahr()).toBe(2027);
  });

  it('wählt vor, was das Zieljahr noch nicht hat', () => {
    const seite = erzeuge();
    expect([...seite.ideenAuswahl()]).toEqual(['i1']);
    expect([...seite.themenAuswahl()]).toEqual(['k1']);
    expect(seite.ideen().find((z) => z.idee.id === 'i2')?.vorhanden).toBe(true);
  });

  it('übergibt die ausgewählten Kopien an den Kalender und kehrt zurück', () => {
    const seite = erzeuge();
    seite.uebernehmen();

    expect(kalender.uebernehmeInJahr).toHaveBeenCalledOnce();
    const [ziel, ideen, themen] = kalender.uebernehmeInJahr.mock.calls[0]!;
    expect(ziel).toBe(2027);
    expect(ideen).toHaveLength(1);
    expect(ideen[0].thema).toBe('Erfundene Idee A');
    expect(ideen[0].katsThemaId).toBe(themen[0].id);
    expect(snackBar.open).toHaveBeenCalled();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/kalender');
  });

  it('übernimmt nichts, wenn die Auswahl leer ist oder Quelle und Ziel gleich sind', () => {
    const seite = erzeuge();
    seite.alleIdeen(false);
    seite.alleThemen(false);
    expect(seite.kannUebernehmen()).toBe(false);

    seite.alleIdeen(true);
    seite.quellJahr.set(2027);
    expect(seite.gleichesJahr()).toBe(true);
    expect(seite.kannUebernehmen()).toBe(false);
    seite.uebernehmen();
    expect(kalender.uebernehmeInJahr).not.toHaveBeenCalled();
  });

  it('bietet bei nur einem Jahr keine Übernahme an', () => {
    kalender.verfuegbareJahre.set([2026]);
    const seite = erzeuge();
    expect(seite.quellJahr()).toBeNull();
    expect(seite.kannUebernehmen()).toBe(false);
  });

  it('lädt den Kalender bei Direktaufruf, wenn er noch nicht verbunden ist', () => {
    kalender.zustand.set('ungeprueft');
    kalender.laden.mockResolvedValue({ meldungen: [] });
    erzeuge();
    expect(kalender.laden).toHaveBeenCalledOnce();
  });
});
