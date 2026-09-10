import { describe, expect, it } from 'vitest';
import { leseHiorgAntwort } from './hiorg-kalender-parser';

// Frei erfundene Inhalte in der Feldstruktur des echten Feeds.
const BEGINN = Date.UTC(2026, 4, 4, 16, 0, 0) / 1000;
const ENDE = Date.UTC(2026, 4, 4, 20, 0, 0) / 1000;

function rohEintrag(zusatz: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sortdate: BEGINN,
    enddate: ENDE,
    verbez: 'Erfundene Ausbildung Verpflegung',
    typ: 'termin',
    id: 1000001,
    url: 'https://www.hiorg-server.de/formulare.php?ovx=test&rt=t&ri=1000001',
    ...zusatz,
  };
}

function antwort(...eintraege: Record<string, unknown>[]): unknown {
  return { status: 'OK', eintraege };
}

describe('HiOrg-Antwort lesen', () => {
  it('liest einen vollständigen Eintrag in das Domänenmodell', () => {
    const { eintraege, verworfen } = leseHiorgAntwort(antwort(rohEintrag()));

    expect(verworfen).toBe(0);
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toMatchObject({
      beginn: '2026-05-04',
      ende: '2026-05-04',
      name: 'Erfundene Ausbildung Verpflegung',
      art: 'termin',
      url: 'https://www.hiorg-server.de/formulare.php?ovx=test&rt=t&ri=1000001',
    });
  });

  it.each([
    ['fehlendes enddate', {}],
    ['leeres enddate', { enddate: '' }],
    ['enddate null', { enddate: null }],
    ['enddate vor dem Beginn', { enddate: BEGINN - 3600 }],
  ])('macht den Termin bei %s eintägig', (_fall, zusatz) => {
    const roh = rohEintrag(zusatz);
    if (_fall === 'fehlendes enddate') {
      delete roh['enddate'];
    }

    const [eintrag] = leseHiorgAntwort(antwort(roh)).eintraege;

    expect(eintrag?.ende).toBe(eintrag?.beginn);
  });

  it('erkennt einen mehrtägigen Termin', () => {
    const [eintrag] = leseHiorgAntwort(
      antwort(rohEintrag({ enddate: Date.UTC(2026, 4, 6, 12, 0, 0) / 1000 })),
    ).eintraege;

    expect(eintrag).toMatchObject({ beginn: '2026-05-04', ende: '2026-05-06' });
  });

  it('dekodiert Entitäten in der Bezeichnung und normalisiert Whitespace', () => {
    const [eintrag] = leseHiorgAntwort(
      antwort(rohEintrag({ verbez: '  Aufbau &amp;   Abbau  ' })),
    ).eintraege;

    expect(eintrag?.name).toBe('Aufbau & Abbau');
  });

  it.each([
    ['ohne Bezeichnung', { verbez: '   ' }],
    ['mit unbekanntem Typ', { typ: 'kurs' }],
    ['mit sortdate als Text', { sortdate: '1789282800' }],
    ['ohne brauchbare id', { id: null }],
    ['kein Objekt', null],
  ])('verwirft einen unbrauchbaren Datensatz (%s) und behält den Rest', (_fall, zusatz) => {
    const kaputt = zusatz === null ? null : rohEintrag(zusatz);

    const { eintraege, verworfen } = leseHiorgAntwort({
      status: 'OK',
      eintraege: [kaputt, rohEintrag({ id: 1000002, verbez: 'Zweite Ausbildung' })],
    });

    expect(verworfen).toBe(1);
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]?.name).toBe('Zweite Ausbildung');
  });

  it('verwirft einen Link, der nicht als https ankommt', () => {
    const [eintrag] = leseHiorgAntwort(
      antwort(rohEintrag({ url: 'javascript:alert(1)' })),
    ).eintraege;

    expect(eintrag?.url).toBeNull();
  });

  it.each([
    ['kein Objekt', []],
    ['falscher Status', { status: 'FEHLER', eintraege: [] }],
    ['eintraege kein Array', { status: 'OK', eintraege: {} }],
    ['undefined', undefined],
  ])('liefert bei unbrauchbarer Hülle (%s) ein leeres Ergebnis', (_fall, rohdaten) => {
    expect(leseHiorgAntwort(rohdaten)).toEqual({ eintraege: [], verworfen: 0 });
  });

  it('unterscheidet zwei Serientermine mit derselben id', () => {
    const { eintraege } = leseHiorgAntwort(
      antwort(
        rohEintrag(),
        rohEintrag({
          sortdate: Date.UTC(2026, 5, 1, 16, 0, 0) / 1000,
          enddate: Date.UTC(2026, 5, 1, 20, 0, 0) / 1000,
        }),
      ),
    );

    expect(eintraege).toHaveLength(2);
    expect(eintraege[0]?.schluessel).not.toBe(eintraege[1]?.schluessel);
  });

  it('sortiert die Einträge nach Beginn', () => {
    const { eintraege } = leseHiorgAntwort(
      antwort(
        rohEintrag({ sortdate: Date.UTC(2026, 7, 1, 10, 0, 0) / 1000, verbez: 'Später' }),
        rohEintrag({ sortdate: Date.UTC(2026, 1, 1, 10, 0, 0) / 1000, verbez: 'Früher' }),
      ),
    );

    expect(eintraege.map((e) => e.name)).toEqual(['Früher', 'Später']);
  });
});

describe('Uhrzeiten aus dem Feed', () => {
  it('liest Beginn und Ende als Berliner Ortszeit', () => {
    const { eintraege } = leseHiorgAntwort(antwort(rohEintrag()));

    // 16:00 UTC im Mai ist 18:00 Berliner Sommerzeit.
    expect(eintraege[0]).toMatchObject({ beginnZeit: '18:00', endeZeit: '22:00' });
  });

  it('rechnet auch in der Winterzeit auf Ortszeit um', () => {
    const { eintraege } = leseHiorgAntwort(
      antwort(
        rohEintrag({
          sortdate: Date.UTC(2026, 0, 12, 18, 30, 0) / 1000,
          enddate: Date.UTC(2026, 0, 12, 20, 30, 0) / 1000,
        }),
      ),
    );

    // 18:30 UTC im Januar ist 19:30 Berliner Normalzeit.
    expect(eintraege[0]).toMatchObject({ beginnZeit: '19:30', endeZeit: '21:30' });
  });

  it('lässt die Endzeit leer, wenn der Feed kein Ende nennt', () => {
    const { eintraege } = leseHiorgAntwort(antwort(rohEintrag({ enddate: '' })));

    expect(eintraege[0]?.beginnZeit).toBe('18:00');
    expect(eintraege[0]?.endeZeit).toBe('');
  });

  it('sortiert Einträge desselben Tages nach Uhrzeit', () => {
    const { eintraege } = leseHiorgAntwort(
      antwort(
        rohEintrag({ sortdate: Date.UTC(2026, 4, 4, 17, 30, 0) / 1000, verbez: 'Dienstabend' }),
        rohEintrag({ sortdate: Date.UTC(2026, 4, 4, 16, 0, 0) / 1000, verbez: 'Rookies' }),
      ),
    );

    expect(eintraege.map((e) => e.name)).toEqual(['Rookies', 'Dienstabend']);
  });
});
