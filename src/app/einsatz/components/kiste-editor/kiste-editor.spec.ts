import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { Artikel, Kiste } from '../../models/stammdaten.model';
import {
  erzeugeTestArtikel,
  erzeugeTestKiste,
  erzeugeTestLager,
} from '../../testing/stammdaten-testdaten';
import { KisteAenderung, KisteEditor } from './kiste-editor';

const lager = erzeugeTestLager({ name: 'Küchenlager' });
const oel = erzeugeTestArtikel({ name: 'Öl', einheit: 'Liter' });
const salz = erzeugeTestArtikel({ name: 'Salz', einheit: 'Packung' });
const pfeffer = erzeugeTestArtikel({ name: 'Pfeffer', einheit: 'Stück' });
const artikel: Artikel[] = [oel, salz, pfeffer];

function erzeuge(kiste: Kiste) {
  const fixture = TestBed.createComponent(KisteEditor);
  fixture.componentRef.setInput('kiste', kiste);
  fixture.componentRef.setInput('lager', [lager]);
  fixture.componentRef.setInput('artikel', artikel);
  fixture.detectChanges();
  const ereignisse = {
    gespeichert: [] as KisteAenderung[],
    geloescht: 0,
    ungespeichert: [] as boolean[],
  };
  fixture.componentInstance.gespeichert.subscribe((w) => ereignisse.gespeichert.push(w));
  fixture.componentInstance.geloescht.subscribe(() => (ereignisse.geloescht += 1));
  fixture.componentInstance.ungespeichert.subscribe((w) => ereignisse.ungespeichert.push(w));
  return { fixture, element: fixture.nativeElement as HTMLElement, ereignisse };
}

function knopf(element: HTMLElement, text: string): HTMLButtonElement {
  return [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  )!;
}

function zeilen(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>('tbody tr')];
}

