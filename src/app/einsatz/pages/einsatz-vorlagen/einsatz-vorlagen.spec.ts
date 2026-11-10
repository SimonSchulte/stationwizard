import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiPepVorlagenStorage } from '../../storage/api-pep-vorlagen-storage';
import { ApiAufbauVorlagenStorage } from '../../storage/api-aufbau-storage';
import { InMemoryAufbauVorlagenStorage } from '../../testing/in-memory-aufbau';
import { InMemoryPepVorlagenStorage } from '../../testing/in-memory-einsatzplanung';
import { testPepVorlage } from '../../testing/pep-testdaten';
import { testAufbauInhalt } from '../../testing/aufbau-testdaten';
import { EinsatzVorlagen } from './einsatz-vorlagen';

describe('EinsatzVorlagen', () => {
  let pep: InMemoryPepVorlagenStorage;
  let aufbau: InMemoryAufbauVorlagenStorage;
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
    aufbau = new InMemoryAufbauVorlagenStorage();
    await pep.legeVorlageAn(testPepVorlage({ titel: 'Sanitätsdienst klein' }));
    await aufbau.legeVorlageAn({
      id: crypto.randomUUID(),
      titel: 'Weihnachtsmarkt',
      inhalt: testAufbauInhalt([]),
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiPepVorlagenStorage, useValue: pep },
        { provide: ApiAufbauVorlagenStorage, useValue: aufbau },
      ],
    });
  });

  it('zeigt Seitenkopf und die Reiter PEP und Aufbau', async () => {
    fixture = TestBed.createComponent(EinsatzVorlagen);
    await stabil();
    expect(element().querySelector('app-seitenkopf')?.textContent).toContain('Einsatz-Vorlagen');
    const reiter = [...element().querySelectorAll('[role="tab"]')].map((e) =>
      e.textContent?.trim(),
    );
    expect(reiter).toEqual(['PEP', 'Aufbau']);
  });

  it('zeigt zuerst die PEP-Vorlagen und lädt die Aufbau-Vorlagen erst beim Öffnen ihres Reiters', async () => {
    const aufbauLaden = vi.spyOn(aufbau, 'ladeVorlagen');
    fixture = TestBed.createComponent(EinsatzVorlagen);
    await stabil();
    expect(element().textContent).toContain('Sanitätsdienst klein');
    expect(element().textContent).not.toContain('Weihnachtsmarkt');
    expect(aufbauLaden).not.toHaveBeenCalled();

    element().querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
    await stabil();
    await stabil();
    expect(aufbauLaden).toHaveBeenCalledOnce();
    expect(element().textContent).toContain('Weihnachtsmarkt');
  });
});
