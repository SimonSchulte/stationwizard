import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Lager, Platz } from '../../models/stammdaten.model';
import { erzeugeTestLager } from '../../testing/stammdaten-testdaten';
import { LagerListe } from './lager-liste';

function erzeuge(lager: Lager[], artikelJeLager: Record<string, number> = {}) {
  const fixture = TestBed.createComponent(LagerListe);
  fixture.componentRef.setInput('lager', lager);
  fixture.componentRef.setInput('artikelJeLager', new Map(Object.entries(artikelJeLager)));
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const ereignisse = {
    angelegt: [] as string[],
    umbenannt: [] as { lager: Lager; name: string }[],
    geloescht: [] as Lager[],
    verschoben: [] as { von: number; nach: number }[],
    plaetze: [] as { lager: Lager; plaetze: Platz[] }[],
  };
  fixture.componentInstance.angelegt.subscribe((w) => ereignisse.angelegt.push(w));
  fixture.componentInstance.umbenannt.subscribe((w) => ereignisse.umbenannt.push(w));
  fixture.componentInstance.geloescht.subscribe((w) => ereignisse.geloescht.push(w));
  fixture.componentInstance.verschoben.subscribe((w) => ereignisse.verschoben.push(w));
  fixture.componentInstance.plaetzeGeaendert.subscribe((w) => ereignisse.plaetze.push(w));
  return { fixture, element, ereignisse };
}

function zeilen(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>('li.zeile')];
}

function knopf(zeile: HTMLElement, beschriftung: string): HTMLButtonElement {
  return zeile.querySelector<HTMLButtonElement>(`button[aria-label*="${beschriftung}"]`)!;
}

