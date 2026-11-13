import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  freienArtikelHinzufuegen,
  freieKisteHinzufuegen,
  kistenZiele,
} from '../../services/aufbau-bearbeiten';
import { testAufbauInhalt, testEinheit } from '../../testing/aufbau-testdaten';
import { EintragAenderung, EinheitDetail } from './einheit-detail';

function erzeuge() {
  const einheit = testEinheit({ name: 'Ohne Ziel' });
  let inhalt = testAufbauInhalt([einheit]);
  inhalt = freieKisteHinzufuegen(inhalt, einheit.id, 'Hockerkocher', 1);
  inhalt = freienArtikelHinzufuegen(inhalt, einheit.id, 'Hockerkoche', '', 2);
  const fixture = TestBed.createComponent(EinheitDetail);
  fixture.componentRef.setInput('einheit', inhalt.einheiten[0]);
  fixture.componentRef.setInput('lager', []);
  fixture.componentRef.setInput('artikel', []);
  fixture.componentRef.setInput('kisten', []);
  fixture.componentRef.setInput('aufbauKisten', kistenZiele(inhalt));
  fixture.detectChanges();
  const geaendert: EintragAenderung[] = [];
  fixture.componentInstance.eintragGeaendert.subscribe((a) => geaendert.push(a));
  return { fixture, element: fixture.nativeElement as HTMLElement, geaendert, inhalt };
}

describe('EinheitDetail', () => {
  it('benennt einen freien Artikel um und meldet nur echte Änderungen', () => {
    const { element, geaendert, inhalt } = erzeuge();
    const feld = [...element.querySelectorAll<HTMLInputElement>('input')].find(
      (f) => f.value === 'Hockerkoche',
    )!;
    feld.value = '  Hockerkocher ';
    feld.dispatchEvent(new Event('change'));
    expect(geaendert).toEqual([
      { eintragId: inhalt.einheiten[0]!.inhalt[1]!.id, name: 'Hockerkocher' },
    ]);
    feld.value = 'Hockerkoche';
    feld.dispatchEvent(new Event('change'));
    feld.value = ' ';
    feld.dispatchEvent(new Event('change'));
    expect(geaendert).toHaveLength(1);
    expect(feld.value).toBe('Hockerkoche');
  });

  it('bietet für einen losen Artikel „In eine Kiste legen“ an, nicht für eine Kiste', () => {
    const { element } = erzeuge();
    const knoepfe = element.querySelectorAll('button[aria-label="In eine Kiste legen"]');
    expect(knoepfe).toHaveLength(1);
  });

  it('bietet ohne Kisten im Aufbau keine Kistenwahl an', () => {
    const { fixture, element } = erzeuge();
    fixture.componentRef.setInput('aufbauKisten', []);
    fixture.detectChanges();
    expect(element.querySelector('button[aria-label="In eine Kiste legen"]')).toBeNull();
  });
});
