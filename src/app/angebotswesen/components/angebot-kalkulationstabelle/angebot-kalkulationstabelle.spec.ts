import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AngebotKalkulationstabelle } from './angebot-kalkulationstabelle';
import {
  erzeugeTestAngebot,
  erzeugeTestPosition,
  erzeugeTestSchicht,
} from '../../testing/angebot-testdaten';

function erzeuge(angebot = erzeugeTestAngebot()): AngebotKalkulationstabelle {
  const fixture = TestBed.createComponent(AngebotKalkulationstabelle);
  fixture.componentRef.setInput('angebot', angebot);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('AngebotKalkulationstabelle', () => {
  it('rechnet die Beispielzeilen aus der Anfrage nach', () => {
    const angebot = erzeugeTestAngebot({
      schichten: [
        erzeugeTestSchicht({
          von: '08:00',
          bis: '20:00',
          positionen: [
            erzeugeTestPosition({
              art: 'einsatzkraft',
              bezeichnung: 'Sanitätshelfer',
              einzelpreisCent: 1200,
              anzahl: 2,
              stunden: 1,
            }),
            erzeugeTestPosition({
              art: 'fahrzeug',
              bezeichnung: 'Krankentransportwagen',
              einzelpreisCent: 5000,
              anzahl: 1,
              stunden: null,
            }),
          ],
        }),
      ],
    });
    const komponente = erzeuge(angebot);
    const positionen = komponente.kalkulation().gruppen[0].positionen;
    expect(positionen[0]).toMatchObject({ pos: 1, gesamtCent: 2400 });
    expect(positionen[1]).toMatchObject({ pos: 2, gesamtCent: 5000 });
    expect(komponente.kalkulation().gesamtCent).toBe(7400);
  });

  it('meldet keine Gruppen für ein Angebot ohne Schichten', () => {
    const komponente = erzeuge(erzeugeTestAngebot({ schichten: [] }));
    expect(komponente.kalkulation().gruppen).toHaveLength(0);
  });
});
