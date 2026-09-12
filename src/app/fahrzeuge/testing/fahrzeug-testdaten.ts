import {
  Eigentuemer,
  Fahrzeugstamm,
  Kilometerstand,
  Wartungstermin,
} from '../models/fahrzeug.model';

export function erzeugeTestfahrzeug(ueberschreibung: Partial<Fahrzeugstamm> = {}): Fahrzeugstamm {
  return {
    id: crypto.randomUUID(),
    bezeichnung: 'MTW Übung 1',
    funkrufname: 'Florian Testort 1/85/1',
    kennzeichen: 'XY-TE 123',
    fahrgestellnummer: null,
    eigentuemer: 'organisation',
    bemerkung: '',
    wartungstermine: [],
    geaendertAm: '2026-01-05T09:00:00.000Z',
    geaendertVon: 'test@example.invalid',
    ...ueberschreibung,
  };
}

export function erzeugeTestwartung(ueberschreibung: Partial<Wartungstermin> = {}): Wartungstermin {
  return {
    id: crypto.randomUUID(),
    art: 'frei',
    bezeichnung: 'Gerätecheck',
    faelligAm: '2026-12-01',
    erinnerungTage: 30,
    erledigtAm: null,
    ...ueberschreibung,
  };
}

export function erzeugeTestablesung(ueberschreibung: Partial<Kilometerstand> = {}): Kilometerstand {
  return {
    id: crypto.randomUUID(),
    fahrzeugId: 'fahrzeug-1',
    abgelesenAm: '2026-06-01',
    stand: 10_000,
    erfasstAm: '2026-06-01T10:00:00.000Z',
    erfasstVon: 'test@example.invalid',
    quelle: 'formular',
    korrigiert: null,
    bemerkung: '',
    ...ueberschreibung,
  };
}

export function erzeugeEigentuemer(): readonly Eigentuemer[] {
  return ['land-nrw', 'bund', 'organisation'];
}
