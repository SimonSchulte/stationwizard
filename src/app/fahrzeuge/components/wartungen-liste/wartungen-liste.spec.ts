import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { WartungenListe } from './wartungen-liste';
import { erzeugeTestfahrzeug, erzeugeTestwartung } from '../../testing/fahrzeug-testdaten';

function erzeuge(fahrzeuge: ReturnType<typeof erzeugeTestfahrzeug>[]): WartungenListe {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(WartungenListe);
  fixture.componentRef.setInput('fahrzeuge', fahrzeuge);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('WartungenListe', () => {
  it('zeigt standardmäßig nur offene Termine, sortiert nach Fälligkeit', () => {
    const fahrzeug = erzeugeTestfahrzeug({
      wartungstermine: [
        erzeugeTestwartung({ id: 'spaeter', faelligAm: '2026-06-01' }),
        erzeugeTestwartung({ id: 'bald', faelligAm: '2026-01-10' }),
        erzeugeTestwartung({ id: 'erledigt', faelligAm: '2026-01-01', erledigtAm: '2026-01-01' }),
      ],
    });
    const komponente = erzeuge([fahrzeug]);
    expect(komponente.eintraege().map((e) => e.status.termin.id)).toEqual(['bald', 'spaeter']);
  });

  it('zeigt erledigte Termine erst nach dem Umschalten', () => {
    const fahrzeug = erzeugeTestfahrzeug({
      wartungstermine: [erzeugeTestwartung({ id: 'erledigt', erledigtAm: '2026-01-01' })],
    });
    const komponente = erzeuge([fahrzeug]);
    expect(komponente.eintraege()).toHaveLength(0);

    komponente.erledigteAnzeigen.set(true);
    expect(komponente.eintraege().map((e) => e.status.termin.id)).toEqual(['erledigt']);
  });
});
