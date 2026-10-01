import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HiorgEintrag } from '../../models/hiorg-kalender.model';
import { Termin, leererTermin } from '../../models/plan.model';
import { baueHiorgAbgleich } from '../../services/hiorg-abgleich';
import { baueWochenraster } from '../../services/plan-raster';
import { HiorgTagesKarte, baueTagesInhalt } from '../../services/tages-inhalt';
import { Agendaliste } from './agendaliste';

function termin(datum: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), ...aenderung };
}

const HIORG: HiorgEintrag = {
  schluessel: 'liste|2026-03-04|1',
  beginn: '2026-03-04',
  ende: '2026-03-04',
  beginnZeit: '19:00',
  endeZeit: '21:00',
  name: 'Erfundener HiOrg-Dienst',
  art: 'dienst',
  url: null,
  id: '1',
};

describe('Agendaliste', () => {
  let fixture: ComponentFixture<Agendaliste>;

  function aufbauen(
    termine: Termin[],
    hiorg: HiorgEintrag[] = [],
    ebene: 'einzeln' | 'gesammelt' | 'aus' = 'einzeln',
  ): void {
    const alleWochen = baueWochenraster(2026, termine, new Map(), 'Mo');
    const abgleich = baueHiorgAbgleich(hiorg, termine, 2026);
    const inhalte = new Map(
      alleWochen
        .flatMap((w) => w.tage)
        .map((slot) => {
          const karten: HiorgTagesKarte[] = (
            abgleich.nachDatum.get(slot.datum)?.eintraege ?? []
          ).map((eintrag) => ({ eintrag, abweichungen: [], ohneGegenstueck: false }));
          return [slot.datum, baueTagesInhalt(slot.termine, karten, ebene)] as const;
        }),
    );
    const maerz = alleWochen.filter((w) =>
      w.tage.some((t) => t.imJahr && t.datum.startsWith('2026-03')),
    );
    fixture = TestBed.createComponent(Agendaliste);
    fixture.componentRef.setInput('wochen', maerz);
    fixture.componentRef.setInput('tagesInhalte', inhalte);
    fixture.componentRef.setInput('abgleich', abgleich);
    fixture.componentRef.setInput('heute', '2026-03-10');
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const tage = () => [...element().querySelectorAll('article.tag')];
  const chip = (text: string) =>
    [...element().querySelectorAll<HTMLButtonElement>('.filter-chip')].find(
      (b) => b.textContent?.trim() === text,
    )!;

  beforeEach(() => TestBed.configureTestingModule({}));

  it('gruppiert nach Kalenderwoche und lässt leere Tage weg', () => {
    aufbauen([termin('2026-03-04', { thema: 'Erfundenes Thema', kategorie: 'SAN' })]);

    const datums = tage().map((t) => t.querySelector('.datum-nummer')?.textContent?.trim());

    expect(element().querySelectorAll('.woche-kopf').length).toBeGreaterThan(3);
    expect(datums).toContain('04');
    expect(datums).not.toContain('03');
  });

  it('zeigt eine Lücke mit Aktion und meldet das Datum zum Anlegen', () => {
    aufbauen([termin('2026-03-02')]);
    const angelegt: string[] = [];
    fixture.componentInstance.anlegen.subscribe((d) => angelegt.push(d));

    const luecke = tage().find(
      (t) =>
        t.classList.contains('luecke') &&
        t.querySelector('.datum-nummer')?.textContent?.trim() === '02',
    )!;
    luecke.querySelector<HTMLButtonElement>('.luecke-zeile button')!.click();

    expect(luecke.textContent).toContain('ohne Ausbildung');
    expect(angelegt).toEqual(['2026-03-02']);
  });

  it('filtert nach Kategorie und blendet dabei Lücken aus', () => {
    aufbauen([
      termin('2026-03-04', { id: 'a', thema: 'Erfundenes SAN-Thema', kategorie: 'SAN' }),
      termin('2026-03-11', { id: 'b', thema: 'Erfundenes UF-Thema', kategorie: 'UF' }),
    ]);

    chip('SAN').click();
    fixture.detectChanges();

    expect(tage()).toHaveLength(1);
    expect(tage()[0].textContent).toContain('Erfundenes SAN-Thema');
    expect(element().querySelector('.tag.luecke')).toBeNull();
    expect(chip('SAN').getAttribute('aria-pressed')).toBe('true');

    chip('SAN').click();
    fixture.detectChanges();
    expect(tage().length).toBeGreaterThan(1);
  });

  it('filtert nach Typ', () => {
    aufbauen([
      termin('2026-03-07', { id: 'a', thema: 'Erfundener Lehrgang', typ: 'termin' }),
      termin('2026-03-04', { id: 'b', thema: 'Erfundener Dienst', typ: 'dienst' }),
    ]);

    chip('Termine').click();
    fixture.detectChanges();

    expect(tage()).toHaveLength(1);
    expect(tage()[0].textContent).toContain('Erfundener Lehrgang');
  });

  it('zeigt einen Hinweis, wenn kein Tag zu den Filtern passt', () => {
    aufbauen([termin('2026-03-04', { thema: 'Erfundenes Thema', kategorie: 'SAN' })]);

    chip('UF').click();
    fixture.detectChanges();

    expect(tage()).toHaveLength(0);
    expect(element().querySelector('.leer')?.textContent).toContain('Keine Einträge');
  });

  it('zeigt HiOrg-Einträge am Tag und gibt „Als Termin übernehmen“ nach oben', () => {
    aufbauen([], [HIORG]);
    const tag = tage().find((t) => t.textContent?.includes('Erfundener HiOrg-Dienst'));

    expect(tag).toBeDefined();
    expect(tag!.querySelector('app-hiorg-eintrag-karte')).not.toBeNull();
  });

  it('hebt vergangene Tage ab und markiert heute', () => {
    aufbauen([
      termin('2026-03-04', { id: 'a', thema: 'Erfundenes Thema' }),
      termin('2026-03-10', { id: 'b', thema: 'Erfundenes Thema' }),
    ]);

    const nachNummer = (n: string) =>
      tage().find((t) => t.querySelector('.datum-nummer')?.textContent?.trim() === n)!;

    expect(nachNummer('04').classList).toContain('vergangen');
    expect(nachNummer('10').classList).toContain('heute');
    expect(nachNummer('10').classList).not.toContain('vergangen');
  });

  it('klappt die HiOrg-Sammelzeile auf und wieder zu', () => {
    aufbauen(
      [termin('2026-03-04', { thema: 'Erfundenes Thema' })],
      [
        { ...HIORG, name: 'Erfundenes Thema' },
        { ...HIORG, id: '2', schluessel: 'liste|2026-03-04|2', name: 'Erfundenes Thema' },
      ],
      'gesammelt',
    );
    const zeile = () => element().querySelector<HTMLButtonElement>('.sammel-zeile')!;

    expect(zeile().textContent).toContain('2 Einträge');
    expect(element().querySelector('app-hiorg-eintrag-karte')).toBeNull();

    zeile().click();
    fixture.detectChanges();
    expect(element().querySelector('app-hiorg-eintrag-karte')?.textContent).toContain(
      'Erfundenes Thema',
    );

    zeile().click();
    fixture.detectChanges();
    expect(element().querySelector('app-hiorg-eintrag-karte')).toBeNull();
  });

  it('zeigt bei Ebene „aus“ keine HiOrg-Einträge', () => {
    aufbauen([termin('2026-03-04', { thema: 'Erfundenes Thema' })], [HIORG], 'aus');

    expect(element().querySelector('app-hiorg-eintrag-karte')).toBeNull();
    expect(element().querySelector('.sammel-zeile')).toBeNull();
  });

  it('meldet „Termin an diesem Tag“ mit dem Datum und bietet ihn an einer Lücke nicht an', () => {
    aufbauen([termin('2026-03-04', { thema: 'Erfundenes Thema' }), termin('2026-03-02')]);
    const angelegt: string[] = [];
    fixture.componentInstance.anlegen.subscribe((d) => angelegt.push(d));
    const tagMitNummer = (n: string) =>
      tage().find((t) => t.querySelector('.datum-nummer')?.textContent?.trim() === n)!;

    tagMitNummer('04').querySelector<HTMLButtonElement>('.tag-neu')!.click();

    expect(angelegt).toEqual(['2026-03-04']);
    expect(tagMitNummer('02').querySelector('.tag-neu')).toBeNull();
  });

  it('zeigt mit „Nur Lücken“ nur Lückentage', () => {
    aufbauen([termin('2026-03-04', { thema: 'Erfundenes Thema' }), termin('2026-03-02')]);
    fixture.componentRef.setInput('nurLuecken', true);
    fixture.detectChanges();

    expect(tage().length).toBeGreaterThan(0);
    expect(tage().every((t) => t.classList.contains('luecke'))).toBe(true);
  });

  it('zeigt mit „Nur Abweichungen“ nur Tage mit Abweichung', () => {
    aufbauen(
      [
        termin('2026-03-04', { thema: 'Erfundenes Thema', beginnZeit: '19:00' }),
        termin('2026-03-11', { thema: 'Anderes' }),
      ],
      [HIORG],
    );
    fixture.componentRef.setInput('nurAbweichungen', true);
    fixture.detectChanges();

    expect(tage().map((t) => t.querySelector('.datum-nummer')?.textContent?.trim())).toEqual([
      '04',
    ]);
  });
});
