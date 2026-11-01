import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MeldungsDienst } from './meldungs-dienst';

function snackBarAttrappe() {
  const geoeffnet: {
    daten: unknown;
    konfig: { duration?: number; politeness?: string; panelClass?: string[] };
    schliessen: (vonPerson?: boolean) => void;
    aktion: () => void;
  }[] = [];
  const snackBar = {
    openFromComponent: vi.fn((_komponente: unknown, konfig: { data: unknown }) => {
      const aktion$ = new Subject<void>();
      const ende$ = new Subject<{ dismissedByAction: boolean }>();
      const instanz = { vonPersonGeschlossen: false };
      const ref = {
        instance: instanz,
        onAction: () => aktion$,
        afterDismissed: () => ende$,
        dismiss: () => ende$.next({ dismissedByAction: false }),
      };
      geoeffnet.push({
        daten: konfig.data,
        konfig: konfig as never,
        schliessen: (vonPerson = false) => {
          instanz.vonPersonGeschlossen = vonPerson;
          ende$.next({ dismissedByAction: false });
        },
        aktion: () => {
          aktion$.next();
          ende$.next({ dismissedByAction: true });
        },
      });
      return ref;
    }),
  };
  return { snackBar, geoeffnet };
}

function dienst() {
  const { snackBar, geoeffnet } = snackBarAttrappe();
  TestBed.configureTestingModule({ providers: [{ provide: MatSnackBar, useValue: snackBar }] });
  return { meldungen: TestBed.inject(MeldungsDienst), geoeffnet };
}

describe('MeldungsDienst', () => {
  it('zeigt Meldungen nacheinander statt sich gegenseitig zu verdrängen', () => {
    const { meldungen, geoeffnet } = dienst();
    meldungen.fehler('Erster Fehler');
    meldungen.erfolg('Gespeichert');
    expect(geoeffnet).toHaveLength(1);
    expect(geoeffnet[0]!.daten).toMatchObject({ art: 'fehler', text: 'Erster Fehler' });
    expect(geoeffnet[0]!.konfig.politeness).toBe('assertive');
    geoeffnet[0]!.schliessen();
    expect(geoeffnet).toHaveLength(2);
    expect(geoeffnet[1]!.daten).toMatchObject({ art: 'erfolg' });
    expect(geoeffnet[1]!.konfig.duration).toBe(5000);
  });

  it('lässt Fehler mit Aktion stehen und ruft die Aktion', () => {
    const { meldungen, geoeffnet } = dienst();
    const beiAktion = vi.fn();
    meldungen.fehler('Nicht erreichbar', { aktion: 'Erneut versuchen', beiAktion });
    expect(geoeffnet[0]!.konfig.duration).toBeUndefined();
    geoeffnet[0]!.aktion();
    expect(beiAktion).toHaveBeenCalledTimes(1);
  });

  it('nimmt eine noch wartende Meldung aus der Warteschlange', () => {
    const { meldungen, geoeffnet } = dienst();
    meldungen.info('Erste');
    meldungen.info('Zweite').schliessen();
    geoeffnet[0]!.schliessen();
    expect(geoeffnet).toHaveLength(1);
  });

  it('meldet nur das Schließen durch die Person', () => {
    const { meldungen, geoeffnet } = dienst();
    const beiSchliessen = vi.fn();
    meldungen.info('Abgelaufen', { beiSchliessen });
    geoeffnet[0]!.schliessen(false);
    meldungen.info('Geschlossen', { beiSchliessen });
    geoeffnet[1]!.schliessen(true);
    expect(beiSchliessen).toHaveBeenCalledTimes(1);
  });
});
