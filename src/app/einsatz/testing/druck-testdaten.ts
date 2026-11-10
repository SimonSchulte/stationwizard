import { DruckAbschnitt, DruckInhalt, DruckLaufzettel, DruckPosition } from '../models/druck.model';
import { Einsatz } from '../models/einsatz.model';

/** Testdaten werden im Test erzeugt; die Ids sind echte UUIDs, damit die Prüfungen greifen. */
export function testPosition(ueberschreibung: Partial<DruckPosition> = {}): DruckPosition {
  return {
    id: crypto.randomUUID(),
    herkunftId: null,
    anzahl: '2',
    material: 'Kiste Wasser',
    ...ueberschreibung,
  };
}

export function testLaufzettel(ueberschreibung: Partial<DruckLaufzettel> = {}): DruckLaufzettel {
  return {
    id: crypto.randomUUID(),
    herkunftId: null,
    ueberschrift: 'Material verlasten',
    lagerort: 'Lager Nord',
    transportMit: 'Rollwagen',
    auftraggeber: 'GF Betreuung',
    fachgruppe: 'betreuung',
    positionen: [testPosition()],
    ...ueberschreibung,
  };
}

export function testAbschnitt(ueberschreibung: Partial<DruckAbschnitt> = {}): DruckAbschnitt {
  return {
    id: crypto.randomUUID(),
    herkunftId: null,
    titel: 'GF Betreuung',
    farbe: 'abschnitt-1',
    fachgruppe: 'betreuung',
    laufzettel: [testLaufzettel()],
    ...ueberschreibung,
  };
}

export function testInhalt(ueberschreibung: Partial<DruckInhalt> = {}): DruckInhalt {
  return { anweisungen: 'Treffpunkt 8 Uhr', abschnitte: [testAbschnitt()], ...ueberschreibung };
}

export function testEinsatz(ueberschreibung: Partial<Einsatz> = {}): Einsatz {
  return {
    id: crypto.randomUUID(),
    titel: 'Weihnachtsmarkt',
    beginn: '2026-12-05T10:00',
    ende: '2026-12-05T20:00',
    ort: 'Ummeln',
    hiorgVeranstaltungId: null,
    ...ueberschreibung,
  };
}
