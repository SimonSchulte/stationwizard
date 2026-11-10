import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Zettel } from '../../services/aufbau-zettel';
import { ZettelVorschau } from './zettel-vorschau';

function zettel(extra: Partial<Zettel> = {}): Zettel {
  return {
    nr: 2,
    einheitId: 'e1',
    name: 'Rollwagen 03',
    typ: 'wagen',
    farbe: 'abschnitt-7',
    inFahrzeug: null,
    von: 'Halle A',
    posten: [
      { art: 'trenner', lagerId: 'l1', text: 'Halle A' },
      {
        art: 'zeile',
        quelle: 'artikel',
        text: 'Trinkwasser',
        menge: '85 Liter (80–90)',
        eintragId: 'a',
      },
    ],
    belegt: 2,
    kapazitaet: 23,
    streifen: 1,
    ...extra,
  };
}

function erzeuge(z: Zettel) {
  const fixture = TestBed.createComponent(ZettelVorschau);
  fixture.componentRef.setInput('zettel', z);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ZettelVorschau', () => {
  it('zeigt Kopf, Ziel, Trenner, Zeilen und die Platzanzeige', () => {
    const element = erzeuge(zettel());
    expect(element.querySelector('.kopf')?.textContent).toContain('Rollwagen 03');
    expect(element.querySelector('.kopf')?.textContent).toContain('Nr. 2');
    expect(element.querySelector('.ziel')?.textContent).toContain('Halle A');
    expect(element.querySelector('.trenner')?.textContent).toBe('Halle A');
    expect(element.querySelector('.zeile')?.textContent).toContain('85 Liter (80–90)');
    expect(element.querySelector('.platztext')?.textContent).toContain('2 von 23 Zeilen');
    expect(element.querySelector('.platz')?.classList.contains('voll')).toBe(false);
  });

  it('färbt das Band mit der Zielfarbe und nennt bei einem Wagen im Fahrzeug das Fahrzeug', () => {
    const element = erzeuge(zettel({ inFahrzeug: 'GW-San' }));
    expect(element.querySelector<HTMLElement>('.streifen')?.style.getPropertyValue('--farbe')).toBe(
      'var(--abschnitt-7)',
    );
    expect(element.querySelector('.ziel')?.textContent).toContain('Rollwagen 03 (in GW-San)');
  });

  it('warnt, wenn der Zettel mehrere Streifen braucht, und meldet einen leeren Zettel', () => {
    const voll = erzeuge(zettel({ belegt: 30, streifen: 2 }));
    expect(voll.querySelector('.platz')?.classList.contains('voll')).toBe(true);
    expect(voll.querySelector('.platztext')?.textContent).toContain('2 Streifen');
    const leer = erzeuge(zettel({ posten: [], belegt: 0, von: null }));
    expect(leer.querySelector('.leer')?.textContent).toContain('noch leer');
    expect(leer.querySelector('.ziel')?.textContent).toContain('–');
  });
});
