import { describe, expect, it } from 'vitest';
import type { HiorgEintrag } from '../models/hiorg-kalender.model';
import { Termin, leererTermin } from '../models/plan.model';
import { AgendaFilter, KEIN_AGENDAFILTER, baueAgenda } from './agenda';
import { baueWochenraster } from './plan-raster';
import { HiorgTagesKarte, baueTagesInhalt } from './tages-inhalt';

function termin(datum: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), ...aenderung };
}

const HIORG: HiorgEintrag = {
  schluessel: 'agenda|2026-03-04|1',
  beginn: '2026-03-04',
  ende: '2026-03-04',
  beginnZeit: '19:00',
  endeZeit: '21:00',
  name: 'Erfundener HiOrg-Dienst',
  art: 'dienst',
  url: null,
  id: '1',
};

/** Baut Wochen und Tagesinhalte wie der Jahresplan, mit optionalen HiOrg-Karten je Datum. */
function aufbau(
  termine: Termin[],
  hiorg: Record<string, HiorgEintrag[]> = {},
  ebene: 'einzeln' | 'gesammelt' | 'aus' = 'einzeln',
) {
  const wochen = baueWochenraster(2026, termine, new Map(), 'Mo');
  const inhalte = new Map(
    wochen
      .flatMap((w) => w.tage)
      .map((slot) => {
        const karten: HiorgTagesKarte[] = (hiorg[slot.datum] ?? []).map((eintrag) => ({
          eintrag,
          abweichungen: [],
          ohneGegenstueck: false,
        }));
        return [slot.datum, baueTagesInhalt(slot.termine, karten, ebene)] as const;
      }),
  );
  return { wochen, inhalte };
}

function tage(wochen: ReturnType<typeof baueAgenda>) {
  return wochen.flatMap((w) => w.tage);
}

