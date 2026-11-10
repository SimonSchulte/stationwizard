import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiEinsatzStorage } from '../../storage/api-einsatz-storage';
import { InMemoryEinsatzStorage, InMemoryPepStorage } from '../../testing/in-memory-einsatzplanung';
import { testPep } from '../../testing/pep-testdaten';
import { testEinsatz } from '../../testing/druck-testdaten';
import { EinsatzZuordnenDialog } from './einsatz-zuordnen-dialog';

describe('EinsatzZuordnenDialog', () => {
  const close = vi.fn();
  const ohnePep = testEinsatz({ titel: 'Weihnachtsmarkt' });
  const andererOhnePep = testEinsatz({ titel: 'Stadtlauf' });
  const mitPep = testEinsatz({ titel: 'Schützenfest' });

  async function oeffnen(vorbelegen = true) {
    const peps = new InMemoryPepStorage();
    const speicher = new InMemoryEinsatzStorage(undefined, peps);
    if (vorbelegen) {
      for (const e of [ohnePep, andererOhnePep, mitPep]) speicher._vorbelegen(e);
      peps._vorbelegen(mitPep.id, testPep());
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiEinsatzStorage, useValue: speicher },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(EinsatzZuordnenDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const wurzel = (f: { nativeElement: HTMLElement }) => f.nativeElement;

  beforeEach(() => close.mockClear());

  it('bietet nur Einsätze ohne PEP an', async () => {
    const fixture = await oeffnen();
    const text = wurzel(fixture).textContent ?? '';
    expect(text).toContain('Weihnachtsmarkt');
    expect(text).toContain('Stadtlauf');
    expect(text).not.toContain('Schützenfest');
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

  it('sperrt „Zuordnen“ ohne Auswahl und schließt mit dem gewählten Einsatz', async () => {
    const fixture = await oeffnen();
    const knopf = [...wurzel(fixture).querySelectorAll<HTMLButtonElement>('button')].find((k) =>
      k.textContent?.includes('Zuordnen'),
    )!;
    expect(knopf.disabled).toBe(true);
    fixture.componentInstance.gewaehlt.set(ohnePep.id);
    fixture.detectChanges();
    expect(knopf.disabled).toBe(false);
    knopf.click();
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ id: ohnePep.id }));
  });

  it('zeigt ohne passende Einsätze einen Leerzustand', async () => {
    const fixture = await oeffnen(false);
    expect(wurzel(fixture).textContent).toContain('Kein Einsatz ohne PEP');
  });
});
