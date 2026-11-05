import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { VbAenderung } from '../../services/vb-abgleich';
import { VorlageAbgleichDialog, VorlageAbgleichDialogDaten } from './vorlage-abgleich-dialog';

const aenderungen: VbAenderung[] = [
  {
    schluessel: 'laufzettel:geaendert:a',
    art: 'geaendert',
    ebene: 'laufzettel',
    titel: 'Laufzettel „Zelte“',
    beschreibung: 'Lagerort geändert',
    standardGewaehlt: true,
  },
  {
    schluessel: 'laufzettel:neu:b',
    art: 'neu',
    ebene: 'laufzettel',
    titel: 'Laufzettel „Strom“',
    beschreibung: 'Neu in der Vorbereitung',
    standardGewaehlt: true,
  },
  {
    schluessel: 'laufzettel:geloescht:c',
    art: 'geloescht',
    ebene: 'laufzettel',
    titel: 'Laufzettel „Heizpilze“',
    beschreibung: 'In der Vorbereitung gelöscht',
    standardGewaehlt: false,
  },
];

function erzeuge(liste: readonly VbAenderung[] = aenderungen) {
  const schliessen = vi.fn<(ergebnis?: string[]) => void>();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          vorbereitung: 'Weihnachtsmarkt',
          vorlageTitel: 'Standard',
          vorlageVersion: 4,
          aenderungen: liste,
        } satisfies VorlageAbgleichDialogDaten,
      },
      { provide: MatDialogRef, useValue: { close: schliessen } },
    ],
  });
  const fixture = TestBed.createComponent(VorlageAbgleichDialog);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, schliessen };
}

function uebernehmenKnopf(element: HTMLElement): HTMLButtonElement {
  return [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes('übernehmen'),
  )!;
}

describe('VorlageAbgleichDialog', () => {
  it('nennt Quelle, Vorlage und Version und belegt Löschungen nicht vor', () => {
    const { element } = erzeuge();
    expect(element.textContent).toContain('Vorbereitung „Weihnachtsmarkt“');
    expect(element.textContent).toContain('Vorlage „Standard“');
    expect(element.textContent).toContain('Version 4');
    const haken = [...element.querySelectorAll<HTMLInputElement>('mat-checkbox input')].map(
      (i) => i.checked,
    );
    expect(haken).toEqual([true, true, false]);
    expect([...element.querySelectorAll('.art')].map((a) => a.textContent)).toEqual([
      'geändert',
      'neu',
      'gelöscht',
    ]);
    expect(uebernehmenKnopf(element).textContent).toContain('2 Änderungen übernehmen');
  });

  it('liefert die gewählten Schlüssel in Listenreihenfolge', () => {
    const { fixture, element, schliessen } = erzeuge();
    const felder = element.querySelectorAll<HTMLInputElement>('mat-checkbox input');
    felder[0].click();
    felder[2].click();
    fixture.detectChanges();
    expect(uebernehmenKnopf(element).textContent).toContain('2 Änderungen');
    uebernehmenKnopf(element).click();
    expect(schliessen).toHaveBeenCalledWith(['laufzettel:neu:b', 'laufzettel:geloescht:c']);
  });

  it('sperrt das Übernehmen ohne Auswahl', () => {
    const { fixture, element } = erzeuge([aenderungen[2]]);
    expect(uebernehmenKnopf(element).disabled).toBe(true);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
