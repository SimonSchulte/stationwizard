import { TestBed } from '@angular/core/testing';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import { PlanungStoreService } from './planung-store.service';
import { erzeugeTestplanung } from './testing/pep-testdaten';

describe('Schutz ungesicherter Einsatzpläne', () => {
  it('gilt nur für die offene Planung und folgt dem zuletzt gespeicherten Stand', () => {
    const store = TestBed.inject(PlanungStoreService);
    const schutz = TestBed.inject(VerlassenSchutz);
    expect(schutz.hatUngesicherteAenderungen()).toBe(false);

    const planung = erzeugeTestplanung();
    store.oeffneGespeichert(planung);
    expect(schutz.hatUngesicherteAenderungen()).toBe(false);

    store.updateActive({ ...planung, name: 'Erfundene Änderung' });
    expect(schutz.hatUngesicherteAenderungen()).toBe(true);
    expect(store.hatUngesichertes()).toBe(true);

    store.gespeichertMerken(store.active());
    expect(schutz.hatUngesicherteAenderungen()).toBe(false);

    store.updateActive({ ...planung, name: 'Noch eine Änderung' });
    expect(schutz.hatUngesicherteAenderungen()).toBe(true);
    // Ein geschlossener Plan lebt nicht weiter und wird nicht mehr geschützt.
    store.closePlanung();
    expect(schutz.hatUngesicherteAenderungen()).toBe(false);
  });

  it('behandelt eine nie gespeicherte Planung als ungesichert', () => {
    const store = TestBed.inject(PlanungStoreService);
    store.createPlanung('Erfundene neue Planung');
    expect(store.hatUngesichertes()).toBe(true);
  });

  it('macht die Rückfrage vor dem Verlassen von „ungesichert“ abhängig', async () => {
    const { planungVerlassenGuard } = await import('./planung-verlassen-guard');
    const { DialogDienst } = await import('../../kern/dialog/dialog-dienst');
    const bestaetigen = vi.fn().mockResolvedValue(false);
    TestBed.configureTestingModule({
      providers: [{ provide: DialogDienst, useValue: { bestaetigen } }],
    });
    const store = TestBed.inject(PlanungStoreService);
    const planung = erzeugeTestplanung();
    store.oeffneGespeichert(planung);
    const pruefen = () =>
      TestBed.runInInjectionContext(() =>
        planungVerlassenGuard(null as never, null as never, null as never, null as never),
      );
    expect(await pruefen()).toBe(true);
    expect(bestaetigen).not.toHaveBeenCalled();

    store.updateActive({ ...planung, name: 'Erfundene Änderung' });
    expect(await pruefen()).toBe(false);
    expect(bestaetigen).toHaveBeenCalledTimes(1);
  });
});
