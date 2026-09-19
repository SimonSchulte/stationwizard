import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AUFGABENQUELLE,
  type Aufgabe,
  type Aufgabenquelle,
} from '../../../kern/aufgaben/aufgabenquelle';
import { AufgabenUebersicht } from './aufgaben-uebersicht';

function aufgabe(id: string, quelle: string, eingegangenAm: string): Aufgabe {
  return {
    id,
    quelle,
    titel: `Aufgabe ${id}`,
    beschreibung: 'Beschreibung',
    eingegangenAm,
    routerLink: ['/aufgaben', 'kilometermeldungen'],
    dringlichkeit: 'normal',
  };
}

async function erzeuge(...quellen: Aufgabenquelle[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      ...quellen.map((q) => ({ provide: AUFGABENQUELLE, useValue: q, multi: true })),
    ],
  });
  const komponente = TestBed.createComponent(AufgabenUebersicht);
  await komponente.componentInstance.bereit;
  komponente.detectChanges();
  return komponente;
}

describe('AufgabenUebersicht', () => {
  it('zeigt den Leerzustand ohne Aufgaben', async () => {
    const fixture = await erzeuge({
      kennung: 'a',
      bezeichnung: 'Quelle A',
      ladeAufgaben: async () => [],
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Keine offenen Aufgaben');
  });

  it('gruppiert nach Quelle und verlinkt das Ziel', async () => {
    const fixture = await erzeuge(
      {
        kennung: 'a',
        bezeichnung: 'Kilometermeldungen',
        ladeAufgaben: async () => [aufgabe('a1', 'a', '2026-09-15T08:00:00.000Z')],
      },
      {
        kennung: 'b',
        bezeichnung: 'Andere',
        ladeAufgaben: async () => [aufgabe('b1', 'b', '2026-09-15T09:00:00.000Z')],
      },
    );
    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent ?? '';
    expect(text).toContain('Kilometermeldungen (1)');
    expect(text).toContain('Andere (1)');
    expect(element.querySelectorAll('.aufgabe')).toHaveLength(2);
  });

  it('benennt eine ausgefallene Quelle, statt sie zu verschweigen', async () => {
    const fixture = await erzeuge(
      {
        kennung: 'a',
        bezeichnung: 'Kilometermeldungen',
        ladeAufgaben: async () => {
          throw new Error('Server nicht erreichbar');
        },
      },
      {
        kennung: 'b',
        bezeichnung: 'Andere',
        ladeAufgaben: async () => [aufgabe('b1', 'b', '2026-09-15T09:00:00.000Z')],
      },
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Kilometermeldungen: Server nicht erreichbar');
    // Die andere Quelle bleibt sichtbar.
    expect(text).toContain('Andere (1)');
  });
});
