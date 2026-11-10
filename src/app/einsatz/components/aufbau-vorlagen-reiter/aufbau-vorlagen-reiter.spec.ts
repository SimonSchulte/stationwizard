import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { ApiAufbauVorlagenStorage } from '../../storage/api-aufbau-storage';
import { testAufbauInhalt, testEinheit, testId } from '../../testing/aufbau-testdaten';
import { InMemoryAufbauVorlagenStorage } from '../../testing/in-memory-aufbau';
import { AufbauVorlagenReiter } from './aufbau-vorlagen-reiter';

describe('AufbauVorlagenReiter', () => {
  let storage: InMemoryAufbauVorlagenStorage;
  let dialog: { bestaetigen: ReturnType<typeof vi.fn> };
  let meldungen: { erfolg: ReturnType<typeof vi.fn>; fehler: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    storage = new InMemoryAufbauVorlagenStorage();
    dialog = { bestaetigen: vi.fn().mockResolvedValue(true) };
    meldungen = { erfolg: vi.fn(), fehler: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiAufbauVorlagenStorage, useValue: storage },
        { provide: DialogDienst, useValue: dialog },
        { provide: MeldungsDienst, useValue: meldungen },
      ],
    });
  });

  async function erzeuge() {
    const fixture = TestBed.createComponent(AufbauVorlagenReiter);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('zeigt ohne Vorlagen einen Leerzustand mit dem Weg zur neuen Vorlage', async () => {
    const { element } = await erzeuge();
    expect(element.textContent).toContain('Noch keine Aufbau-Vorlagen');
    expect(element.querySelector('a[href="/einsatzplanung/aufbau-vorlagen/neu"]')).not.toBeNull();
  });

  it('listet Vorlagen mit Kennzahlen und verlinkt zum Editor', async () => {
    await storage.legeVorlageAn({
      id: testId(5),
      titel: 'Sanitätsdienst Standard',
      inhalt: testAufbauInhalt([testEinheit(), testEinheit()]),
    });
    const { element } = await erzeuge();
    expect(element.textContent).toContain('Sanitätsdienst Standard');
    expect(element.textContent).toContain('2 Einheiten');
    expect(
      element.querySelector(`a[href="/einsatzplanung/aufbau-vorlagen/${testId(5)}"]`),
    ).not.toBeNull();
  });

  it('löscht nur nach Bestätigung', async () => {
    await storage.legeVorlageAn({ id: testId(5), titel: 'Alt', inhalt: testAufbauInhalt([]) });
    const { fixture } = await erzeuge();
    const vorlage = (await storage.ladeVorlagen())[0]!;
    const reiter = fixture.componentInstance as unknown as {
      loeschen(v: typeof vorlage): Promise<void>;
    };

    dialog.bestaetigen.mockResolvedValueOnce(false);
    await reiter.loeschen(vorlage);
    expect(await storage.ladeVorlagen()).toHaveLength(1);

    await reiter.loeschen(vorlage);
    expect(await storage.ladeVorlagen()).toHaveLength(0);
    expect(meldungen.erfolg).toHaveBeenCalledWith('„Alt“ wurde gelöscht.');
  });
});
