import { describe, expect, it } from 'vitest';
import type { HiorgEintrag } from '../models/hiorg-kalender.model';
import { leererTermin } from '../models/plan.model';
import type { HiorgTagesKarte } from './tages-inhalt';
import { baueTagesInhalt } from './tages-inhalt';
import type { SlotTermin } from './plan-raster';

function plantermin(id: string, segment: SlotTermin['segment'] = 'einzeln'): SlotTermin {
  return { termin: { ...leererTermin('2026-08-26'), id, thema: `Thema ${id}` }, segment };
}

function dienst(nummer: number, abweichend = false): HiorgTagesKarte {
  const eintrag: HiorgEintrag = {
    schluessel: `dienst-${nummer}`,
    beginn: '2026-08-26',
    ende: '2026-08-26',
    beginnZeit: '15:00',
    endeZeit: '23:00',
    name: `Erfundener Dienst ${nummer}`,
    art: 'dienst',
    url: 'https://www.hiorg-server.de/formulare.php?ri=1000000',
    id: `100000${nummer}`,
  };
  return {
    eintrag,
    abweichungen: abweichend
      ? [{ terminId: 't1', terminThema: 'Anderes Thema', hiorg: eintrag }]
      : [],
    ohneGegenstueck: !abweichend,
  };
}

describe('Tagesinhalt im Wochenraster', () => {
  it('zeigt einen ruhigen Tag ungekürzt', () => {
    const inhalt = baueTagesInhalt([plantermin('t1')], [dienst(1)], 'einzeln', 3);

    expect(inhalt.sichtbar).toHaveLength(2);
    expect(inhalt.verborgen).toBe(0);
  });

  it('deckelt einen vollen Tag und lässt Platz für den Hinweis auf den Rest', () => {
    const inhalt = baueTagesInhalt(
      [plantermin('t1')],
      [dienst(1), dienst(2), dienst(3), dienst(4)],
      'einzeln',
      3,
    );

    expect(inhalt.sichtbar).toHaveLength(2);
    expect(inhalt.verborgen).toBe(3);
    // Der eigene Plan überlebt die Kürzung, die Fremdquelle wandert ins Detail.
    expect(inhalt.sichtbar[0].art).toBe('termin');
  });

  it('kürzt nie ein Segment eines mehrtägigen Termins weg', () => {
    const inhalt = baueTagesInhalt(
      [plantermin('t1'), plantermin('lehrgang', 'mitte')],
      [dienst(1), dienst(2), dienst(3)],
      'einzeln',
      3,
    );

    expect(inhalt.sichtbar.map((karte) => karte.schluessel)).toEqual(['t1', 'lehrgang']);
  });

  it('behält im gedeckelten Tag die Reihenfolge des Tages bei', () => {
    const inhalt = baueTagesInhalt(
      [plantermin('t1')],
      [dienst(1, true), dienst(2), dienst(3)],
      'einzeln',
      3,
    );

    expect(inhalt.sichtbar.map((karte) => karte.schluessel)).toEqual(['t1', 'dienst-1']);
  });

  it('sammelt ruhige HiOrg-Einträge zu einer Karte, Abweichungen bleiben einzeln', () => {
    const inhalt = baueTagesInhalt(
      [],
      [dienst(1, true), dienst(2), dienst(3), dienst(4)],
      'gesammelt',
      3,
    );

    expect(inhalt.sichtbar.map((karte) => karte.art)).toEqual(['hiorg', 'sammel']);
    const sammel = inhalt.sichtbar[1];
    expect(sammel.art === 'sammel' && sammel.anzahl).toBe(3);
    expect(inhalt.verborgen).toBe(0);
  });

  it('sammelt einen einzelnen HiOrg-Eintrag nicht ein', () => {
    const inhalt = baueTagesInhalt([], [dienst(1)], 'gesammelt', 3);

    expect(inhalt.sichtbar.map((karte) => karte.art)).toEqual(['hiorg']);
  });

  it('blendet die HiOrg-Ebene auf Wunsch ganz aus', () => {
    const inhalt = baueTagesInhalt([plantermin('t1')], [dienst(1), dienst(2)], 'aus', 3);

    expect(inhalt.sichtbar.map((karte) => karte.art)).toEqual(['termin']);
    expect(inhalt.verborgen).toBe(0);
  });

  it('hält im Tagesdetail immer den ganzen Tag bereit, unabhängig von Ebene und Deckelung', () => {
    const inhalt = baueTagesInhalt([plantermin('t1')], [dienst(1), dienst(2), dienst(3)], 'aus', 3);

    expect(inhalt.alle.map((karte) => karte.art)).toEqual(['termin', 'hiorg', 'hiorg', 'hiorg']);
  });
});
