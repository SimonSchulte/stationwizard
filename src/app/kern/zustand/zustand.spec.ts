import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Leerzustand } from './leerzustand';
import { Meldung } from './meldung';
import { MeldungsDienst } from './meldungs-dienst';

@Component({
  imports: [Meldung, Leerzustand],
  template: `
    @if (fehler()) {
      <app-meldung art="fehler"
        >{{ fehler()
        }}<button meldungAktion (click)="erneut = erneut + 1">Erneut</button></app-meldung
      >
    }
    <app-leerzustand icon="task_alt" titel="Keine Aufgaben">Erklärung</app-leerzustand>
  `,
})
class Gastgeber {
  readonly fehler = signal('Kaputt');
  erneut = 0;
}

function aufbauen() {
  const schliessen = vi.fn();
  const dienst = { zeige: vi.fn(() => ({ schliessen })) };
  TestBed.configureTestingModule({ providers: [{ provide: MeldungsDienst, useValue: dienst }] });
  const fixture = TestBed.createComponent(Gastgeber);
  fixture.detectChanges();
  return { fixture, dienst, schliessen };
}

describe('app-meldung als Brücke zur Snackbar', () => {
  it('gibt Text und Aktion an den Dienst und löst die Aktion über die Schaltfläche aus', () => {
    const { fixture, dienst } = aufbauen();
    expect(dienst.zeige).toHaveBeenCalledTimes(1);
    const [art, text, optionen] = dienst.zeige.mock.calls[0] as unknown as [
      string,
      string,
      { aktion: string; beiAktion: () => void },
    ];
    expect([art, text, optionen.aktion]).toEqual(['fehler', 'Kaputt', 'Erneut']);
    optionen.beiAktion();
    expect(fixture.componentInstance.erneut).toBe(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('app-meldung')?.hidden,
    ).toBe(true);
  });

  it('ersetzt die Meldung bei neuem Text und schließt sie, wenn sie verschwindet', async () => {
    const { fixture, dienst, schliessen } = aufbauen();
    fixture.componentInstance.fehler.set('Anders kaputt');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(dienst.zeige).toHaveBeenLastCalledWith('fehler', 'Anders kaputt', expect.anything());
    expect(schliessen).toHaveBeenCalledTimes(1);
    fixture.componentInstance.fehler.set('');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(schliessen).toHaveBeenCalledTimes(2);
  });

  it('zeigt im Leerzustand Titel und Erklärung', () => {
    const { fixture } = aufbauen();
    const leer = (fixture.nativeElement as HTMLElement).querySelector('app-leerzustand')!;
    expect(leer.querySelector('.titel')?.textContent).toBe('Keine Aufgaben');
    expect(leer.querySelector('.erklaerung')?.textContent).toBe('Erklärung');
  });
});
