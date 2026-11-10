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
    expect(eintraege[1]!.closest('.zeile')!.classList.contains('eingerueckt')).toBe(true);
    expect(eintraege[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(eintraege[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(eintraege[1]!.querySelector('app-abschnitt-farbpunkt')).not.toBeNull();
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
    const zeilen = [...element.querySelectorAll('.baum .zeile')];
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
    zeilen[3]!.querySelector<HTMLButtonElement>('.eintrag')!.click();
    expect(gewaehlt).toEqual([wagen.id]);
  });

  it('meldet nach dem Ziehen Quelle und die Zeile davor als Anker', () => {
    const kiste = (name: string) => ({
      art: 'kiste' as const,
      id: crypto.randomUUID(),
      kisteId: null,
      name,
      lagerId: null,
      anzahl: 1,
      inhalt: [],
      phase: null,
    });
    const k1 = kiste('K1');
    const wagen = testEinheit({ name: 'Wagen' });
    const fahrzeug = testEinheit({
      typ: 'fahrzeug',
      name: 'GW',
      inhalt: [k1, { art: 'wagen', id: crypto.randomUUID(), einheit: wagen }],
    });
    const { fixture } = erzeuge(testAufbauInhalt([fahrzeug]));
    const meldungen: unknown[] = [];
    fixture.componentInstance.verschoben.subscribe((m) => meldungen.push(m));
    // Zeilen: GW, K1, Wagen. K1 (Index 1) hinter den Wagen (Index 2) ziehen.
    (fixture.componentInstance as unknown as { abgelegt(e: unknown): void }).abgelegt({
      previousIndex: 1,
      currentIndex: 2,
      distance: { x: 0, y: 40 },
    });
    expect(meldungen).toEqual([
      {
        quelle: {
          art: 'kiste',
          id: k1.id,
          einheitId: fahrzeug.id,
          wurzelId: fahrzeug.id,
          tiefe: 1,
        },
        anker: {
          art: 'einheit',
          id: wagen.id,
          einheitId: wagen.id,
          wurzelId: fahrzeug.id,
          tiefe: 1,
        },
      },
    ]);
    meldungen.length = 0;
    (fixture.componentInstance as unknown as { abgelegt(e: unknown): void }).abgelegt({
      previousIndex: 2,
      currentIndex: 0,
      distance: { x: 60, y: -40 },
    });
    expect(meldungen[0]).toMatchObject({ anker: null, ebene: 'tiefer' });
  });

  describe('Tastatur', () => {
    function aufbau() {
      const kiste = {
        art: 'kiste' as const,
        id: crypto.randomUUID(),
        kisteId: null,
        name: 'K',
        lagerId: null,
        anzahl: 1,
        inhalt: [],
        phase: null,
      };
      const a = testEinheit({ typ: 'fahrzeug', name: 'A', inhalt: [kiste] });
      const b = testEinheit({ typ: 'fahrzeug', name: 'B' });
      const wagen = testEinheit({ typ: 'wagen', name: 'Frei' });
      return { a, b, wagen, kiste };
    }

    function druecke(
      fixture: ComponentFixture<AufbauBaum>,
      element: HTMLElement,
      index: number,
      key: string,
    ) {
      const meldungen: { quelle: { id: string }; anker: { id: string } | null; ebene?: string }[] =
        [];
      fixture.componentInstance.verschoben.subscribe((m) => meldungen.push(m));
      const knoepfe = [...element.querySelectorAll<HTMLButtonElement>('.baum .eintrag')];
      const ereignis = new KeyboardEvent('keydown', { key, altKey: true, cancelable: true });
      knoepfe[index]!.dispatchEvent(ereignis);
      return { meldungen, verhindert: ereignis.defaultPrevented };
    }

    it('verschiebt ein Fahrzeug mit Alt+Pfeil runter hinter die ganze nächste Gruppe', () => {
      const { a, b } = aufbau();
      const { fixture, element } = erzeuge(testAufbauInhalt([a, b]));
      // Zeilen: A, K, B – A wandert hinter B.
      const { meldungen, verhindert } = druecke(fixture, element, 0, 'ArrowDown');
      expect(verhindert).toBe(true);
      expect(meldungen).toHaveLength(1);
      expect(meldungen[0]!.quelle.id).toBe(a.id);
      expect(meldungen[0]!.anker?.id).toBe(b.id);
    });

    it('verschiebt mit Alt+Pfeil hoch an den Anfang und lässt am Rand alles unverändert', () => {
      const { a, b } = aufbau();
      const { fixture, element } = erzeuge(testAufbauInhalt([a, b]));
      const hoch = druecke(fixture, element, 2, 'ArrowUp'); // B hoch: vor A
      expect(hoch.meldungen[0]!.quelle.id).toBe(b.id);
      expect(hoch.meldungen[0]!.anker).toBeNull();
      const oben = druecke(fixture, element, 0, 'ArrowUp'); // A ist schon ganz oben
      expect(oben.meldungen).toHaveLength(0);
    });

    it('rückt einen freien Wagen mit Alt+Pfeil rechts ein und nimmt ihn mit links heraus', () => {
      const { a, wagen } = aufbau();
      const { fixture, element } = erzeuge(testAufbauInhalt([a, wagen]));
      // Zeilen: A, K, Frei (Index 2)
      const rein = druecke(fixture, element, 2, 'ArrowRight');
      expect(rein.meldungen[0]).toMatchObject({ ebene: 'tiefer' });
      expect(rein.meldungen[0]!.quelle.id).toBe(wagen.id);
      const raus = druecke(fixture, element, 2, 'ArrowLeft');
      expect(raus.meldungen[0]).toMatchObject({ ebene: 'hoeher' });
      // Ein Fahrzeug lässt sich nicht einrücken.
      expect(druecke(fixture, element, 0, 'ArrowRight').meldungen).toHaveLength(0);
    });

    it('ignoriert Pfeile ohne Alt', () => {
      const { a } = aufbau();
      const { fixture, element } = erzeuge(testAufbauInhalt([a]));
      const meldungen: unknown[] = [];
      fixture.componentInstance.verschoben.subscribe((m) => meldungen.push(m));
      const ereignis = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
      element.querySelector('.baum .eintrag')!.dispatchEvent(ereignis);
      expect(meldungen).toHaveLength(0);
      expect(ereignis.defaultPrevented).toBe(false);
    });
  });
});
