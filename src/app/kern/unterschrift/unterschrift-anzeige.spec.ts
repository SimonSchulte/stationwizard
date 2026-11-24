import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { UnterschriftAnzeige } from './unterschrift-anzeige';
import { UnterschriftDaten } from './unterschrift.model';

function rendere(daten: UnterschriftDaten): HTMLElement {
  const fixture = TestBed.createComponent(UnterschriftAnzeige);
  fixture.componentRef.setInput('unterschrift', daten);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('UnterschriftAnzeige', () => {
  it('zeigt eine Schriftunterschrift als Text in der gewählten Schrift', () => {
    const element = rendere({ art: 'schrift', text: 'Max Mustermann', font: 'Caveat' });
    const text = element.querySelector('.schrift') as HTMLElement;
    expect(text.textContent?.trim()).toBe('Max Mustermann');
    expect(text.style.fontFamily).toContain('Caveat');
  });

  it('zeichnet jeden Strich einer Zeichnung als eigene Linie', () => {
    const element = rendere({
      art: 'zeichnung',
      striche: [
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ],
    });
    const linien = element.querySelectorAll('polyline');
    expect(linien).toHaveLength(2);
    expect(linien[0].getAttribute('points')).toBe('1,2 3,4');
  });
});
