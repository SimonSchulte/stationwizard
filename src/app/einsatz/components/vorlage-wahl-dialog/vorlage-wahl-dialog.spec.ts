import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiPepVorlagenStorage } from '../../storage/api-pep-vorlagen-storage';
import { ApiVbVorlagenStorage } from '../../storage/api-vb-vorlagen-storage';
import {
  InMemoryPepVorlagenStorage,
  InMemoryVbVorlagenStorage,
} from '../../testing/in-memory-einsatzplanung';
import { testPepVorlage } from '../../testing/pep-testdaten';
import { testVorlage } from '../../testing/vb-testdaten';
import { VorlageWahlDialog } from './vorlage-wahl-dialog';

describe('VorlageWahlDialog', () => {
  const close = vi.fn();
  const markt = testVorlage({ titel: 'Weihnachtsmarkt' });
  const lauf = testVorlage({ titel: 'Stadtlauf' });

  async function oeffnen() {
    const speicher = new InMemoryVbVorlagenStorage();
    speicher._vorbelegen(markt);
    speicher._vorbelegen(lauf);
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiVbVorlagenStorage, useValue: speicher },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(VorlageWahlDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const wurzel = (f: { nativeElement: HTMLElement }) => f.nativeElement;

  beforeEach(() => close.mockClear());

  it('listet Vorlagen mit Kennzahlen und Version und zeigt den Kopierhinweis', async () => {
    const fixture = await oeffnen();
    const text = wurzel(fixture).textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Weihnachtsmarkt');
    expect(text).toContain('Stadtlauf');
    expect(text).toContain('1 Abschnitte · 1 Laufzettel · 1 Positionen · Version 1');
    expect(text).toContain('Die Vorlage wird kopiert');
    expect(wurzel(fixture).querySelectorAll('mat-radio-button')).toHaveLength(2);
  });

  it('filtert über die Suche', async () => {
    const fixture = await oeffnen();
    fixture.componentInstance.suche.set('lauf');
    fixture.detectChanges();
    const eintraege = wurzel(fixture).querySelectorAll('mat-radio-button');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0].textContent).toContain('Stadtlauf');
  });

  it('sperrt „Kopie anlegen“ ohne Auswahl und schließt mit der gewählten Id', async () => {
    const fixture = await oeffnen();
    const knoepfe = [...wurzel(fixture).querySelectorAll<HTMLButtonElement>('button')];
    const kopie = knoepfe.find((k) => k.textContent?.includes('Kopie anlegen'))!;
    expect(kopie.disabled).toBe(true);

    fixture.componentInstance.gewaehlt.set(markt.id);
    fixture.detectChanges();
    expect(kopie.disabled).toBe(false);
    kopie.click();
    expect(close).toHaveBeenCalledWith({ art: 'vorlage', vorlageId: markt.id });
  });

  it('schließt mit „Leer beginnen“ ohne Vorlagenwahl', async () => {
    const fixture = await oeffnen();
    const leer = [...wurzel(fixture).querySelectorAll<HTMLButtonElement>('button')].find((k) =>
      k.textContent?.includes('Leer beginnen'),
    )!;
    expect(leer.disabled).toBe(false);
    leer.click();
    expect(close).toHaveBeenCalledWith({ art: 'leer' });
  });

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