describe('LagerListe', () => {
  const kuechenlager = erzeugeTestLager({ name: 'Küchenlager', reihenfolge: 1 });
  const kaltlager = erzeugeTestLager({ name: 'Kaltlager', reihenfolge: 2 });

  it('zeigt Nummer, Name und Zahl der Artikel je Lager', () => {
    const { element } = erzeuge([kuechenlager, kaltlager], { [kuechenlager.id]: 3 });
    const z = zeilen(element);
    expect(z).toHaveLength(2);
    expect(z[0].querySelector('.nummer')?.textContent).toBe('1');
    expect(z[0].querySelector<HTMLInputElement>('input')?.value).toBe('Küchenlager');
    expect(z[0].querySelector('.anzahl')?.textContent?.trim()).toBe('3 Artikel');
    expect(z[1].querySelector('.anzahl')?.textContent?.trim()).toBe('0 Artikel');
  });

  it('zeigt bei einer leeren Liste einen Hinweis statt der Liste', () => {
    const { element } = erzeuge([]);
    expect(element.querySelector('ol')).toBeNull();
    expect(element.textContent).toContain('Noch keine Lager');
  });

  it('legt ein Lager an, leert das Feld und ignoriert einen leeren Namen', () => {
    const { fixture, element, ereignisse } = erzeuge([]);
    const feld = element.querySelector<HTMLInputElement>('form.neu input')!;
    feld.value = '   ';
    element.querySelector('form.neu')!.dispatchEvent(new Event('submit'));
    expect(ereignisse.angelegt).toEqual([]);
    feld.value = ' Kfz-Halle ';
    element.querySelector('form.neu')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(ereignisse.angelegt).toEqual(['Kfz-Halle']);
    expect(feld.value).toBe('');
  });

  it('meldet eine Umbenennung und stellt den alten Namen in der Zeile wieder her', () => {
    const { element, ereignisse } = erzeuge([kuechenlager]);
    const feld = zeilen(element)[0].querySelector<HTMLInputElement>('input')!;
    feld.value = 'Kühllager';
    feld.dispatchEvent(new Event('change'));
    expect(ereignisse.umbenannt).toEqual([{ lager: kuechenlager, name: 'Kühllager' }]);
    expect(feld.value).toBe('Küchenlager');
  });

  it('meldet bei leerem oder unverändertem Namen nichts', () => {
    const { element, ereignisse } = erzeuge([kuechenlager]);
    const feld = zeilen(element)[0].querySelector<HTMLInputElement>('input')!;
    feld.value = '  ';
    feld.dispatchEvent(new Event('change'));
    feld.value = ' Küchenlager ';
    feld.dispatchEvent(new Event('change'));
    expect(ereignisse.umbenannt).toEqual([]);
  });

  it('sperrt das Löschen, solange Artikel das Lager nutzen', () => {
    const { fixture, element, ereignisse } = erzeuge([kuechenlager, kaltlager], {
      [kuechenlager.id]: 2,
    });
    const [voll, leer] = zeilen(element);
    expect(knopf(voll, 'löschen').disabled).toBe(true);
    expect(knopf(leer, 'löschen').disabled).toBe(false);
    knopf(leer, 'löschen').click();
    fixture.detectChanges();
    expect(ereignisse.geloescht).toEqual([kaltlager]);
  });

  it('verschiebt mit den Pfeilen und sperrt sie an den Enden', () => {
    const { element, ereignisse } = erzeuge([kuechenlager, kaltlager]);
    const [erstes, letztes] = zeilen(element);
    expect(knopf(erstes, 'nach oben').disabled).toBe(true);
    expect(knopf(letztes, 'nach unten').disabled).toBe(true);
    knopf(erstes, 'nach unten').click();
    knopf(letztes, 'nach oben').click();
    expect(ereignisse.verschoben).toEqual([
      { von: 0, nach: 1 },
      { von: 1, nach: 0 },
    ]);
  });

  it('meldet das Ablegen nach dem Ziehen nur bei geänderter Stelle', () => {
    const { fixture, ereignisse } = erzeuge([kuechenlager, kaltlager]);
    const abgelegt = (
      fixture.componentInstance as unknown as {
        abgelegt(e: Pick<CdkDragDrop<unknown>, 'previousIndex' | 'currentIndex'>): void;
      }
    ).abgelegt.bind(fixture.componentInstance);
    abgelegt({ previousIndex: 1, currentIndex: 1 });
    abgelegt({ previousIndex: 0, currentIndex: 1 });
    expect(ereignisse.verschoben).toEqual([{ von: 0, nach: 1 }]);
  });

  it('sperrt die Eingaben der Zeile, die gerade gespeichert wird', () => {
    const { fixture, element } = erzeuge([kuechenlager, kaltlager]);
    fixture.componentRef.setInput('beschaeftigtId', kaltlager.id);
    fixture.detectChanges();
    const [a, b] = zeilen(element);
    expect(a.querySelector<HTMLInputElement>('input')?.disabled).toBe(false);
    expect(b.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
  });

  describe('Plätze', () => {
    const regal: Platz = { id: 'p1', name: 'Regal' };
    const spinde: Platz = { id: 'p2', name: 'Spinde' };
    const mitPlaetzen = erzeugeTestLager({
      name: 'Kaltlager',
      reihenfolge: 1,
      plaetze: [regal, spinde],
    });

    function oeffnen(verwendung: Record<string, number> = {}) {
      const ergebnis = erzeuge([mitPlaetzen]);
      ergebnis.fixture.componentRef.setInput(
        'verwendungJePlatz',
        new Map(Object.entries(verwendung)),
      );
      zeilen(ergebnis.element)[0]
        .querySelector<HTMLButtonElement>('button[aria-controls]')!
        .click();
      ergebnis.fixture.detectChanges();
      return ergebnis;
    }

    it('zeigt die Zahl der Plätze und klappt sie auf', () => {
      const { element } = erzeuge([mitPlaetzen]);
      const umschalter =
        zeilen(element)[0].querySelector<HTMLButtonElement>('button[aria-controls]')!;
      expect(umschalter.textContent).toContain('2 Plätze');
      expect(element.querySelector('.plaetze')).toBeNull();
      const { element: offen } = oeffnen();
      expect(offen.querySelectorAll('.platz')).toHaveLength(2);
    });

    it('legt einen Platz an, benennt um und entfernt einen unbenutzten', () => {
      const { fixture, element, ereignisse } = oeffnen({ p1: 3 });
      const neu = element.querySelector<HTMLInputElement>('form.platz-neu input')!;
      neu.value = ' Boden ';
      element.querySelector('form.platz-neu')!.dispatchEvent(new Event('submit'));
      expect(ereignisse.plaetze.at(-1)!.plaetze.map((p) => p.name)).toEqual([
        'Regal',
        'Spinde',
        'Boden',
      ]);
      expect(neu.value).toBe('');

      const feld = element.querySelectorAll<HTMLInputElement>('.platz input')[1];
      feld.value = 'Spinde links';
      feld.dispatchEvent(new Event('change'));
      expect(ereignisse.plaetze.at(-1)!.plaetze.map((p) => p.name)).toEqual([
        'Regal',
        'Spinde links',
      ]);
      expect(feld.value).toBe('Spinde');

      const loeschen = [...element.querySelectorAll<HTMLButtonElement>('.platz button')];
      expect(loeschen[0].disabled).toBe(true);
      expect(loeschen[1].disabled).toBe(false);
      loeschen[1].click();
      fixture.detectChanges();
      expect(ereignisse.plaetze.at(-1)!.plaetze).toEqual([regal]);
    });
  });
});
