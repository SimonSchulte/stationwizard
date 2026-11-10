import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { Kiste, Lager } from '../../models/stammdaten.model';
import { erzeugeTestKiste, erzeugeTestLager } from '../../testing/stammdaten-testdaten';
import { KisteListe } from './kiste-liste';

const kuechenlager = erzeugeTestLager({ name: 'Küchenlager' });

function erzeuge(
  kisten: Kiste[],
  gewaehltId: string | null = null,
  lager: Lager[] = [kuechenlager],
) {
  const fixture = TestBed.createComponent(KisteListe);
  fixture.componentRef.setInput('kisten', kisten);
  fixture.componentRef.setInput('lager', lager);
  fixture.componentRef.setInput('gewaehltId', gewaehltId);
  fixture.detectChanges();
  const ereignisse = { gewaehlt: [] as string[], angelegt: [] as string[] };
  fixture.componentInstance.gewaehlt.subscribe((w) => ereignisse.gewaehlt.push(w));
  fixture.componentInstance.angelegt.subscribe((w) => ereignisse.angelegt.push(w));
  return { fixture, element: fixture.nativeElement as HTMLElement, ereignisse };
}

function eintraege(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>('button[mat-list-item]')];
}

describe('KisteListe', () => {
  const gewuerz = erzeugeTestKiste({
    name: 'Gewürzkiste',
    lagerId: kuechenlager.id,
    inhalt: [
      { artikelId: 'a1', menge: 1, bemerkung: '' },
      { artikelId: 'a2', menge: 2, bemerkung: '' },
    ],
  });
  const leer = erzeugeTestKiste({ name: 'Leere Kiste' });

  it('zeigt Name, Zahl der Positionen und Heimatlager', () => {
    const { element } = erzeuge([gewuerz, leer]);
    const [erste, zweite] = eintraege(element);
    expect(erste.textContent).toContain('Gewürzkiste');
    expect(erste.textContent).toContain('2 Positionen · Küchenlager');
    expect(zweite.textContent).toContain('0 Positionen');
    expect(zweite.textContent).not.toContain('·');
  });

  it('sagt bei genau einer Position „Position“', () => {
    const eine = erzeugeTestKiste({ inhalt: [{ artikelId: 'a1', menge: 1, bemerkung: '' }] });
    expect(eintraege(erzeuge([eine]).element)[0].textContent).toContain('1 Position');
  });

  it('markiert die gewählte Kiste und meldet eine Wahl', () => {
    const { element, ereignisse } = erzeuge([gewuerz, leer], leer.id);
    const [erste, zweite] = eintraege(element);
    expect(zweite.classList.contains('mdc-list-item--activated')).toBe(true);
    expect(erste.classList.contains('mdc-list-item--activated')).toBe(false);
    erste.click();
    expect(ereignisse.gewaehlt).toEqual([gewuerz.id]);
  });

  it('filtert nach Suchbegriff ohne Groß-/Kleinschreibung', () => {
    const { fixture, element } = erzeuge([gewuerz, leer]);
    fixture.debugElement.query(By.css('app-suchfeld')).triggerEventHandler('wertChange', ' GEWÜRZ');
    fixture.detectChanges();
    expect(eintraege(element).map((e) => e.textContent)).toEqual([
      expect.stringContaining('Gewürzkiste'),
    ]);
    fixture.debugElement.query(By.css('app-suchfeld')).triggerEventHandler('wertChange', 'xyz');
    fixture.detectChanges();
    expect(element.textContent).toContain('Keine Treffer');
  });

  it('zeigt ohne Kisten einen Hinweis', () => {
    expect(erzeuge([]).element.textContent).toContain('Noch keine Kisten');
  });

  it('legt eine Kiste an, leert das Feld und ignoriert einen leeren Namen', () => {
    const { fixture, element, ereignisse } = erzeuge([]);
    const feld = element.querySelector<HTMLInputElement>('form.neu input')!;
    feld.value = '  ';
    element.querySelector('form.neu')!.dispatchEvent(new Event('submit'));
    expect(ereignisse.angelegt).toEqual([]);
    feld.value = ' Kühlbox ';
    element.querySelector('form.neu')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(ereignisse.angelegt).toEqual(['Kühlbox']);
    expect(feld.value).toBe('');
  });
});
