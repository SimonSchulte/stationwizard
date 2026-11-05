import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PepVorlageInhalt } from '../../models/pep.model';
import { testPepVorlage } from '../../testing/pep-testdaten';
import { PepVorlageAnsicht, anforderungsTexte } from './pep-vorlage-ansicht';

describe('anforderungsTexte', () => {
  it('nennt taktische, medizinische und Zusatzanforderung, Leeres entfällt', () => {
    expect(
      anforderungsTexte({
        id: 'p',
        bezeichnung: '',
        anforderungen: { taktisch: 'GF', medizinisch: 'RS', zusatz: ' Führerschein C ' },
        postenfuehrer: false,
        einsatzkraftId: null,
      }),
    ).toEqual(['GF', 'RS', 'Führerschein C']);
    expect(
      anforderungsTexte({
        id: 'p',
        bezeichnung: '',
        anforderungen: { taktisch: null, medizinisch: null, zusatz: '  ' },
        postenfuehrer: false,
        einsatzkraftId: null,
      }),
    ).toEqual([]);
  });
});

describe('PepVorlageAnsicht', () => {
  function erzeuge(inhalt: PepVorlageInhalt): HTMLElement {
    const fixture = TestBed.createComponent(PepVorlageAnsicht);
    fixture.componentRef.setInput('inhalt', inhalt);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('zeigt Posten, Fahrzeug, Positionen, Anforderungen, Postenführer und Kennzahlen', () => {
    const element = erzeuge(testPepVorlage().inhalt);
    const text = element.textContent ?? '';
    expect(text).toContain('1 Posten · 2 Positionen');
    expect(text).toContain('Sanitätsstation');
    expect(text).toContain('Florian Test 1');
    expect(text).toContain('Gruppenführung');
    expect(text).toContain('Helfer');
    const anforderungen = [...element.querySelectorAll('.anforderung')].map((e) =>
      e.textContent?.trim(),
    );
    expect(anforderungen).toEqual(['GF', 'RS']);
    expect(element.querySelectorAll('.fuehrer')).toHaveLength(1);
  });

  it('zeigt einen Leerzustand ohne Posten', () => {
    const element = erzeuge({ beschreibung: '', posten: [] });
    expect(element.textContent).toContain('noch keinen Posten');
  });
});