describe('KisteEditor', () => {
  const kiste = erzeugeTestKiste({
    name: 'Gewürzkiste',
    lagerId: lager.id,
    inhalt: [
      { artikelId: oel.id, menge: 1, bemerkung: 'voll' },
      { artikelId: salz.id, menge: 2.5, bemerkung: '' },
    ],
  });

  it('zeigt Name, Heimatlager und je Position Artikel, Menge, Einheit und Bemerkung', () => {
    const { element } = erzeuge(kiste);
    expect(element.querySelector<HTMLInputElement>('.name input')?.value).toBe('Gewürzkiste');
    expect(element.textContent).toContain('Inhalt (2)');
    const [erste, zweite] = zeilen(element);
    expect(erste.querySelector('.einheit')?.textContent?.trim()).toBe('Liter');
    expect(erste.querySelector<HTMLInputElement>('td input[type="number"]')?.value).toBe('1');
    expect(erste.querySelectorAll<HTMLInputElement>('td input')[1].value).toBe('voll');
    expect(zweite.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('2.5');
    expect(zweite.querySelector('.einheit')?.textContent?.trim()).toBe('Packung');
  });

  it('beginnt unverändert: Speichern und Verwerfen gesperrt', () => {
    const { element, ereignisse } = erzeuge(kiste);
    expect(knopf(element, 'Speichern').disabled).toBe(true);
    expect(knopf(element, 'Änderungen verwerfen').disabled).toBe(true);
    expect(ereignisse.ungespeichert).not.toContain(true);
  });

  it('meldet eine Änderung des Namens als ungespeichert und speichert sie', () => {
    const { fixture, element, ereignisse } = erzeuge(kiste);
    const feld = element.querySelector<HTMLInputElement>('.name input')!;
    feld.value = ' Neu ';
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(ereignisse.ungespeichert.at(-1)).toBe(true);
    knopf(element, 'Speichern').click();
    expect(ereignisse.gespeichert).toEqual([
      {
        name: 'Neu',
        lagerId: lager.id,
        inhalt: [
          { artikelId: oel.id, menge: 1, bemerkung: 'voll' },
          { artikelId: salz.id, menge: 2.5, bemerkung: '' },
        ],
      },
    ]);
  });

  it('fügt eine Zeile hinzu, schlägt nur noch nicht verwendete Artikel vor und speichert sie', () => {
    const { fixture, element, ereignisse } = erzeuge(kiste);
    knopf(element, 'Artikel hinzufügen').click();
    fixture.detectChanges();
    // Zeile ohne Artikel: Speichern gesperrt, Grund wird genannt
    expect(zeilen(element)).toHaveLength(3);
    expect(knopf(element, 'Speichern').disabled).toBe(true);
    expect(element.textContent).toContain('Jede Zeile braucht einen Artikel.');
    const neue = fixture.debugElement.queryAll(By.css('tbody tr'))[2];
    const auswahl = neue.query(By.css('mat-select'));
    auswahl.triggerEventHandler('selectionChange', { value: pfeffer.id });
    fixture.detectChanges();
    expect(knopf(element, 'Speichern').disabled).toBe(false);
    knopf(element, 'Speichern').click();
    expect(ereignisse.gespeichert[0].inhalt.at(-1)).toEqual({
      artikelId: pfeffer.id,
      menge: 1,
      bemerkung: '',
    });
  });

  it.each([
    ['Menge 0', 0, 'Die Menge muss größer 0 sein'],
    ['Menge mit vier Nachkommastellen', 1.2345, 'Die Menge muss größer 0 sein'],
  ])('sperrt das Speichern bei %s', (_titel, menge, hinweis) => {
    const { fixture, element } = erzeuge(kiste);
    const feld = element.querySelector<HTMLInputElement>('input[type="number"]')!;
    feld.value = String(menge);
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(knopf(element, 'Speichern').disabled).toBe(true);
    expect(element.textContent).toContain(hinweis);
  });

  it('sperrt das Speichern bei leerer Menge und bei leerem Namen', () => {
    const { fixture, element } = erzeuge(kiste);
    const menge = element.querySelector<HTMLInputElement>('input[type="number"]')!;
    menge.value = '';
    menge.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(knopf(element, 'Speichern').disabled).toBe(true);
    const name = element.querySelector<HTMLInputElement>('.name input')!;
    name.value = '  ';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.textContent).toContain('Die Kiste braucht einen Namen.');
  });

  it('entfernt eine Zeile und merkt die Abweichung', () => {
    const { fixture, element, ereignisse } = erzeuge(kiste);
    element.querySelector<HTMLButtonElement>('tbody button[aria-label="Zeile entfernen"]')!.click();
    fixture.detectChanges();
    expect(zeilen(element)).toHaveLength(1);
    expect(ereignisse.ungespeichert.at(-1)).toBe(true);
    knopf(element, 'Speichern').click();
    expect(ereignisse.gespeichert[0].inhalt).toEqual([
      { artikelId: salz.id, menge: 2.5, bemerkung: '' },
    ]);
  });

  it('wählt ein anderes Heimatlager und kann „Kein Heimatlager“ setzen', () => {
    const { fixture, element, ereignisse } = erzeuge(kiste);
    fixture.debugElement.query(By.css('.lager mat-select')).triggerEventHandler('selectionChange', {
      value: null,
    });
    fixture.detectChanges();
    knopf(element, 'Speichern').click();
    expect(ereignisse.gespeichert[0].lagerId).toBeNull();
  });

  it('verwirft den Entwurf und stellt den gespeicherten Stand wieder her', () => {
    const { fixture, element, ereignisse } = erzeuge(kiste);
    const feld = element.querySelector<HTMLInputElement>('.name input')!;
    feld.value = 'Anders';
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    knopf(element, 'Änderungen verwerfen').click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('.name input')?.value).toBe('Gewürzkiste');
    expect(ereignisse.ungespeichert.at(-1)).toBe(false);
  });

  it('beginnt mit dem neuen Stand, wenn sich die Kiste ändert', () => {
    const { fixture, element } = erzeuge(kiste);
    const feld = element.querySelector<HTMLInputElement>('.name input')!;
    feld.value = 'Entwurf';
    feld.dispatchEvent(new Event('input'));
    fixture.componentRef.setInput('kiste', erzeugeTestKiste({ name: 'Andere Kiste', inhalt: [] }));
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('.name input')?.value).toBe('Andere Kiste');
    expect(element.textContent).toContain('Noch kein Material in dieser Kiste.');
  });

  it('meldet das Löschen und sperrt alles während des Speicherns', () => {
    const { fixture, element, ereignisse } = erzeuge(kiste);
    knopf(element, 'Kiste löschen').click();
    expect(ereignisse.geloescht).toBe(1);
    fixture.componentRef.setInput('beschaeftigt', true);
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('.name input')?.disabled).toBe(true);
    expect(knopf(element, 'Kiste löschen').disabled).toBe(true);
    expect(knopf(element, 'Artikel hinzufügen').disabled).toBe(true);
  });

  it('weist ohne Artikel im Katalog auf den Reiter „Artikel“ hin', () => {
    const fixture = TestBed.createComponent(KisteEditor);
    fixture.componentRef.setInput('kiste', erzeugeTestKiste({ inhalt: [] }));
    fixture.componentRef.setInput('lager', []);
    fixture.componentRef.setInput('artikel', []);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Reiter „Artikel“');
  });

  it('sperrt den Druck bei ungespeicherten Änderungen und meldet Schild und Zettel', () => {
    const { fixture, element } = erzeuge(kiste);
    const schild: number[] = [];
    const zettel: number[] = [];
    fixture.componentInstance.schildDrucken.subscribe(() => schild.push(1));
    fixture.componentInstance.zettelDrucken.subscribe(() => zettel.push(1));
    expect(knopf(element, 'Drucken').disabled).toBe(false);
    const feld = element.querySelector<HTMLInputElement>('.name input')!;
    feld.value = 'Anders';
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(knopf(element, 'Drucken').disabled).toBe(true);
    // Der Menüinhalt ist erst beim Öffnen gerendert; die Ausgaben prüft der Seitentest.
    expect(schild).toEqual([]);
    expect(zettel).toEqual([]);
  });
});
