import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Posten } from '../../models/planung.model';
import { PostenSchiene } from './posten-schiene';

function posten(id: string, label: string, besetzt: number, gesamt: number): Posten {
  return {
    id,
    label,
    fahrzeug: id === 'a' ? { seriennummer: 'S-1', funkruf: 'KTW 1', hiorgId: null } : null,
    positions: Array.from({ length: gesamt }, (_, i) => ({
      id: `${id}${i}`,
      label: `Position ${i}`,
      requirements: { taktisch: null, medizinisch: null },
      assigned: i < besetzt ? { id: `e${i}`, name: 'Beispiel Person' } : null,
    })),
  };
}

function erzeuge(aktivId: string | null) {
  const fixture = TestBed.createComponent(PostenSchiene);
  fixture.componentRef.setInput('posten', [
    posten('a', 'Wache', 3, 4),
    posten('b', 'Streife', 2, 2),
  ]);
  fixture.componentRef.setInput('aktivId', aktivId);
  fixture.detectChanges();
  return fixture;
}

describe('PostenSchiene', () => {
  it('zeigt Name, Fahrzeug, offene Plätze und den Stand als Ring', () => {
    const wurzel = erzeuge('a').nativeElement as HTMLElement;
    const knoepfe = wurzel.querySelectorAll<HTMLButtonElement>('button.posten');
    expect(knoepfe).toHaveLength(2);
    expect(knoepfe[0].textContent).toContain('Wache');
    expect(knoepfe[0].textContent).toContain('KTW 1 · 1 offen');
    expect(knoepfe[0].querySelector('.ring')?.getAttribute('aria-label')).toBe('3 von 4 besetzt');
    expect(knoepfe[1].textContent).toContain('vollständig');
    expect(knoepfe[1].querySelector('.ring')?.classList).toContain('voll');
  });

  it('kennzeichnet den gewählten Posten und meldet Auswahl und Neuanlage', () => {
    const fixture = erzeuge('b');
    const wurzel = fixture.nativeElement as HTMLElement;
    const knoepfe = wurzel.querySelectorAll<HTMLButtonElement>('button.posten');
    expect(knoepfe[1].getAttribute('aria-current')).toBe('true');
    expect(knoepfe[0].getAttribute('aria-current')).toBeNull();

    const gewaehlt: string[] = [];
    let neu = 0;
    fixture.componentInstance.gewaehlt.subscribe((id) => gewaehlt.push(id));
    fixture.componentInstance.neuerPosten.subscribe(() => (neu += 1));
    knoepfe[0].click();
    wurzel.querySelector<HTMLButtonElement>('button.neu')!.click();
    expect(gewaehlt).toEqual(['a']);
    expect(neu).toBe(1);
  });
});
