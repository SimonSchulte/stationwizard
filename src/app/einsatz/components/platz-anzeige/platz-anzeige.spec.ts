import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LaufzettelPlatz } from '../../services/laufzettel-platz';
import { PlatzAnzeige } from './platz-anzeige';

function erzeuge(platz: LaufzettelPlatz) {
  const fixture = TestBed.createComponent(PlatzAnzeige);
  fixture.componentRef.setInput('platz', platz);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PlatzAnzeige', () => {
  it('zeigt die Belegung als Meter mit Text', () => {
    const element = erzeuge({ belegt: 6, kapazitaet: 23, zustand: 'ok' });
    const meter = element.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-valuenow')).toBe('6');
    expect(meter.getAttribute('aria-valuemax')).toBe('23');
    expect(element.textContent).toContain('6 von 23 Zeilen');
    expect(element.getAttribute('data-zustand')).toBe('ok');
  });

  it('begrenzt den Balken bei Überlauf und benennt ihn für Screenreader', () => {
    const element = erzeuge({ belegt: 25, kapazitaet: 23, zustand: 'zu-voll' });
    expect((element.querySelector('.fuellung') as HTMLElement).style.width).toBe('100%');
    expect(element.querySelector('[role="meter"]')!.getAttribute('aria-valuetext')).toContain(
      'passt nicht',
    );
    expect(element.getAttribute('data-zustand')).toBe('zu-voll');
  });
});
