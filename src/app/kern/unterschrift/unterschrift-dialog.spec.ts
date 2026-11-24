import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { UnterschriftDialog, UnterschriftDialogDaten } from './unterschrift-dialog';

function erzeuge(daten: UnterschriftDialogDaten) {
  const schliessen = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: daten },
      { provide: MatDialogRef, useValue: { close: schliessen } },
    ],
  });
  const fixture = TestBed.createComponent(UnterschriftDialog);
  fixture.detectChanges();
  return { fixture, komponente: fixture.componentInstance, schliessen };
}

describe('UnterschriftDialog', () => {
  it('schlägt den eigenen Namen als Schriftunterschrift vor', () => {
    const { komponente } = erzeuge({ aktuell: null, name: 'Max Mustermann' });
    expect(komponente.modus()).toBe('schrift');
    expect(komponente.ergebnis()).toEqual({
      art: 'schrift',
      text: 'Max Mustermann',
      font: 'Dancing Script',
    });
  });

  it('speichert die gewählte Schrift', () => {
    const { komponente, schliessen } = erzeuge({ aktuell: null, name: 'Max' });
    komponente.schriftWaehlen('Reenie Beanie');
    komponente.speichern();
    expect(schliessen).toHaveBeenCalledWith({ art: 'schrift', text: 'Max', font: 'Reenie Beanie' });
  });

  it('lässt ohne Text nichts speichern', () => {
    const { komponente, schliessen } = erzeuge({ aktuell: null, name: '' });
    expect(komponente.ergebnis()).toBeNull();
    komponente.speichern();
    expect(schliessen).not.toHaveBeenCalled();
  });

  it('begrenzt den Text', () => {
    const { komponente } = erzeuge({ aktuell: null, name: '' });
    komponente.textAendern('x'.repeat(200));
    expect(komponente.text().length).toBe(80);
  });

  it('verlangt für eine Zeichnung einen echten Strich und löscht sie wieder', () => {
    const { komponente } = erzeuge({
      aktuell: {
        art: 'zeichnung',
        striche: [
          [
            [1, 1],
            [5, 5],
          ],
        ],
      },
      name: 'Max',
    });
    expect(komponente.modus()).toBe('zeichnung');
    expect(komponente.ergebnis()?.art).toBe('zeichnung');
    komponente.zeichnungLoeschen();
    expect(komponente.ergebnis()).toBeNull();
  });

  it('bietet „Entfernen“ nur an, wenn schon eine Unterschrift hinterlegt ist', () => {
    const ohne = erzeuge({ aktuell: null, name: 'Max' });
    expect((ohne.fixture.nativeElement as HTMLElement).querySelector('.entfernen')).toBeNull();
    TestBed.resetTestingModule();
    const mit = erzeuge({ aktuell: { art: 'schrift', text: 'Max', font: 'Caveat' }, name: 'Max' });
    expect((mit.fixture.nativeElement as HTMLElement).querySelector('.entfernen')).not.toBeNull();
  });
});
