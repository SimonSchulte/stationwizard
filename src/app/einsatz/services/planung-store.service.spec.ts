import { describe, expect, it } from 'vitest';
import { PlanungStoreService } from './planung-store.service';
import { erzeugeTestplanung } from './testing/pep-testdaten';
import { lesePepDatei, serialisierePepDatei } from './pep-datei';

describe('Roster ersetzen und Einsatzplandatei', () => {
  it('entfernt auch die Einsatzleitung, wenn deren Person aus dem Roster entfernt wird', () => {
    const store = new PlanungStoreService();
    store.importPlanung(erzeugeTestplanung());
    store.importRoster([], 'replace');
    const planung = store.active()!;
    expect(planung.einsatzleiter).toBeNull();
    expect(planung.posten[0].positions[0].assigned).toBeNull();
    expect(lesePepDatei(serialisierePepDatei(planung)).planung).toEqual(planung);
    store.undo();
    expect(store.active()?.einsatzleiter).not.toBeNull();
  });
});
