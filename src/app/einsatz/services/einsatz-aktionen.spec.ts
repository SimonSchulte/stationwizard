import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import { ApiEinsatzStorage } from '../storage/api-einsatz-storage';
import { InMemoryEinsatzStorage, InMemoryPepStorage } from '../testing/in-memory-einsatzplanung';
import { testPep } from '../testing/pep-testdaten';
import { testVeranstaltung } from '../testing/veranstaltung-testdaten';
import { testEinsatz } from '../testing/druck-testdaten';
import { EinsatzAktionenDienst, einsatzZielSchluessel } from './einsatz-aktionen';
import { EinsatzStoreService } from './einsatz-store.service';
import { PepEditorOeffnenDienst } from './pep-editor-oeffnen';

describe('EinsatzAktionenDienst', () => {
  let einsaetze: InMemoryEinsatzStorage;
  let peps: InMemoryPepStorage;
  let dienst: EinsatzAktionenDienst;
  let navigate: ReturnType<typeof vi.fn>;
  let dialogAntwort: unknown;
  const dialogOeffnen = vi.fn();
  const pepEditor = { oeffnen: vi.fn(), anlegen: vi.fn() };
  const gruppe = testVeranstaltung();

  beforeEach(() => {
    peps = new InMemoryPepStorage();
    einsaetze = new InMemoryEinsatzStorage(undefined, peps);
    navigate = vi.fn().mockResolvedValue(true);
    dialogAntwort = undefined;
    dialogOeffnen.mockReset().mockImplementation(() => ({ afterClosed: () => of(dialogAntwort) }));
    pepEditor.oeffnen.mockReset().mockResolvedValue(undefined);
    pepEditor.anlegen.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiEinsatzStorage, useValue: einsaetze },
        { provide: Router, useValue: { navigate } },
        { provide: MatDialog, useValue: { open: dialogOeffnen } },
        { provide: PepEditorOeffnenDienst, useValue: pepEditor },
      ],
    });
    dienst = TestBed.inject(EinsatzAktionenDienst);
  });

  async function liste() {
    const store = TestBed.inject(EinsatzStoreService);
    await store.laden();
    return store.einsaetze();
  }

  describe('PEP', () => {
    it('öffnet eine vorhandene PEP (Kennzahlen vorhanden), ohne anzulegen', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      peps._vorbelegen(einsatz.id, testPep());

      await dienst.pepOeffnenOderAnlegen((await liste())[0]);

      expect(pepEditor.oeffnen).toHaveBeenCalledWith(expect.objectContaining({ id: einsatz.id }));
      expect(pepEditor.anlegen).not.toHaveBeenCalled();
    });

    it('legt ohne PEP an und reicht die HiOrg-Veranstaltung nur bei einer Gruppe durch', async () => {
      const einsatz = testEinsatz({ hiorgVeranstaltungId: 'dienst-4711' });
      einsaetze._vorbelegen(einsatz);
      const eintrag = (await liste())[0];

      await dienst.pepOeffnenOderAnlegen(eintrag);
      expect(pepEditor.anlegen).toHaveBeenCalledWith(
        expect.objectContaining({ id: einsatz.id }),
        null,
      );

      await dienst.pepOeffnenOderAnlegen(gruppe);
      expect(pepEditor.anlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: einsatz.id }),
        gruppe,
      );
      expect(pepEditor.oeffnen).not.toHaveBeenCalled();
    });

    it('legt für eine Veranstaltung ohne Einsatz zuerst still den Einsatz an', async () => {
      await dienst.pepOeffnenOderAnlegen(gruppe);

      const alle = await einsaetze.ladeEinsaetze();
      expect(alle).toHaveLength(1);
      expect(alle[0]).toMatchObject({ hiorgVeranstaltungId: 'dienst-4711', titel: gruppe.titel });
      expect(pepEditor.anlegen).toHaveBeenCalledWith(
        expect.objectContaining({ id: alle[0].id }),
        gruppe,
      );
    });

    it('meldet einen Fehler des Editor-Dienstes über den MeldungsDienst', async () => {
      einsaetze._vorbelegen(testEinsatz());
      pepEditor.anlegen.mockRejectedValue(new Error('kaputt'));
      const fehler = vi.spyOn(TestBed.inject(MeldungsDienst), 'fehler');

      await dienst.pepOeffnenOderAnlegen((await liste())[0]);

      expect(fehler).toHaveBeenCalledWith('kaputt');
      expect(dienst.laufend()).toBeNull();
    });

    it('meldet einen Fehler beim Anlegen des Einsatzes und öffnet nichts', async () => {
      vi.spyOn(einsaetze, 'legeEinsatzAn').mockRejectedValue(new Error('Server weg'));
      const fehler = vi.spyOn(TestBed.inject(MeldungsDienst), 'fehler');

      await dienst.pepOeffnenOderAnlegen(gruppe);

      expect(fehler).toHaveBeenCalledWith('Server weg');
      expect(pepEditor.anlegen).not.toHaveBeenCalled();
    });
  });

  describe('Aufbau', () => {
    it('navigiert direkt zur Aufbau-Seite des Einsatzes, ohne zu fragen', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);

      await dienst.aufbauOeffnen((await liste())[0]);

      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', einsatz.id, 'aufbau']);
      expect(dialogOeffnen).not.toHaveBeenCalled();
    });

    it('legt für eine Veranstaltung ohne Einsatz zuerst still den Einsatz an', async () => {
      await dienst.aufbauOeffnen(gruppe);

      const alle = await einsaetze.ladeEinsaetze();
      expect(alle).toHaveLength(1);
      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', alle[0].id, 'aufbau']);
    });
  });

  describe('Sperre', () => {
    it('ignoriert weitere Aktionen, solange eine läuft', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      peps._vorbelegen(einsatz.id, testPep());
      const eintrag = (await liste())[0];
      let fertig!: () => void;
      pepEditor.oeffnen.mockImplementation(
        () =>
          new Promise<void>((aufloesen) => {
            fertig = () => aufloesen();
          }),
      );

      const erste = dienst.pepOeffnenOderAnlegen(eintrag);
      await vi.waitFor(() => expect(dienst.laufend()).toBe(einsatzZielSchluessel(eintrag)));
      await dienst.pepOeffnenOderAnlegen(eintrag);
      await dienst.aufbauOeffnen(eintrag);
      expect(pepEditor.oeffnen).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();

      fertig();
      await erste;
      expect(dienst.laufend()).toBeNull();
    });

    it('unterscheidet Schlüssel für Einsatz und Veranstaltung', () => {
      expect(einsatzZielSchluessel(gruppe)).toBe('hiorg:dienst-4711');
      const einsatz = testEinsatz();
      expect(einsatzZielSchluessel(einsatz)).toBe(einsatz.id);
    });
  });
});
