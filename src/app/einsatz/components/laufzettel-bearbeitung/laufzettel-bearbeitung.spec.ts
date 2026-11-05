import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { VbLaufzettel } from '../../models/vb.model';
import { testLaufzettel, testPosition } from '../../testing/vb-testdaten';
import { LaufzettelBearbeitung } from './laufzettel-bearbeitung';

function erzeuge(laufzettel: VbLaufzettel) {
  const fixture = TestBed.createComponent(LaufzettelBearbeitung);
  fixture.componentRef.setInput('laufzettel', laufzettel);
  fixture.componentRef.setInput('nummer', 4);
  fixture.componentRef.setInput('abschnittId', 'a1');
  fixture.componentRef.setInput('abschnitte', [
    { id: 'a1', titel: 'Betreuung' },
    { id: 'a2', titel: 'TeSi' },
  ]);
  fixture.componentRef.setInput('andere', [{ id: 'x', nummer: 2, text: 'Zelte' }]);
  fixture.detectChanges();
  return fixture;
}

function el(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('LaufzettelBearbeitung', () => {
  it('zeigt Nummer, Felder und je Position eine Zeile', () => {
    const laufzettel = testLaufzettel({
      lagerort: 'Lager Nord',
      positionen: [testPosition({ material: 'Stühle' }), testPosition({ material: 'Tische' })],
    });
    const fixture = erzeuge(laufzettel);
    expect(el(fixture).querySelector('.titel')?.textContent).toContain('4');
    expect(el(fixture).querySelectorAll('.position').length).toBe(2);
    const felder = [...el(fixture).querySelectorAll('input')].map((i) => i.value);
    expect(felder).toContain('Lager Nord');
    expect(felder).toContain('Tische');
    expect(el(fixture).querySelector('app-platz-anzeige')?.textContent).toContain('2 von 23');
    expect(el(fixture).querySelector('.hinweis')).toBeNull();
  });

  it('meldet Feld- und Positionsänderungen', () => {
    const laufzettel = testLaufzettel();
    const fixture = erzeuge(laufzettel);
    const felder: unknown[] = [];
    const positionen: unknown[] = [];
    fixture.componentInstance.felderGeaendert.subscribe((f) => felder.push(f));
    fixture.componentInstance.positionGeaendert.subscribe((p) => positionen.push(p));
    const eingaben = [...el(fixture).querySelectorAll<HTMLInputElement>('input')];
    const lagerort = eingaben.find((i) => i.value === laufzettel.lagerort)!;
    lagerort.value = 'Halle';
    lagerort.dispatchEvent(new Event('input'));
    const material = eingaben.find((i) => i.value === laufzettel.positionen[0].material)!;
    material.value = 'Zelt';
    material.dispatchEvent(new Event('input'));
    expect(felder).toEqual([{ lagerort: 'Halle' }]);
    expect(positionen).toEqual([{ id: laufzettel.positionen[0].id, felder: { material: 'Zelt' } }]);
  });

  it('teilt die markierten Positionen und leert danach die Markierung', () => {
    const laufzettel = testLaufzettel({ positionen: [testPosition(), testPosition()] });
    const fixture = erzeuge(laufzettel);
    let geteilt: string[] = [];
    fixture.componentInstance.geteilt.subscribe((ids) => (geteilt = ids));
    const teilenKnopf = () =>
      [...el(fixture).querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('Markierte als eigenen Laufzettel'),
      )!;
    expect(teilenKnopf().disabled).toBe(true);

    el(fixture).querySelectorAll<HTMLInputElement>('mat-checkbox input')[1].click();
    fixture.detectChanges();
    expect(teilenKnopf().disabled).toBe(false);
    teilenKnopf().click();
    fixture.detectChanges();
    expect(geteilt).toEqual([laufzettel.positionen[1].id]);
    expect(teilenKnopf().disabled).toBe(true);
  });

  it('meldet Hinzufügen, Entfernen, Duplizieren und Löschen', () => {
    const laufzettel = testLaufzettel();
    const fixture = erzeuge(laufzettel);
    const ereignisse: string[] = [];
    const k = fixture.componentInstance;
    k.positionHinzugefuegt.subscribe(() => ereignisse.push('hinzu'));
    k.positionEntfernt.subscribe((id) => ereignisse.push(`weg:${id}`));
    k.dupliziert.subscribe(() => ereignisse.push('dupliziert'));
    k.geloescht.subscribe(() => ereignisse.push('geloescht'));
    const knopf = (label: string) =>
      el(fixture).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    knopf('Position entfernen').click();
    knopf('Laufzettel duplizieren').click();
    knopf('Laufzettel löschen').click();
    [...el(fixture).querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Position hinzufügen'))!
      .click();
    expect(ereignisse).toEqual([
      `weg:${laufzettel.positionen[0].id}`,
      'dupliziert',
      'geloescht',
      'hinzu',
    ]);
  });

  it('übersetzt „keine“ und eine Fachgruppe in die Ausgabe', () => {
    const fixture = erzeuge(testLaufzettel({ fachgruppe: 'betreuung' }));
    const gemeldet: unknown[] = [];
    fixture.componentInstance.felderGeaendert.subscribe((f) => gemeldet.push(f));
    const instanz = fixture.componentInstance as unknown as {
      fachgruppeGewaehlt(wert: unknown): void;
    };
    instanz.fachgruppeGewaehlt('tesi');
    instanz.fachgruppeGewaehlt('keine');
    instanz.fachgruppeGewaehlt(undefined);
    expect(gemeldet).toEqual([{ fachgruppe: 'tesi' }, { fachgruppe: null }, { fachgruppe: null }]);
  });

  it('warnt bei einem zu vollen Laufzettel und bietet das Aufteilen an', () => {
    const positionen = Array.from({ length: 25 }, () => testPosition({ material: 'Kabel' }));
    const fixture = erzeuge(testLaufzettel({ positionen }));
    const hinweis = el(fixture).querySelector('.hinweis')!;
    expect(hinweis.textContent).toContain('Passt nicht auf einen Laufzettel');
    expect(hinweis.textContent).toContain('2 Zeilen zu viel');
    let aufgeteilt = false;
    fixture.componentInstance.aufgeteilt.subscribe(() => (aufgeteilt = true));
    hinweis.querySelector('button')!.click();
    expect(aufgeteilt).toBe(true);
  });
});
