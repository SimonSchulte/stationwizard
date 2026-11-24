import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { AngebotStand } from '../../models/vorgang.model';
import { SendenDialog, SendenDialogDaten } from './senden-dialog';

function angebot(id: string, groesse: number): AngebotStand {
  return {
    id,
    dateiname: `${id}.pdf`,
    groesse,
    quelle: 'upload',
    mailBetreff: null,
    mailAbsender: null,
    mailDatum: null,
    mailText: null,
    hochgeladenAm: '2026-11-13',
    hochgeladenVon: 'x@example.test',
  };
}

function erzeuge(daten: SendenDialogDaten) {
  const schliessen = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: daten },
      { provide: MatDialogRef, useValue: { close: schliessen } },
    ],
  });
  const fixture = TestBed.createComponent(SendenDialog);
  fixture.detectChanges();
  return { komponente: fixture.componentInstance, schliessen };
}

const EMPFAENGER = ['a@example.test', 'b@example.test'];

describe('SendenDialog', () => {
  it('wählt zunächst alle Empfänger und die Angebote und liefert sie beim Senden', () => {
    const { komponente, schliessen } = erzeuge({
      einreichen: true,
      empfaenger: EMPFAENGER,
      angebote: [angebot('x', 1000)],
    });
    komponente.nachricht.set('  Bitte prüfen. ');
    komponente.senden();
    expect(schliessen).toHaveBeenCalledWith({
      empfaenger: EMPFAENGER,
      angebote: ['x'],
      nachricht: 'Bitte prüfen.',
    });
  });

  it('lässt Empfänger abwählen, aber nicht alle', () => {
    const { komponente, schliessen } = erzeuge({
      einreichen: false,
      empfaenger: EMPFAENGER,
      angebote: [],
    });
    komponente.empfaengerUmschalten('a@example.test', false);
    expect(komponente.gueltig()).toBe(true);
    komponente.empfaengerUmschalten('b@example.test', false);
    expect(komponente.gueltig()).toBe(false);
    komponente.senden();
    expect(schliessen).not.toHaveBeenCalled();
  });

  it('hängt Angebote über 3 MB nicht an', () => {
    const { komponente, schliessen } = erzeuge({
      einreichen: false,
      empfaenger: EMPFAENGER,
      angebote: [angebot('gross', 4 * 1024 * 1024)],
    });
    expect(komponente.angebotePassen).toBe(false);
    expect(komponente.mitAngeboten()).toBe(false);
    komponente.senden();
    expect(schliessen).toHaveBeenCalledWith(expect.objectContaining({ angebote: [] }));
  });

  it('schickt ohne Haken keine Angebote mit', () => {
    const { komponente, schliessen } = erzeuge({
      einreichen: false,
      empfaenger: EMPFAENGER,
      angebote: [angebot('x', 10)],
    });
    komponente.mitAngeboten.set(false);
    komponente.senden();
    expect(schliessen).toHaveBeenCalledWith(expect.objectContaining({ angebote: [] }));
  });
});
