import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StaerkeBlock } from './staerke-block';

describe('StaerkeBlock', () => {
  it('zeigt Soll und Ist und färbt Abweichungen', () => {
    const fixture = TestBed.createComponent(StaerkeBlock);
    fixture.componentRef.setInput('soll', { fuhrer: 1, unterfuehrer: 2, helfer: 3, gesamt: 6 });
    fixture.componentRef.setInput('ist', { fuhrer: 1, unterfuehrer: 1, helfer: 4, gesamt: 6 });
    fixture.componentRef.setInput('beschriftung', 'Gesamtstärke');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.getAttribute('aria-label')).toBe('Gesamtstärke');
    const soll = [...element.querySelectorAll('.soll .staerke-num')].map((z) =>
      z.textContent?.trim(),
    );
    expect(soll).toEqual(['1', '2', '3', '6']);
    const ist = [...element.querySelectorAll('.ist .staerke-num')].map((z) => z.className);
    expect(ist[0]).toContain('status-met');
    expect(ist[1]).toContain('status-under');
    expect(ist[2]).toContain('status-over');
    expect(ist[0]).toContain('staerke-num');
  });
});
