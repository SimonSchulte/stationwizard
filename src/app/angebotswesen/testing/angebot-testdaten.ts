import { Angebot, Position, Schicht } from '../models/angebot.model';

let laufendeId = 0;
function naechsteId(praefix: string): string {
  laufendeId += 1;
  return `${praefix}-${laufendeId}`;
}

export function erzeugeTestPosition(ueberschreibung: Partial<Position> = {}): Position {
  return {
    id: naechsteId('position'),
    herkunftEintragId: null,
    art: 'einsatzkraft',
    bezeichnung: 'Sanitätshelfer',
    einzelpreisCent: 1200,
    anzahl: 2,
    stunden: 1,
    ...ueberschreibung,
  };
}

export function erzeugeTestSchicht(ueberschreibung: Partial<Schicht> = {}): Schicht {
  return {
    id: naechsteId('schicht'),
    datum: '2026-09-12',
    von: '08:00',
    bis: '20:00',
    positionen: [erzeugeTestPosition()],
    ...ueberschreibung,
  };
}

export function erzeugeTestAngebot(ueberschreibung: Partial<Angebot> = {}): Angebot {
  return {
    id: naechsteId('angebot'),
    bezeichnung: 'Stadtlauf 2026',
    auftraggeber: 'Stadt Testort',
    bemerkung: '',
    schichten: [erzeugeTestSchicht()],
    materialpauschaleAktiv: false,
    materialpauschaleCent: null,
    pauschalpreisAktiv: false,
    pauschalpreisCent: null,
    geaendertAm: '2026-01-01T00:00:00.000Z',
    geaendertVon: 'test@example.invalid',
    ...ueberschreibung,
  };
}
