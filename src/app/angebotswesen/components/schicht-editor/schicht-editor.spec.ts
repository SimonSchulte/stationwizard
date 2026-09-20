import { TestBed } from '@angular/core/testing';
import { MatDatepickerInputEvent } from '@angular/material/datepicker';
import { describe, expect, it } from 'vitest';
import { SchichtEditor } from './schicht-editor';
import { Schicht } from '../../models/angebot.model';
import { PreiskatalogEintrag } from '../../models/preiskatalog.model';
import { erzeugeTestSchicht } from '../../testing/angebot-testdaten';
import { erzeugeTestPreiskatalogEintrag } from '../../testing/preiskatalog-testdaten';

function erzeuge(
  schicht: Schicht = erzeugeTestSchicht({ positionen: [] }),
  katalog: PreiskatalogEintrag[] = [],
): {
  komponente: SchichtEditor;
  emittiert: unknown[];
} {
  const fixture = TestBed.createComponent(SchichtEditor);
  fixture.componentRef.setInput('schicht', schicht);
  fixture.componentRef.setInput('katalog', katalog);
  const emittiert: unknown[] = [];
  fixture.componentInstance.schichtGeaendert.subscribe((wert) => emittiert.push(wert));
  fixture.detectChanges();
  return { komponente: fixture.componentInstance, emittiert };
}

describe('SchichtEditor', () => {
  it('berechnet die Schichtdauer bei gültiger Zeitspanne', () => {
    const { komponente } = erzeuge(
      erzeugeTestSchicht({ von: '08:00', bis: '20:00', positionen: [] }),
    );
    expect(komponente.stundenAnzeige()).toBe(12);
  });

  it('meldet eine ungültige Zeitspanne, statt eine falsche Dauer anzuzeigen', () => {
    const { komponente } = erzeuge(
      erzeugeTestSchicht({ von: '20:00', bis: '08:00', positionen: [] }),
    );
    expect(komponente.zeitGueltig()).toBe(false);
    expect(komponente.stundenAnzeige()).toBeNull();
  });

  it('übernimmt beim Hinzufügen aus dem Katalog Bezeichnung, Preis und Art', () => {
    const eintrag = erzeugeTestPreiskatalogEintrag({
      id: 'k-1',
      bezeichnung: 'Notarzt',
      art: 'einsatzkraft',
      einzelpreisCent: 5000,
    });
    const { komponente, emittiert } = erzeuge(
      erzeugeTestSchicht({ von: '08:00', bis: '20:00', positionen: [] }),
      [eintrag],
    );
    komponente.katalogPositionHinzufuegen('k-1');
    const letzte = emittiert.at(-1) as {
      positionen: { bezeichnung: string; einzelpreisCent: number; stunden: number | null }[];
    };
    expect(letzte.positionen[0]).toMatchObject({
      bezeichnung: 'Notarzt',
      einzelpreisCent: 5000,
      stunden: 12,
    });
  });

  it('setzt stunden auf null, wenn die Art auf fahrzeug wechselt', () => {
    const schicht = erzeugeTestSchicht({
      positionen: [
        {
          id: 'p-1',
          herkunftEintragId: null,
          art: 'einsatzkraft',
          bezeichnung: 'X',
          einzelpreisCent: 1000,
          anzahl: 1,
          stunden: 4,
        },
      ],
    });
    const { komponente, emittiert } = erzeuge(schicht);
    komponente.positionArtAktualisieren(schicht.positionen[0], 'fahrzeug');
    const letzte = emittiert.at(-1) as { positionen: { stunden: number | null }[] };
    expect(letzte.positionen[0].stunden).toBeNull();
  });

  it('aktualisiert das Datum aus dem Datepicker als ISO-Wert', () => {
    const { komponente, emittiert } = erzeuge(
      erzeugeTestSchicht({ datum: '2026-01-01', positionen: [] }),
    );
    komponente.datumAktualisieren({
      value: new Date(2026, 5, 12),
    } as MatDatepickerInputEvent<Date>);
    const letzte = emittiert.at(-1) as { datum: string };
    expect(letzte.datum).toBe('2026-06-12');
  });

  it('ignoriert ein Datepicker-Ereignis ohne Wert', () => {
    const { komponente, emittiert } = erzeuge(
      erzeugeTestSchicht({ datum: '2026-01-01', positionen: [] }),
    );
    komponente.datumAktualisieren({ value: null } as MatDatepickerInputEvent<Date>);
    expect(emittiert).toHaveLength(0);
  });

  it('aktualisiert von/bis aus dem Timepicker als HH:MM', () => {
    const { komponente, emittiert } = erzeuge(
      erzeugeTestSchicht({ von: '08:00', bis: '20:00', positionen: [] }),
    );
    komponente.vonAktualisieren(new Date(2000, 0, 1, 9, 15));
    komponente.bisAktualisieren(new Date(2000, 0, 1, 17, 45));
    expect(emittiert.at(-2)).toMatchObject({ von: '09:15' });
    expect(emittiert.at(-1)).toMatchObject({ bis: '17:45' });
  });

  it('ignoriert ein Timepicker-Ereignis ohne Wert', () => {
    const { komponente, emittiert } = erzeuge(
      erzeugeTestSchicht({ von: '08:00', bis: '20:00', positionen: [] }),
    );
    komponente.vonAktualisieren(null);
    komponente.bisAktualisieren(null);
    expect(emittiert).toHaveLength(0);
  });

  it('entfernt eine Position', () => {
    const schicht = erzeugeTestSchicht({
      positionen: [
        {
          id: 'p-1',
          herkunftEintragId: null,
          art: 'einsatzkraft',
          bezeichnung: 'X',
          einzelpreisCent: 1000,
          anzahl: 1,
          stunden: 1,
        },
      ],
    });
    const { komponente, emittiert } = erzeuge(schicht);
    komponente.positionEntfernen('p-1');
    const letzte = emittiert.at(-1) as { positionen: unknown[] };
    expect(letzte.positionen).toHaveLength(0);
  });
});
