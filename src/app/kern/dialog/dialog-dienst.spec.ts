import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it } from 'vitest';
import { DialogDienst } from './dialog-dienst';

describe('Gemeinsame Dialoge', () => {
  let dienst: DialogDienst;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    dienst = TestBed.inject(DialogDienst);
  });

  function klicke(text: string): void {
    const knopf = Array.from(
      document.querySelectorAll<HTMLButtonElement>('mat-dialog-container button'),
    ).find((element) => element.textContent?.trim() === text);
    expect(knopf).toBeDefined();
    knopf!.click();
  }

  it('zeigt Inhalt im echten Material-Dialog und gibt bei Abbrechen false zurück', async () => {
    const ergebnis = dienst.bestaetigen('Testdaten entfernen?', 'Testbestätigung', 'Entfernen');
    TestBed.tick();
    expect(document.querySelector('mat-dialog-container')?.textContent).toContain(
      'Testdaten entfernen?',
    );
    klicke('Abbrechen');
    expect(await ergebnis).toBe(false);
  });

  it('unterscheidet die bewusste Bestätigung vom Schließen ohne Auswahl', async () => {
    const bestaetigt = dienst.bestaetigen('Fortfahren?');
    TestBed.tick();
    klicke('Fortfahren');
    expect(await bestaetigt).toBe(true);
    const geschlossen = dienst.bestaetigen('Noch einmal?');
    TestBed.tick();
    TestBed.inject(MatDialog).closeAll();
    expect(await geschlossen).toBe(false);
  });

  it('stellt Hinweise mit einer einzigen Bestätigungsaktion dar', async () => {
    const hinweis = dienst.hinweis('Die Datei enthält ungültiges JSON.', 'Datei nicht lesbar');
    TestBed.tick();
    expect(document.querySelectorAll('mat-dialog-container button')).toHaveLength(1);
    klicke('Verstanden');
    await hinweis;
  });
});
