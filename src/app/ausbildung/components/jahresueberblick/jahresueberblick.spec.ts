import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Termin, leererTermin } from '../../models/plan.model';
import { baueHiorgAbgleich } from '../../services/hiorg-abgleich';
import { baueWochenraster } from '../../services/plan-raster';
import { Jahresueberblick } from './jahresueberblick';

function termin(datum: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), ...aenderung };
}

describe('Jahresueberblick', () => {
  let fixture: ComponentFixture<Jahresueberblick>;
  const element = () => fixture.nativeElement as HTMLElement;
  const zellen = () => [...element().querySelectorAll<HTMLButtonElement>('.zelle')];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    const termine = [
      termin('2026-03-02', { thema: 'Erfundenes SAN-Thema', kategorie: 'SAN' }),
      termin('2026-03-09'),
    ];
    fixture = TestBed.createComponent(Jahresueberblick);
    fixture.componentRef.setInput('wochen', baueWochenraster(2026, termine, new Map(), 'Mo'));
    fixture.componentRef.setInput('abgleich', baueHiorgAbgleich([], termine, 2026));
    fixture.componentRef.setInput('heute', '2026-03-04');
    fixture.detectChanges();
  });

  it('zeigt zwölf Monatszeilen mit den Diensttagen', () => {
    expect(element().querySelectorAll('.zeile')).toHaveLength(12);
    expect(zellen().some((z) => z.textContent?.includes('Erfundenes SAN-Thema'))).toBe(true);
  });

  it('kennzeichnet Lücken und zählt sie in den Kennzahlen', () => {
    const luecken = zellen().filter((z) => z.classList.contains('luecke'));

    expect(luecken.length).toBeGreaterThan(0);
    expect(luecken[0]!.textContent).toContain('Lücke');
    expect(element().querySelector('.kennzahl.warn b')?.textContent?.trim()).toBe(
      String(luecken.length),
    );
  });

  it('meldet das Datum des angeklickten Tages', () => {
    const gewaehlt: string[] = [];
    fixture.componentInstance.tagGewaehlt.subscribe((d) => gewaehlt.push(d));

    zellen()
      .find((z) => z.textContent?.includes('Erfundenes SAN-Thema'))!
      .click();

    expect(gewaehlt).toEqual(['2026-03-02']);
  });
});
