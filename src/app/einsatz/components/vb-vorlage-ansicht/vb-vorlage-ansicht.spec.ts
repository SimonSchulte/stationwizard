import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  testAbschnitt,
  testInhalt,
  testLaufzettel,
  testPosition,
} from '../../testing/vb-testdaten';
import { VbVorlageAnsicht, materialKurztext } from './vb-vorlage-ansicht';

describe('materialKurztext', () => {
  it('verbindet Anzahl und Material, leere Anzahl bleibt ohne „×“', () => {
    expect(
      materialKurztext([
        testPosition({ anzahl: '2', material: 'Propanflaschen' }),
        testPosition({ anzahl: '', material: 'Suppe' }),
        testPosition({ anzahl: ' 5 ', material: 'Servietten' }),
      ]),
    ).toBe('2× Propanflaschen, Suppe, 5× Servietten');
  });
});

describe('VbVorlageAnsicht', () => {
  const inhalt = testInhalt({
    anweisungen: 'Treffpunkt 8 Uhr',
    abschnitte: [
      testAbschnitt({
        titel: 'Rollwagen',
        laufzettel: [
          testLaufzettel({
            lagerort: 'Lager Nord',
            positionen: [testPosition({ anzahl: '2', material: 'Propanflaschen' })],
          }),
          testLaufzettel({ lagerort: 'Keller' }),
        ],
      }),
      testAbschnitt({
        titel: 'Gitterwagen',
        farbe: 'abschnitt-2',
        fachgruppe: 'tesi',
        laufzettel: [testLaufzettel({ lagerort: 'Garage' })],
      }),
      testAbschnitt({ titel: 'Leer', laufzettel: [] }),
    ],
  });

  function erzeuge(wert = inhalt) {
    const fixture = TestBed.createComponent(VbVorlageAnsicht);
    fixture.componentRef.setInput('inhalt', wert);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('zeigt Abschnitte, Orte und Material', () => {
    const text = erzeuge().textContent ?? '';
    expect(text).toContain('Rollwagen');
    expect(text).toContain('Gitterwagen');
    expect(text).toContain('2× Propanflaschen');
    expect(text).toContain('Garage');
    expect(text).toContain('Dieser Abschnitt enthält noch keinen Laufzettel');
  });

  it('nummeriert die Laufzettel fortlaufend über die Abschnitte', () => {
    const nummern = [...erzeuge().querySelectorAll('td.nr')].map((e) => e.textContent?.trim());
    expect(nummern).toEqual(['1', '2', '3']);
  });

  it('zeigt die Anweisungen nur, wenn welche vorhanden sind', () => {
    expect(erzeuge().textContent).toContain('Allgemeine Anweisungen');
    expect(erzeuge({ ...inhalt, anweisungen: ' ' }).textContent).not.toContain(
      'Allgemeine Anweisungen',
    );
  });

  it('zeigt einen Leerzustand ohne Abschnitte', () => {
    expect(erzeuge({ anweisungen: '', abschnitte: [] }).textContent).toContain(
      'noch keine Abschnitte',
    );
  });
});
