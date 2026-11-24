import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { VorgangStufen } from './vorgang-stufen';

function rendere(stufe: number): HTMLElement {
  const fixture = TestBed.createComponent(VorgangStufen);
  fixture.componentRef.setInput('stufe', stufe);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('VorgangStufen', () => {
  it('zeigt alle sechs Stufen und markiert erreichte und nächste', () => {
    const element = rendere(1);
    const stufen = element.querySelectorAll('.stufe');
    expect(stufen).toHaveLength(6);
    expect([...stufen].map((s) => s.classList.contains('erreicht'))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(stufen[2].classList.contains('naechste')).toBe(true);
    expect(stufen[1].getAttribute('aria-current')).toBe('step');
  });

  it('beginnt vor der ersten Stufe bei „Schadensmeldung ausgefüllt“ als nächster', () => {
    const element = rendere(-1);
    expect(element.querySelectorAll('.erreicht')).toHaveLength(0);
    expect(element.querySelector('.naechste')?.textContent).toContain('Schadensmeldung ausgefüllt');
  });
});
