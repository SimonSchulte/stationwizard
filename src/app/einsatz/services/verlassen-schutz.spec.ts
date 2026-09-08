import { TestBed } from '@angular/core/testing';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import { PlanungStoreService } from './planung-store.service';
import { PlanungCloudService } from './planung-cloud.service';

describe('Schutz ungesicherter Einsatzpläne', () => {
  it('warnt auch nach dem Schließen der Editoransicht und berücksichtigt alle Pläne', () => {
    const store = TestBed.inject(PlanungStoreService);
    const schutz = TestBed.inject(VerlassenSchutz);
    const cloud = TestBed.inject(PlanungCloudService);
    expect(schutz.hatUngesicherteAenderungen()).toBe(false);
    const erster = store.createPlanung('Erfundener erster Einsatz');
    store.closePlanung();
    expect(schutz.hatUngesicherteAenderungen()).toBe(true);
    cloud.uebernahmeMerken({ planung: erster, etag: '"test"', versionWarning: false });
    expect(schutz.hatUngesicherteAenderungen()).toBe(false);
    store.createPlanung('Erfundener zweiter Einsatz');
    store.openPlanung(erster.id);
    expect(schutz.hatUngesicherteAenderungen()).toBe(true);
  });
});
