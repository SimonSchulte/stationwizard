import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AufbauInhalt } from '../../models/aufbau.model';
import { AufbauProblem } from '../../services/aufbau-abgleich';
import { testAufbauInhalt, testEinheit } from '../../testing/aufbau-testdaten';
import { AufbauBaum } from './aufbau-baum';

function erzeuge(
  inhalt: AufbauInhalt,
  probleme: AufbauProblem[] = [],
  gewaehltId: string | null = null,
) {
  const fixture: ComponentFixture<AufbauBaum> = TestBed.createComponent(AufbauBaum);
  fixture.componentRef.setInput('inhalt', inhalt);
  fixture.componentRef.setInput('probleme', probleme);
  fixture.componentRef.setInput('gewaehltId', gewaehltId);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('AufbauBaum', () => {
  it('zeigt ohne Einheiten einen Leerhinweis und die Knöpfe zum Hinzufügen', () => {
    const { element } = erzeuge(testAufbauInhalt([]));
    expect(element.textContent).toContain('Noch keine Fahrzeuge oder Wagen');
    expect(
      [...element.querySelectorAll('.hinzufuegen button')].map((b) =>
        b.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['add Fahrzeug', 'add Wagen']);
  });

  it('rückt einen Wagen im Fahrzeug ein, markiert die Wahl und zeigt Hinweise', () => {
    const wagen = testEinheit({ name: 'Rollwagen' });
    const fahrzeug = testEinheit({
      typ: 'fahrzeug',
      name: 'GW-San',
      inhalt: [{ art: 'wagen', id: crypto.randomUUID(), einheit: wagen }],
    });
    const { element } = erzeuge(
      testAufbauInhalt([fahrzeug]),
      [{ schwere: 'hinweis', art: 'ohne-foto', text: 'x', einheitId: wagen.id }],
      wagen.id,
    );
    const eintraege = [...element.querySelectorAll<HTMLButtonElement>('.eintrag')];
    expect(eintraege.map((e) => e.querySelector('.name')?.textContent)).toEqual([
      'GW-San',
      'Rollwagen',
    ]);
    expect(eintraege[1]!.classList.contains('eingerueckt')).toBe(true);
    expect(eintraege[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(eintraege[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(eintraege[1]!.querySelector('mat-icon.warnung')).not.toBeNull();
    expect(eintraege[0]!.querySelector('mat-icon.warnung')).toBeNull();
  });

  it('meldet Auswahl und neue Einheiten', () => {
    const fahrzeug = testEinheit({ typ: 'fahrzeug', name: 'GW-San' });
    const { fixture, element } = erzeuge(testAufbauInhalt([fahrzeug]));
    const gewaehlt: string[] = [];
    const neu: unknown[] = [];
    fixture.componentInstance.gewaehlt.subscribe((id) => gewaehlt.push(id));
    fixture.componentInstance.hinzufuegen.subscribe((n) => neu.push(n));
    element.querySelector<HTMLButtonElement>('.eintrag')!.click();
    const knoepfe = [...element.querySelectorAll<HTMLButtonElement>('.hinzufuegen button')];
    knoepfe.find((b) => b.textContent?.includes('Fahrzeug'))!.click();
    knoepfe
      .find((b) => b.textContent?.includes('Wagen') && !b.textContent.includes('Fahrzeug'))!
      .click();
    expect(gewaehlt).toEqual([fahrzeug.id]);
    expect(neu).toEqual([
      { typ: 'fahrzeug', inFahrzeugId: null },
      { typ: 'wagen', inFahrzeugId: null },
    ]);
    // Mit einem Fahrzeug gibt es zusätzlich das Menü „Wagen in Fahrzeug …“.
    expect(element.textContent).toContain('Wagen in Fahrzeug');
  });

  it('zeigt den vollständigen Baum bis zur Kistenebene und wählt bei einer Kiste ihre Einheit', () => {
    const kiste = (name: string, anzahl: number) => ({
      art: 'kiste' as const,
      id: crypto.randomUUID(),
      kisteId: null,
      name,
      lagerId: null,
      anzahl,
      inhalt: [],
      phase: null,
    });
    const wagen = testEinheit({ name: 'Rollwagen', inhalt: [kiste('Verbandkiste', 2)] });
    const fahrzeug = testEinheit({
      typ: 'fahrzeug',
      name: 'GW-San',
      inhalt: [kiste('Werkzeug', 1), { art: 'wagen', id: crypto.randomUUID(), einheit: wagen }],
    });
    const { fixture, element } = erzeuge(testAufbauInhalt([fahrzeug]));
    const zeilen = [...element.querySelectorAll('.baum .eintrag')];
    expect(zeilen.map((z) => z.querySelector('.name')?.textContent?.trim())).toEqual([
      'GW-San',
      '1× Werkzeug',
      'Rollwagen',
      '2× Verbandkiste',
    ]);
    expect(zeilen.map((z) => z.className.includes('kiste'))).toEqual([false, true, false, true]);
    expect(zeilen[1]!.classList.contains('eingerueckt')).toBe(true);
    expect(zeilen[3]!.classList.contains('eingerueckt-tief')).toBe(true);
    const gewaehlt: string[] = [];
    fixture.componentInstance.gewaehlt.subscribe((id) => gewaehlt.push(id));
    (zeilen[3] as HTMLButtonElement).click();
    expect(gewaehlt).toEqual([wagen.id]);
  });
});
