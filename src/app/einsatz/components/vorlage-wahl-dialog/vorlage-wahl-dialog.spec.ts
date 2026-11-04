import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiVbVorlagenStorage } from '../../storage/api-vb-vorlagen-storage';
import { InMemoryVbVorlagenStorage } from '../../testing/in-memory-einsatzplanung';
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
    expect(close).toHaveBeenCalledWith(markt.id);
  });
});
