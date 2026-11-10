import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiPepVorlagenStorage } from '../../storage/api-pep-vorlagen-storage';
import { InMemoryPepVorlagenStorage } from '../../testing/in-memory-einsatzplanung';
import { testPepVorlage } from '../../testing/pep-testdaten';
import { VorlageWahlDialog } from './vorlage-wahl-dialog';

describe('VorlageWahlDialog', () => {
  const close = vi.fn();

  const wurzel = (f: { nativeElement: HTMLElement }) => f.nativeElement;

  beforeEach(() => close.mockClear());

  describe('für PEP-Vorlagen', () => {
    const standard = testPepVorlage({ titel: 'Sanitätsdienst klein' });
    const gross = testPepVorlage({ titel: 'Großveranstaltung' });

    async function oeffnenPep() {
      const speicher = new InMemoryPepVorlagenStorage();
      speicher._vorbelegen(standard);
      speicher._vorbelegen(gross);
      TestBed.configureTestingModule({
        providers: [
          { provide: ApiPepVorlagenStorage, useValue: speicher },
          { provide: MatDialogRef, useValue: { close } },
          { provide: MAT_DIALOG_DATA, useValue: { art: 'pep' } },
        ],
      });
      const fixture = TestBed.createComponent(VorlageWahlDialog);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    it('listet PEP-Vorlagen mit Posten- und Positionszahl und eigenem Kopierhinweis', async () => {
      const fixture = await oeffnenPep();
      const text = wurzel(fixture).textContent?.replace(/\s+/g, ' ') ?? '';
      expect(text).toContain('Sanitätsdienst klein');
      expect(text).toContain('Großveranstaltung');
      expect(text).toContain('1 Posten · 2 Positionen · Version 1');
      expect(text).toContain('Posten und Positionen werden übernommen, Einsatzkräfte nicht');
      expect(text).not.toContain('Abschnitte');
      expect(wurzel(fixture).querySelectorAll('mat-radio-button')).toHaveLength(2);
    });

    it('schließt mit der gewählten PEP-Vorlage oder mit „Leer beginnen“', async () => {
      const fixture = await oeffnenPep();
      fixture.componentInstance.gewaehlt.set(gross.id);
      fixture.detectChanges();
      const knoepfe = [...wurzel(fixture).querySelectorAll<HTMLButtonElement>('button')];
      knoepfe.find((k) => k.textContent?.includes('Kopie anlegen'))!.click();
      expect(close).toHaveBeenCalledWith({ art: 'vorlage', vorlageId: gross.id });
      knoepfe.find((k) => k.textContent?.includes('Leer beginnen'))!.click();
      expect(close).toHaveBeenLastCalledWith({ art: 'leer' });
    });

    it('zeigt ohne PEP-Vorlagen den Leerzustand', async () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: ApiPepVorlagenStorage, useValue: new InMemoryPepVorlagenStorage() },
          { provide: MatDialogRef, useValue: { close } },
          { provide: MAT_DIALOG_DATA, useValue: { art: 'pep' } },
        ],
      });
      const fixture = TestBed.createComponent(VorlageWahlDialog);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(wurzel(fixture).textContent).toContain('Noch keine Vorlagen');
    });
  });
});
