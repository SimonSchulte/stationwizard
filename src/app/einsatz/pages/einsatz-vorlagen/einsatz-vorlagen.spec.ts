import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiPepVorlagenStorage } from '../../storage/api-pep-vorlagen-storage';
import { ApiVbVorlagenStorage } from '../../storage/api-vb-vorlagen-storage';
import {
  InMemoryPepVorlagenStorage,
  InMemoryVbVorlagenStorage,
} from '../../testing/in-memory-einsatzplanung';
import { testPepVorlage } from '../../testing/pep-testdaten';
import { testVorlage } from '../../testing/vb-testdaten';
import { EinsatzVorlagen } from './einsatz-vorlagen';

describe('EinsatzVorlagen', () => {
  let pep: InMemoryPepVorlagenStorage;
  let vb: InMemoryVbVorlagenStorage;
  let fixture: ComponentFixture<EinsatzVorlagen>;

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function stabil(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    pep = new InMemoryPepVorlagenStorage();
    vb = new InMemoryVbVorlagenStorage();
    await pep.legeVorlageAn(testPepVorlage({ titel: 'Sanitätsdienst klein' }));
    await vb.legeVorlageAn(testVorlage({ titel: 'Weihnachtsmarkt' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiPepVorlagenStorage, useValue: pep },
        { provide: ApiVbVorlagenStorage, useValue: vb },
      ],
    });
  });

  it('zeigt Seitenkopf und die Reiter PEP, VB und Aufbau', async () => {
    fixture = TestBed.createComponent(EinsatzVorlagen);
    await stabil();
    expect(element().querySelector('app-seitenkopf')?.textContent).toContain('Einsatz-Vorlagen');
    const reiter = [...element().querySelectorAll('[role="tab"]')].map((e) =>
      e.textContent?.trim(),
    );
    expect(reiter).toEqual(['PEP', 'VB', 'Aufbau']);
  });

  it('zeigt zuerst die PEP-Vorlagen und lädt die VB-Vorlagen erst beim Öffnen ihres Reiters', async () => {
    const vbLaden = vi.spyOn(vb, 'ladeVorlagen');
    fixture = TestBed.createComponent(EinsatzVorlagen);
    await stabil();
    expect(element().textContent).toContain('Sanitätsdienst klein');
    expect(element().textContent).not.toContain('Weihnachtsmarkt');
    expect(vbLaden).not.toHaveBeenCalled();

    element().querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
    await stabil();
    await stabil();
    expect(vbLaden).toHaveBeenCalledOnce();
    expect(element().textContent).toContain('Weihnachtsmarkt');
  });
});
