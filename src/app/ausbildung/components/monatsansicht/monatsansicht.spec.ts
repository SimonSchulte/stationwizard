import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { HiorgEintrag } from '../../models/hiorg-kalender.model';
import { Termin, leererTermin } from '../../models/plan.model';
import { baueHiorgAbgleich } from '../../services/hiorg-abgleich';
import { baueWochenraster } from '../../services/plan-raster';
import { HiorgTagesKarte, baueTagesInhalt } from '../../services/tages-inhalt';
import { Monatsansicht } from './monatsansicht';

function termin(datum: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), ...aenderung };
}

const HIORG: HiorgEintrag = {
  schluessel: 'monat|2026-03-04|1',
  beginn: '2026-03-04',
  ende: '2026-03-04',
  beginnZeit: '19:00',
  endeZeit: '21:00',
  name: 'Erfundener HiOrg-Dienst',
  art: 'dienst',
  url: null,
  id: '1',
};

/** Wochen, Tagesinhalte und Abgleich so gebaut wie im Jahresplan. */
function daten(termine: Termin[], hiorg: HiorgEintrag[] = []) {
  const wochen = baueWochenraster(
    2026,
    termine,
    new Map([['2026-03-05', 'Erfundener Feiertag']]),
    'Mo',
  );
  const abgleich = baueHiorgAbgleich(hiorg, termine, 2026);
  const inhalte = new Map(
    wochen
      .flatMap((w) => w.tage)
      .map((slot) => {
        const karten: HiorgTagesKarte[] = (abgleich.nachDatum.get(slot.datum)?.eintraege ?? []).map(
          (eintrag) => ({ eintrag, abweichungen: [], ohneGegenstueck: false }),
        );
        return [slot.datum, baueTagesInhalt(slot.termine, karten, 'einzeln')] as const;
      }),
  );
  const imMaerz = wochen.filter((w) =>
    w.tage.some((t) => t.imJahr && t.datum.startsWith('2026-03')),
  );
  return { wochen: imMaerz, inhalte, abgleich };
}

