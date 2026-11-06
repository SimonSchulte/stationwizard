import type { HiorgEintrag } from '../../ausbildung/models/hiorg-kalender.model';
import type { HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';

/** Erfundener Feed-Eintrag; Teilangaben überschreiben die Vorgabe. */
export function testFeedEintrag(teil: Partial<HiorgEintrag> = {}): HiorgEintrag {
  const eintrag: HiorgEintrag = {
    schluessel: '4711|2026-12-05|2026-12-05|Weihnachtsmarkt Ummeln',
    beginn: '2026-12-05',
    ende: '2026-12-05',
    beginnZeit: '10:00',
    endeZeit: '20:30',
    name: 'Weihnachtsmarkt Ummeln',
    art: 'dienst',
    url: null,
    id: '4711',
    ...teil,
  };
  return eintrag;
}

/** Erfundene Veranstaltung mit einer Schicht; Teilangaben überschreiben die Vorgabe. */
export function testVeranstaltung(teil: Partial<HiorgVeranstaltung> = {}): HiorgVeranstaltung {
  return {
    veranstaltungId: 'dienst-4711',
    art: 'dienst',
    titel: 'Weihnachtsmarkt Ummeln',
    beginn: '2026-12-05T10:00',
    ende: '2026-12-05T20:30',
    schichten: [testFeedEintrag()],
    ...teil,
  };
}
