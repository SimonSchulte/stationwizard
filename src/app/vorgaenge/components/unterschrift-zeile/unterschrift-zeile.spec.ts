import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { testUnterschriften } from '../../testing/vorgang-testdaten';
import { UnterschriftStand } from '../../models/vorgang.model';
import { UnterschriftZeile } from './unterschrift-zeile';

function rendere(stand: UnterschriftStand, eigen = '', bereit = true, eingereicht = false) {
  const fixture = TestBed.createComponent(UnterschriftZeile);
  fixture.componentRef.setInput('stand', stand);
  fixture.componentRef.setInput('eigeneEmail', eigen);
  fixture.componentRef.setInput('bereit', bereit);
  fixture.componentRef.setInput('eingereicht', eingereicht);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

const knoepfe = (e: HTMLElement) =>
  [...e.querySelectorAll('button')].map((b) => b.textContent?.trim());

describe('UnterschriftZeile', () => {
  it('bietet bei einem offenen Pflichtfeld beide Wege an', () => {
    const { element } = rendere(testUnterschriften()[0]);
    expect(element.textContent).toContain('Pflichtfeld: festgestellt durch');
    expect(knoepfe(element)).toEqual(['Selbst unterschreiben', 'Zur Unterschrift weitergeben']);
  });

  it('kennzeichnet die Leitung als optional', () => {
    const { element } = rendere(testUnterschriften()[1]);
    expect(element.textContent).toContain('Optional: Leitung');
  });

  it('sperrt beide Wege, solange die Pflichtangaben fehlen, und nennt den Grund', () => {
    const { element } = rendere(testUnterschriften()[0], '', false);
    expect([...element.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
    expect(element.textContent).toContain('Zuerst die Pflichtangaben ausfüllen.');
  });

  it('zeigt bei einer Anfrage an mich den Knopf zum Unterzeichnen', () => {
    const stand = testUnterschriften({
      verantw: { status: 'angefragt', anEmail: 'zora.muster@example.test' },
    })[2];
    const { element } = rendere(stand, 'zora.muster@example.test');
    expect(element.textContent).toContain('Du sollst hier unterschreiben');
    expect(knoepfe(element)).toContain('Mit meiner Unterschrift unterzeichnen');
  });

  it('zeigt bei einer Anfrage an eine andere Person nur das Zurückziehen', () => {
    const stand = testUnterschriften({
      verantw: { status: 'angefragt', anEmail: 'zora.muster@example.test' },
    })[2];
    const { element } = rendere(stand, 'tim.beispiel@example.test');
    expect(element.textContent).toContain('Wartet auf Zora Muster');
    expect(knoepfe(element)).toEqual(['Zurückziehen']);
  });

  it('zeigt eine Unterschrift mit Name, Datum und Bild und bietet das Entfernen an', () => {
    const stand = testUnterschriften({
      fest: {
        status: 'unterschrieben',
        name: 'Tim Beispiel',
        unterschriebenAm: '2026-11-12T10:00:00.000Z',
        signatur: { art: 'schrift', text: 'Tim Beispiel', font: 'Caveat' },
      },
    })[0];
    const { element } = rendere(stand);
    expect(element.textContent).toContain('Tim Beispiel');
    expect(element.textContent).toContain('12.11.2026');
    expect(element.querySelector('app-unterschrift-anzeige')).not.toBeNull();
    expect(knoepfe(element)).toEqual(['Entfernen']);
  });

  it('bietet nach dem Einreichen nichts mehr an', () => {
    const stand = testUnterschriften({ fest: { status: 'unterschrieben', name: 'Tim' } })[0];
    expect(knoepfe(rendere(stand, '', true, true).element)).toEqual([]);
  });
});
