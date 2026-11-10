import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EinsatzKarte } from './einsatz-karte';

describe('EinsatzKarte', () => {
  let fixture: ComponentFixture<EinsatzKarte>;
  const wurzel = () => fixture.nativeElement as HTMLElement;
  const kacheln = () => [...wurzel().querySelectorAll<HTMLButtonElement>('button.kachel')];
  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    fixture = TestBed.createComponent(EinsatzKarte);
    fixture.componentRef.setInput('titel', 'Weihnachtsmarkt');
  });

  function setze(werte: Record<string, unknown>) {
    for (const [name, wert] of Object.entries(werte)) fixture.componentRef.setInput(name, wert);
    fixture.detectChanges();
  }

  it('zeigt den Datumsblock ohne UTC-Verschiebung, mit Jahr nur außerhalb des laufenden', () => {
    const jahr = new Date().getFullYear();
    setze({ beginn: `${jahr}-12-05T00:30` });
    const block = wurzel().querySelector('app-datumsblock')!;
    expect(text(block.querySelector('.monat')!)).toBe('DEZ');
    expect(text(block.querySelector('.tag')!)).toBe('5');
    expect(text(block.querySelector('.zeile')!)).toMatch(/^[A-Z][a-z] · 00:30$/);

    setze({ beginn: `${jahr + 1}-03-10T10:00` });
    expect(text(wurzel().querySelector('app-datumsblock .monat')!)).toBe(`MÄR ${jahr + 1}`);
  });

  it('zeigt ohne Beginn einen gedämpften Strich', () => {
    setze({ beginn: null });
    expect(wurzel().querySelector('app-datumsblock.ohne-datum')).not.toBeNull();
    expect(text(wurzel().querySelector('app-datumsblock.ohne-datum .tag')!)).toBe('–');
  });

  it('zeigt Metazeile: Schichten nur über eins, Ort oder Ersatztext, Herkunft', () => {
    setze({ schichten: 1, ort: null, herkunft: 'eigen' });
    let meta = text(wurzel().querySelector('.meta')!);
    expect(meta).not.toContain('Schichten');
    expect(meta).toContain('Ort nicht angegeben');
    expect(meta).toContain('selbst angelegt');

    setze({ schichten: 3, ort: 'Ummeln', herkunft: 'hiorg' });
    meta = text(wurzel().querySelector('.meta')!);
    expect(meta).toContain('3 Schichten');
    expect(meta).toContain('Ummeln');
    expect(meta).toContain('HiOrg');
  });

  it('beschriftet fehlende Stände mit „Anlegen“ und gestricheltem Zustand', () => {
    setze({ pepVorhanden: false, aufbauKennzahlen: null });
    const [pep, aufbau] = kacheln();
    expect(pep.classList.contains('vorhanden')).toBe(false);
    expect(text(pep)).toContain('nicht angelegt');
    expect(text(pep)).toContain('Anlegen');
    expect(pep.getAttribute('aria-label')).toBe('PEP anlegen: Weihnachtsmarkt');
    expect(aufbau.getAttribute('aria-label')).toBe('Aufbau anlegen: Weihnachtsmarkt');
    expect(text(aufbau)).toContain('nicht angelegt');
  });

  it('zeigt vorhandene Stände mit Untertitel, Kennzahlen und „öffnen“ im aria-label', () => {
    setze({ pepVorhanden: true, aufbauKennzahlen: { einheiten: 3, kisten: 5, positionen: 64 } });
    const [pep, aufbau] = kacheln();
    expect(pep.classList.contains('vorhanden')).toBe(true);
    expect(text(pep)).toContain('verknüpft');
    expect(text(pep)).not.toContain('Anlegen');
    expect(text(aufbau)).toContain('3 Einheiten · 64 Pos.');
    expect(pep.getAttribute('aria-label')).toBe('PEP öffnen: Weihnachtsmarkt');
    expect(aufbau.getAttribute('aria-label')).toBe('Aufbau öffnen: Weihnachtsmarkt');
  });

  it('zeigt bei Kennzahlen „n / m besetzt“, am Handy ohne Wort „besetzt“ (zusatz)', () => {
    setze({ pepKennzahlen: { posten: 2, positionen: 12, besetzt: 7 } });
    const [pep] = kacheln();
    expect(pep.classList.contains('vorhanden')).toBe(true);
    expect(text(pep)).toContain('7 / 12 besetzt');
    expect(pep.querySelector('.untertitel .zusatz')?.textContent).toContain('besetzt');
    expect(text(pep)).not.toContain('Anlegen');
    expect(pep.getAttribute('aria-label')).toBe('PEP öffnen: Weihnachtsmarkt');
  });

  it('meldet Klicks über pep und aufbau', () => {
    setze({});
    let pep = 0;
    let aufbau = 0;
    fixture.componentInstance.pep.subscribe(() => pep++);
    fixture.componentInstance.aufbau.subscribe(() => aufbau++);
    const [kachelPep, kachelAufbau] = kacheln();
    kachelPep.click();
    kachelAufbau.click();
    kachelAufbau.click();
    expect([pep, aufbau]).toEqual([1, 2]);
  });

  it('sperrt beide Kacheln, solange gesperrt', () => {
    setze({ gesperrt: true });
    expect(kacheln().every((k) => k.disabled)).toBe(true);
  });

  it('zeigt den Abstandshinweis neutral oder gelb und ohne Wert gar nicht', () => {
    setze({ abstandTage: 0 });
    const hinweis = () => wurzel().querySelector('.abstand');
    expect(text(hinweis()!)).toBe('heute');
    expect(hinweis()!.classList.contains('dringend')).toBe(false);

    setze({ abstandTage: 1, dringend: true });
    expect(text(hinweis()!)).toBe('morgen');
    expect(hinweis()!.classList.contains('dringend')).toBe(true);

    setze({ abstandTage: 9 });
    expect(text(hinweis()!)).toBe('in 9 Tagen');

    setze({ abstandTage: null });
    expect(hinweis()).toBeNull();
  });

  describe('EFS-Abgleich', () => {
    const efsZeile = () => wurzel().querySelector('.efs');

    it('zeigt ohne Abgleichsergebnis nichts an', () => {
      setze({ efsArt: null });
      expect(efsZeile()).toBeNull();
    });

    it('zeigt einen Treffer und bietet die PEP mit EFS-Personal an', () => {
      setze({ efsArt: 'treffer' });
      expect(text(efsZeile()!)).toContain('In EFS gefunden');
      expect(text(kacheln()[0])).toContain('mit EFS-Personal');
    });

    it('meldet bei mehreren möglichen Treffern die Prüfung', () => {
      setze({ efsArt: 'pruefen' });
      let geprueft = 0;
      fixture.componentInstance.efsPruefen.subscribe(() => (geprueft += 1));
      expect(text(efsZeile()!)).toContain('bitte prüfen');
      efsZeile()!.querySelector('button')!.click();
      expect(geprueft).toBe(1);
      expect(text(kacheln()[0])).toContain('nicht angelegt');
    });

    it('zeigt „Nicht in EFS“ ohne Treffer', () => {
      setze({ efsArt: 'keiner' });
      expect(text(efsZeile()!)).toContain('Nicht in EFS');
    });
  });
});
