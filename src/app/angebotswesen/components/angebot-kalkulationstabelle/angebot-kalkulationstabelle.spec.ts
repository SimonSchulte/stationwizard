import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AngebotKalkulationstabelle } from './angebot-kalkulationstabelle';
import {
  erzeugeTestAngebot,
  erzeugeTestPosition,
  erzeugeTestSchicht,
} from '../../testing/angebot-testdaten';

function erzeuge(angebot = erzeugeTestAngebot()): {
  komponente: AngebotKalkulationstabelle;
  text: () => string;
} {
  const fixture = TestBed.createComponent(AngebotKalkulationstabelle);
  fixture.componentRef.setInput('angebot', angebot);
  fixture.detectChanges();
  return {
    komponente: fixture.componentInstance,
    text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
  };
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
    const { komponente } = erzeuge(angebot);
    const positionen = komponente.kalkulation().gruppen[0].positionen;
    expect(positionen[0]).toMatchObject({ pos: 1, gesamtCent: 2400 });
    expect(positionen[1]).toMatchObject({ pos: 2, gesamtCent: 5000 });
    expect(komponente.kalkulation().gesamtCent).toBe(7400);
  });

  it('meldet keine Gruppen für ein Angebot ohne Schichten', () => {
    const { komponente } = erzeuge(erzeugeTestAngebot({ schichten: [] }));
    expect(komponente.kalkulation().gruppen).toHaveLength(0);
  });

  it('zeigt eine Materialpauschale-Zeile, wenn aktiv', () => {
    const { text } = erzeuge(
      erzeugeTestAngebot({ materialpauschaleAktiv: true, materialpauschaleCent: 2500 }),
    );
    expect(text()).toContain('Materialpauschale');
    expect(text()).toContain('25,00');
  });

  it('zeigt die Tabelle mit Materialpauschale auch ohne Schichten, statt des Leerhinweises', () => {
    const { text } = erzeuge(
      erzeugeTestAngebot({
        schichten: [],
        materialpauschaleAktiv: true,
        materialpauschaleCent: 1000,
      }),
    );
    expect(text()).not.toContain('Noch keine Schichten');
    expect(text()).toContain('Materialpauschale');
  });
});