describe('baueAgenda', () => {
  it('lässt leere Tage weg und behält nur Tage mit Einträgen', () => {
    const { wochen, inhalte } = aufbau([
      termin('2026-03-04', { thema: 'Erfundenes Thema', kategorie: 'SAN' }),
    ]);

    const ergebnis = baueAgenda(wochen, inhalte);
    const datums = tage(ergebnis).map((t) => t.slot.datum);

    expect(datums).toContain('2026-03-04');
    // Jeder Montag ist ohne Thema eine Lücke und bleibt deshalb sichtbar; Di/Do/Fr fehlen.
    expect(datums).not.toContain('2026-03-03');
    expect(datums.every((d) => d === '2026-03-04' || new Date(d).getUTCDay() === 1)).toBe(true);
  });

  it('zeigt eine Lücke am Diensttag, aber ohne die Karte des leeren Platzhalters', () => {
    const { wochen, inhalte } = aufbau([termin('2026-03-02')]);

    const tag = tage(baueAgenda(wochen, inhalte)).find((t) => t.slot.datum === '2026-03-02');

    expect(tag?.luecke).toBe(true);
    expect(tag?.karten).toEqual([]);
  });

  it('lässt Wochen ohne sichtbaren Tag weg', () => {
    const { wochen, inhalte } = aufbau([termin('2026-03-04', { thema: 'Erfunden' })]);

    const ergebnis = baueAgenda(wochen, inhalte, { kategorien: new Set(['SAN']), typ: 'alle' });

    expect(ergebnis).toEqual([]);
  });

  it('filtert nach Kategorie und blendet dabei Lücken und HiOrg aus', () => {
    const { wochen, inhalte } = aufbau(
      [
        termin('2026-03-04', { thema: 'Erfundenes SAN-Thema', kategorie: 'SAN' }),
        termin('2026-03-11', { thema: 'Erfundenes UF-Thema', kategorie: 'UF' }),
      ],
      { '2026-03-04': [HIORG] },
    );
    const filter: AgendaFilter = { kategorien: new Set(['SAN']), typ: 'alle' };

    const ergebnis = tage(baueAgenda(wochen, inhalte, filter));

    expect(ergebnis.map((t) => t.slot.datum)).toEqual(['2026-03-04']);
    expect(ergebnis[0].karten.map((k) => k.art)).toEqual(['termin']);
    expect(ergebnis.some((t) => t.luecke)).toBe(false);
  });

  it('filtert nach Typ: Termine ohne Lücken, Dienste mit Lücken', () => {
    const { wochen, inhalte } = aufbau([
      termin('2026-03-07', { thema: 'Erfundener Lehrgang', typ: 'termin' }),
      termin('2026-03-04', { thema: 'Erfundener Dienst', typ: 'dienst' }),
    ]);

    const nurTermine = tage(baueAgenda(wochen, inhalte, { kategorien: new Set(), typ: 'termin' }));
    const nurDienste = tage(baueAgenda(wochen, inhalte, { kategorien: new Set(), typ: 'dienst' }));

    expect(nurTermine.map((t) => t.slot.datum)).toEqual(['2026-03-07']);
    expect(nurDienste.some((t) => t.luecke)).toBe(true);
    expect(nurDienste.map((t) => t.slot.datum)).not.toContain('2026-03-07');
  });

  it('zeigt HiOrg-Einträge ungekürzt, auch wenn das Raster sie sammeln würde', () => {
    const viele = [1, 2, 3, 4].map((n) => ({ ...HIORG, schluessel: `agenda|${n}`, id: String(n) }));
    const { wochen, inhalte } = aufbau([], { '2026-03-04': viele });

    const tag = tage(baueAgenda(wochen, inhalte, KEIN_AGENDAFILTER)).find(
      (t) => t.slot.datum === '2026-03-04',
    );

    expect(tag?.karten).toHaveLength(4);
  });

  it('lässt Randtage des Nachbarjahres weg', () => {
    const { wochen, inhalte } = aufbau([termin('2025-12-29', { thema: 'Erfundenes Vorjahr' })]);

    expect(tage(baueAgenda(wochen, inhalte)).map((t) => t.slot.datum)).not.toContain('2025-12-29');
  });

  it('zeigt bei HiOrg-Ebene „aus“ keine HiOrg-Karten', () => {
    const { wochen, inhalte } = aufbau(
      [termin('2026-03-04', { thema: 'Erfunden' })],
      { '2026-03-04': [HIORG] },
      'aus',
    );

    const tag = tage(baueAgenda(wochen, inhalte)).find((t) => t.slot.datum === '2026-03-04');

    expect(tag?.karten.some((k) => k.art === 'hiorg')).toBe(false);
  });

  it('zeigt bei HiOrg-Ebene „einzeln“ die Karte des Eintrags', () => {
    const { wochen, inhalte } = aufbau([termin('2026-03-04')], { '2026-03-04': [HIORG] });

    const tag = tage(baueAgenda(wochen, inhalte)).find((t) => t.slot.datum === '2026-03-04');

    expect(tag?.karten.some((k) => k.art === 'hiorg')).toBe(true);
  });

  it('zeigt „Nur Lücken“ tagesgenau', () => {
    const { wochen, inhalte } = aufbau([termin('2026-03-04', { thema: 'Erfunden' })]);

    const ergebnis = tage(baueAgenda(wochen, inhalte, { ...KEIN_AGENDAFILTER, nurLuecken: true }));

    expect(ergebnis.length).toBeGreaterThan(0);
    expect(ergebnis.every((t) => t.luecke)).toBe(true);
  });

  it('zeigt „Nur Abweichungen“ tagesgenau', () => {
    const { wochen, inhalte } = aufbau([termin('2026-03-04', { thema: 'Erfunden' })]);

    const ergebnis = tage(
      baueAgenda(wochen, inhalte, {
        ...KEIN_AGENDAFILTER,
        abweichungstage: new Set(['2026-03-04']),
      }),
    );

    expect(ergebnis.map((t) => t.slot.datum)).toEqual(['2026-03-04']);
  });
});