describe('Monatsansicht', () => {
  let fixture: ComponentFixture<Monatsansicht>;

  function aufbauen(termine: Termin[], hiorg: HiorgEintrag[] = [], heute = '2026-03-04'): void {
    const d = daten(termine, hiorg);
    fixture = TestBed.createComponent(Monatsansicht);
    fixture.componentRef.setInput('wochen', d.wochen);
    fixture.componentRef.setInput('tagesInhalte', d.inhalte);
    fixture.componentRef.setInput('abgleich', d.abgleich);
    fixture.componentRef.setInput('heute', heute);
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const agendaTitel = () => element().querySelector('.agenda h2')?.textContent?.trim();
  const zahlKnopf = (tag: string) =>
    [...element().querySelectorAll<HTMLButtonElement>('.tag-nummer')].find(
      (b) => b.textContent?.trim() === tag && !b.disabled,
    );

  beforeEach(() => TestBed.configureTestingModule({}));

  it('zeigt zunächst die Agenda des heutigen Tages', () => {
    aufbauen([termin('2026-03-04', { thema: 'Erfundenes Thema' })]);

    expect(agendaTitel()).toContain('04.03.2026');
    expect(element().querySelectorAll('.agenda app-termin-karte')).toHaveLength(1);
  });

  it('wählt einen Tag über seine Tageszahl und meldet die Wahl', () => {
    aufbauen([termin('2026-03-11', { thema: 'Erfundenes Thema' })]);
    const gewaehlt: string[] = [];
    fixture.componentInstance.tagGewaehlt.subscribe((d) => gewaehlt.push(d));

    zahlKnopf('11')!.click();
    fixture.detectChanges();

    expect(gewaehlt).toEqual(['2026-03-11']);
    expect(agendaTitel()).toContain('11.03.2026');
  });

  it('zeigt in der Agenda alle Einträge eines Tages, auch die, die das Raster kürzt', () => {
    const viele = [1, 2, 3, 4, 5].map((n) =>
      termin('2026-03-04', { id: `t${n}`, thema: `Erfundenes Thema ${n}` }),
    );
    aufbauen(viele);

    expect(element().querySelectorAll('.agenda app-termin-karte')).toHaveLength(5);
    expect(element().querySelectorAll('.tag-zelle.gewaehlt app-termin-karte').length).toBeLessThan(
      5,
    );
    expect(element().querySelector('.tag-zelle.gewaehlt .weitere-karten')).not.toBeNull();
  });

  it('behält die Wahl, wenn sich die Wochen durch eine Bearbeitung ändern', () => {
    aufbauen([termin('2026-03-11', { thema: 'Erfundenes Thema' })]);
    zahlKnopf('11')!.click();
    fixture.detectChanges();

    const neu = daten([termin('2026-03-11', { thema: 'Geändertes Thema' })]);
    fixture.componentRef.setInput('wochen', neu.wochen);
    fixture.componentRef.setInput('tagesInhalte', neu.inhalte);
    fixture.detectChanges();

    expect(agendaTitel()).toContain('11.03.2026');
    expect(element().querySelector('.agenda app-termin-karte')?.textContent).toContain(
      'Geändertes Thema',
    );
  });

  it('fällt auf einen sichtbaren Tag zurück, wenn der gewählte nicht mehr im Ausschnitt liegt', () => {
    aufbauen([]);
    zahlKnopf('11')!.click();
    fixture.detectChanges();

    const april = baueWochenraster(2026, [], new Map(), 'Mo').filter((w) =>
      w.tage.some((t) => t.imJahr && t.datum.startsWith('2026-04-2')),
    );
    fixture.componentRef.setInput('wochen', april);
    fixture.detectChanges();

    expect(agendaTitel()).not.toContain('11.03.2026');
    expect(agendaTitel()).toContain('.04.2026');
  });

  it('kennzeichnet eine Lücke und einen Feiertag in der Agenda', () => {
    aufbauen([termin('2026-03-02')]);
    zahlKnopf('02')!.click();
    fixture.detectChanges();
    expect(element().querySelector('.agenda .luecke-marke')?.textContent).toContain(
      'ohne Ausbildung',
    );

    zahlKnopf('05')!.click();
    fixture.detectChanges();
    expect(element().querySelector('.agenda .feiertag')?.textContent).toContain(
      'Erfundener Feiertag',
    );
  });

  it('meldet „Termin an diesem Tag“ mit dem gewählten Datum', () => {
    aufbauen([]);
    const angelegt: string[] = [];
    fixture.componentInstance.anlegen.subscribe((d) => angelegt.push(d));

    element().querySelector<HTMLButtonElement>('.agenda-neu')!.click();

    expect(angelegt).toEqual(['2026-03-04']);
  });

  it('lässt Randtage des Nachbarjahres nicht wählen', () => {
    const d = daten([]);
    const januar = baueWochenraster(2026, [], new Map(), 'Mo').slice(0, 1);
    fixture = TestBed.createComponent(Monatsansicht);
    fixture.componentRef.setInput('wochen', januar);
    fixture.componentRef.setInput('tagesInhalte', d.inhalte);
    fixture.componentRef.setInput('abgleich', d.abgleich);
    fixture.componentRef.setInput('heute', '2026-01-02');
    fixture.detectChanges();

    const gesperrt = [...element().querySelectorAll<HTMLButtonElement>('.tag-nummer')].filter(
      (b) => b.disabled,
    );

    expect(gesperrt).toHaveLength(3);
  });

  it('gibt eine Ablage auf einer Karte mit dem Zieltermin nach oben', () => {
    const ziel = termin('2026-03-04', { id: 'ziel', thema: 'Erfundenes Thema' });
    aufbauen([ziel]);
    const ablagen: unknown[] = [];
    fixture.componentInstance.aufTerminAbgelegt.subscribe((a) => ablagen.push(a));
    const ereignis = { item: { data: null } };

    fixture.debugElement
      .query(By.css('.tag-zelle .mini-slot:not(.leer)'))
      .triggerEventHandler('cdkDropListDropped', ereignis);

    expect(ablagen).toEqual([{ event: ereignis, ziel }]);
  });

  it('gibt eine Ablage auf einem freien Tag mit dessen Datum nach oben', () => {
    aufbauen([]);
    const ablagen: { datum: string }[] = [];
    fixture.componentInstance.aufLeeremTagAbgelegt.subscribe((a) => ablagen.push(a));

    fixture.debugElement
      .query(By.css('.tag-zelle .mini-slot.leer'))
      .triggerEventHandler('cdkDropListDropped', { item: { data: null } });

    expect(ablagen).toHaveLength(1);
    expect(ablagen[0].datum).toMatch(/^2026-0[23]-\d\d$/);
  });

  it('zeigt HiOrg-Einträge in der Agenda unter eigener Überschrift', () => {
    aufbauen([], [HIORG]);

    expect(element().querySelector('.agenda app-hiorg-eintrag-karte')?.textContent).toContain(
      'Erfundener HiOrg-Dienst',
    );
  });

  it('beschriftet Wochen nach dem Monat ihres Donnerstags, nicht ihres Montags', () => {
    const d = daten([]);
    const september = baueWochenraster(2026, [], new Map(), 'Mo').filter((w) =>
      w.tage.some((t) => t.imJahr && t.datum.startsWith('2026-09')),
    );
    fixture = TestBed.createComponent(Monatsansicht);
    fixture.componentRef.setInput('wochen', september);
    fixture.componentRef.setInput('tagesInhalte', d.inhalte);
    fixture.componentRef.setInput('abgleich', d.abgleich);
    fixture.componentRef.setInput('heute', '2026-09-10');
    fixture.detectChanges();

    // Die Woche 31.08.–06.09. beginnt im August, ihr Donnerstag liegt im September.
    const marken = [...element().querySelectorAll('.monatsmarke')].map((m) =>
      m.textContent?.trim(),
    );
    expect(marken[0]).toBe('September');
    expect(marken).not.toContain('August');
  });

  it('gibt Monatsmarken nur ihre eigene Zeilenhöhe, den Wochen gleich viel', () => {
    aufbauen([]);

    const zeilen = fixture.componentInstance.zeilen().split(' minmax(72px, 1fr)');

    expect(fixture.componentInstance.zeilen().startsWith('auto')).toBe(true);
    expect(zeilen.length - 1).toBe(fixture.componentInstance.wochen().length);
    expect(fixture.componentInstance.zeilen()).toContain('auto minmax(72px, 1fr)');
  });

  it('blendet HiOrg in der Agenda bei Ebene „aus“ aus', () => {
    aufbauen([], [HIORG]);
    fixture.componentRef.setInput('hiorgEbene', 'aus');
    fixture.detectChanges();

    expect(element().querySelector('.agenda app-hiorg-eintrag-karte')).toBeNull();
  });
});
