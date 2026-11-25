import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Zaehlmarke } from './zaehlmarke';

function text(anzahl: number): string | null {
  const fixture = TestBed.createComponent(Zaehlmarke);
  fixture.componentRef.setInput('anzahl', anzahl);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector('.marke')?.textContent ?? null;
}

describe('Zaehlmarke', () => {
  it('zeigt bei 0 nichts', () => expect(text(0)).toBeNull());
  it('zeigt die Zahl', () => expect(text(7)).toBe('7'));
  it('kappt große Zahlen', () => {
    expect(text(99)).toBe('99');
    expect(text(100)).toBe('99+');
  });
});
