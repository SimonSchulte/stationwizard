import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Einsatzkraft } from '../../models/planung.model';
import type { PoolHinweis } from '../../services/vorschlaege';
import { Helferpool } from './helferpool';

const mia: Einsatzkraft = {
  id: 'mia',
  name: 'Beispiel Mia',
  tags: { medizinisch: ['RS'] },
  kuerzel: 'BEM',
};
const noah: Einsatzkraft = { id: 'noah', name: 'Probst Noah', tags: { medizinisch: ['NotSan'] } };
const tim: Einsatzkraft = { id: 'tim', name: 'Probe Tim', tags: { medizinisch: ['SanH'] } };

function erzeuge(hinweise = new Map<string, PoolHinweis>()) {
  const fixture = TestBed.createComponent(Helferpool);
  fixture.componentRef.setInput('verfuegbar', [mia, noah]);
  fixture.componentRef.setInput('eingeteilt', [tim]);
  fixture.componentRef.setInput('hinweise', hinweise);
  fixture.detectChanges();
  return fixture;
}

const namen = (wurzel: HTMLElement) =>
  [...wurzel.querySelectorAll('.person .name')].map((e) => e.textContent?.trim());

describe('Helferpool', () => {
  it('zeigt Verfügbare mit Kürzel-Avatar und dem Hinweis auf einen passenden Platz', () => {
    const fixture = erzeuge(new Map([['mia', { art: 'passt', text: 'Passt: Sanitäter 2' }]]));
    const wurzel = fixture.nativeElement as HTMLElement;
    expect(namen(wurzel)).toEqual(['Beispiel Mia', 'Probst Noah']);
    expect(wurzel.querySelector('app-kuerzel-avatar')?.textContent?.trim()).toBe('BEM');
    expect(wurzel.querySelector('.hinweis.passt')?.textContent).toContain('Passt: Sanitäter 2');
    expect(wurzel.textContent).toContain('Verfügbar 2');
    expect(wurzel.textContent).toContain('Eingeteilt 1');
  });

  it('wechselt auf die Eingeteilten mit ihrem Platz, ohne sie ziehbar zu machen', async () => {
    const fixture = erzeuge(new Map([['tim', { art: 'eingeteilt', text: 'Wache · Streife 1' }]]));
    const wurzel = fixture.nativeElement as HTMLElement;
    const knoepfe = wurzel.querySelectorAll<HTMLElement>('mat-button-toggle button');
    knoepfe[1].click();
    fixture.detectChanges();
    expect(namen(wurzel)).toEqual(['Probe Tim']);
    expect(wurzel.querySelector('.hinweis')?.textContent).toContain('Wache · Streife 1');
    expect(wurzel.querySelector('.person.cdk-drag')).toBeNull();
  });

  it('filtert nach Name und meldet, wenn nichts passt', () => {
    const fixture = erzeuge();
    const wurzel = fixture.nativeElement as HTMLElement;
    const feld = wurzel.querySelector<HTMLInputElement>('app-suchfeld input')!;
    feld.value = 'noah';
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(namen(wurzel)).toEqual(['Probst Noah']);
    feld.value = 'zzz';
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(wurzel.textContent).toContain('Keine Treffer');
  });

  it('zeigt das Ergebnis des EFS-Abgleichs und meldet Übernehmen und Schließen', () => {
    const fixture = erzeuge();
    fixture.componentRef.setInput('efsMoeglich', true);
    fixture.componentRef.setInput('efsVergleich', {
      neu: [noah],
      entfallen: [tim],
      unveraendert: 4,
    });
    fixture.detectChanges();
    const wurzel = fixture.nativeElement as HTMLElement;
    const text = wurzel.querySelector('.efs-abgleich')?.textContent ?? '';
    expect(text).toContain('1 neu');
    expect(text).toContain('1 nicht mehr in EFS');
    expect(text).toContain('4 unverändert');
    expect(text).toContain('Probst Noah');
    expect(text).toContain('Probe Tim');

    let uebernommen = 0;
    let geschlossen = 0;
    fixture.componentInstance.efsUebernehmen.subscribe(() => (uebernommen += 1));
    fixture.componentInstance.efsSchliessen.subscribe(() => (geschlossen += 1));
    const knoepfe = [...wurzel.querySelectorAll<HTMLButtonElement>('.efs-aktionen button')];
    knoepfe[0].click();
    knoepfe[1].click();
    expect([uebernommen, geschlossen]).toEqual([1, 1]);
  });

  it('bietet den Abgleich nur an, wenn die PEP einem EFS-Einsatz zugeordnet werden kann', () => {
    const fixture = erzeuge();
    const wurzel = fixture.nativeElement as HTMLElement;
    expect(wurzel.querySelector('[aria-label="Personal mit EFS abgleichen"]')).toBeNull();
    fixture.componentRef.setInput('efsMoeglich', true);
    fixture.detectChanges();
    expect(wurzel.querySelector('[aria-label="Personal mit EFS abgleichen"]')).not.toBeNull();
  });
});
