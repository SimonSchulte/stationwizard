import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { Artikel, Lager } from '../../models/stammdaten.model';
import { erzeugeTestArtikel, erzeugeTestLager } from '../../testing/stammdaten-testdaten';
import { ArtikelTabelle } from './artikel-tabelle';

const kalt = erzeugeTestLager({ name: 'Kaltlager', reihenfolge: 1 });

function erzeuge(artikel: Artikel[], lager: Lager[] = [kalt]) {
  const fixture = TestBed.createComponent(ArtikelTabelle);
  fixture.componentRef.setInput('artikel', artikel);
  fixture.componentRef.setInput('lager', lager);
  fixture.detectChanges();
  const ereignisse = {
    angelegt: [] as unknown[],
    geaendert: [] as unknown[],
    geloescht: [] as Artikel[],
  };
  fixture.componentInstance.angelegt.subscribe((w) => ereignisse.angelegt.push(w));
  fixture.componentInstance.geaendert.subscribe((w) => ereignisse.geaendert.push(w));
  fixture.componentInstance.geloescht.subscribe((w) => ereignisse.geloescht.push(w));
  return { fixture, element: fixture.nativeElement as HTMLElement, ereignisse };
}

function namen(element: HTMLElement): string[] {
  return [...element.querySelectorAll<HTMLInputElement>('tbody tr td:first-child input')].map(
    (i) => i.value,
  );
}

function viele(anzahl: number): Artikel[] {
  return Array.from({ length: anzahl }, (_, n) =>
    erzeugeTestArtikel({ name: `Artikel ${String(n).padStart(3, '0')}` }),
  );
}

describe('ArtikelTabelle', () => {
  it('zeigt einen Hinweis ohne Artikel und eine Tabelle mit Artikeln', () => {
    const leer = erzeuge([]);
    expect(leer.element.querySelector('table')).toBeNull();
    expect(leer.element.textContent).toContain('Noch keine Artikel');
    const gefuellt = erzeuge([erzeugeTestArtikel({ name: 'Besen' })]);
    expect(namen(gefuellt.element)).toEqual(['Besen']);
  });

  it('legt einen Artikel mit Standardeinheit und ohne Heimatlager an und leert das Feld', () => {
    const { fixture, element, ereignisse } = erzeuge([]);
    const feld = element.querySelector<HTMLInputElement>('form.neu input')!;
    feld.value = '  ';
    element.querySelector('form.neu')!.dispatchEvent(new Event('submit'));
    expect(ereignisse.angelegt).toEqual([]);
    feld.value = ' Besen ';
    element.querySelector('form.neu')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(ereignisse.angelegt).toEqual([{ name: 'Besen', einheit: 'Stück', lagerId: null }]);
    expect(feld.value).toBe('');
  });

  it('übernimmt gewählte Einheit und Heimatlager beim Anlegen', () => {
    const { fixture, element, ereignisse } = erzeuge([]);
    const auswahl = fixture.debugElement.queryAll(By.css('form.neu mat-select'));
    auswahl[0].triggerEventHandler('selectionChange', { value: 'Liter' });
    auswahl[1].triggerEventHandler('selectionChange', { value: kalt.id });
    const feld = element.querySelector<HTMLInputElement>('form.neu input')!;
    feld.value = 'Wasser';
    element.querySelector('form.neu')!.dispatchEvent(new Event('submit'));
    expect(ereignisse.angelegt).toEqual([{ name: 'Wasser', einheit: 'Liter', lagerId: kalt.id }]);
  });

  it('filtert nach Suchbegriff ohne Groß-/Kleinschreibung und blendet Seiten neu ein', () => {
    const artikel = [
      erzeugeTestArtikel({ name: 'Gasflasche 5 kg' }),
      erzeugeTestArtikel({ name: 'Besen' }),
      erzeugeTestArtikel({ name: 'Gasgrill' }),
    ];
    const { fixture, element } = erzeuge(artikel);
    fixture.debugElement.query(By.css('app-suchfeld')).triggerEventHandler('wertChange', '  GAS');
    fixture.detectChanges();
    expect(namen(element)).toEqual(['Gasflasche 5 kg', 'Gasgrill']);
    fixture.debugElement.query(By.css('app-suchfeld')).triggerEventHandler('wertChange', 'xyz');
    fixture.detectChanges();
    expect(element.textContent).toContain('Keine Treffer');
  });

  it('filtert auf Artikel ohne Heimatlager und zählt sie', () => {
    const artikel = [
      erzeugeTestArtikel({ name: 'Mit', lagerId: kalt.id }),
      erzeugeTestArtikel({ name: 'Ohne' }),
    ];
    const { fixture, element } = erzeuge(artikel);
    expect(element.textContent).toContain('Ohne Heimatlager (1)');
    fixture.debugElement
      .query(By.css('mat-button-toggle-group'))
      .triggerEventHandler('change', { value: 'ohne-lager' });
    fixture.detectChanges();
    expect(namen(element)).toEqual(['Ohne']);
  });

  it('zeigt höchstens 50 Zeilen je Seite und wechselt die Seite', () => {
    const { fixture, element } = erzeuge(viele(120));
    expect(namen(element)).toHaveLength(50);
    expect(namen(element)[0]).toBe('Artikel 000');
    fixture.debugElement
      .query(By.css('mat-paginator'))
      .triggerEventHandler('page', { pageIndex: 2 });
    fixture.detectChanges();
    expect(namen(element)).toHaveLength(20);
    expect(namen(element)[0]).toBe('Artikel 100');
  });

  it('meldet Umbenennung (alter Name bleibt stehen), Einheit, Heimatlager und Löschen', () => {
    const besen = erzeugeTestArtikel({ name: 'Besen', lagerId: kalt.id });
    const { fixture, element, ereignisse } = erzeuge([besen]);
    const feld = element.querySelector<HTMLInputElement>('tbody input')!;
    feld.value = 'Handfeger';
    feld.dispatchEvent(new Event('change'));
    expect(feld.value).toBe('Besen');
    const auswahl = fixture.debugElement.queryAll(By.css('tbody mat-select'));
    auswahl[0].triggerEventHandler('selectionChange', { value: 'Satz' });
    auswahl[1].triggerEventHandler('selectionChange', { value: null });
    element.querySelector<HTMLButtonElement>('tbody button[aria-label*="löschen"]')!.click();
    expect(ereignisse.geaendert).toEqual([
      { artikel: besen, aenderung: { name: 'Handfeger' } },
      { artikel: besen, aenderung: { einheit: 'Satz' } },
      { artikel: besen, aenderung: { lagerId: null } },
    ]);
    expect(ereignisse.geloescht).toEqual([besen]);
  });

  it('meldet bei leerem oder unverändertem Namen nichts', () => {
    const { element, ereignisse } = erzeuge([erzeugeTestArtikel({ name: 'Besen' })]);
    const feld = element.querySelector<HTMLInputElement>('tbody input')!;
    feld.value = ' ';
    feld.dispatchEvent(new Event('change'));
    feld.value = 'Besen ';
    feld.dispatchEvent(new Event('change'));
    expect(ereignisse.geaendert).toEqual([]);
  });
});
