import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import { EfsEinsatzGruppe } from '../models/planung.model';
import { ApiEinsatzStorage } from '../storage/api-einsatz-storage';
import { ApiVbVorlagenStorage } from '../storage/api-vb-vorlagen-storage';
import { ApiVorbereitungStorage } from '../storage/api-vorbereitung-storage';
import {
  InMemoryEinsatzStorage,
  InMemoryVbVorlagenStorage,
  InMemoryVorbereitungStorage,
} from '../testing/in-memory-einsatzplanung';
import { testEinsatz, testVorbereitung, testVorlage } from '../testing/vb-testdaten';
import { EinsatzAktionenDienst, einsatzZielSchluessel } from './einsatz-aktionen';
import { EinsatzPepKontext } from './einsatz-pep-kontext';
import { EinsatzStoreService } from './einsatz-store.service';
import { PlanungOeffnenDienst } from './planung-oeffnen';

describe('EinsatzAktionenDienst', () => {
  let einsaetze: InMemoryEinsatzStorage;
  let vorbereitungen: InMemoryVorbereitungStorage;
  let vorlagen: InMemoryVbVorlagenStorage;
  let dienst: EinsatzAktionenDienst;
  let navigate: ReturnType<typeof vi.fn>;
  let dialogAntwort: unknown;
  const dialogOeffnen = vi.fn();
  const planung = {
    cloudOeffnen: vi.fn(),
    efsGruppeOeffnen: vi.fn(),
    leerePlanungOeffnen: vi.fn(),
    gruppeFuerVeranstaltung: vi.fn(),
  };
  const gruppe: EfsEinsatzGruppe = {
    veranstaltung_id: '4711',
    titel: 'Weihnachtsmarkt Ummeln',
    datum_von: '2026-12-05T09:00:00.000Z',
    datum_bis: '2026-12-05T19:30:00.000Z',
    ort: 'Ummeln',
    schichten: [],
  };

  beforeEach(() => {
    vorbereitungen = new InMemoryVorbereitungStorage();
    einsaetze = new InMemoryEinsatzStorage(vorbereitungen);
    vorlagen = new InMemoryVbVorlagenStorage();
    navigate = vi.fn().mockResolvedValue(true);
    dialogAntwort = undefined;
    dialogOeffnen.mockReset().mockImplementation(() => ({ afterClosed: () => of(dialogAntwort) }));
    planung.cloudOeffnen.mockReset().mockImplementation(async (_id, beiPlanung) => {
      beiPlanung?.('planung-1');
      return { geoeffnet: true, fehler: '' };
    });
    planung.efsGruppeOeffnen.mockReset().mockImplementation(async (_g, beiPlanung) => {
      beiPlanung?.('planung-2');
    });
    planung.leerePlanungOeffnen.mockReset().mockImplementation(async (_t, _b, _e, beiPlanung) => {
      beiPlanung?.('planung-3');
    });
    planung.gruppeFuerVeranstaltung.mockReset().mockResolvedValue(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiEinsatzStorage, useValue: einsaetze },
        { provide: ApiVorbereitungStorage, useValue: vorbereitungen },
        { provide: ApiVbVorlagenStorage, useValue: vorlagen },
        { provide: Router, useValue: { navigate } },
        { provide: MatDialog, useValue: { open: dialogOeffnen } },
        { provide: PlanungOeffnenDienst, useValue: planung },
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
    it('öffnet einen vorhandenen PEP aus Nextcloud und merkt den Einsatz', async () => {
      const pepId = crypto.randomUUID();
      const einsatz = testEinsatz({ pepId });
      einsaetze._vorbelegen(einsatz);
      const merken = vi.spyOn(TestBed.inject(EinsatzPepKontext), 'merken');

      await dienst.pepOeffnenOderAnlegen((await liste())[0]);

      expect(planung.cloudOeffnen).toHaveBeenCalledWith(pepId, expect.any(Function));
      expect(merken).toHaveBeenCalledWith(einsatz.id, 'planung-1', pepId);
      expect(planung.efsGruppeOeffnen).not.toHaveBeenCalled();
      expect(planung.leerePlanungOeffnen).not.toHaveBeenCalled();
    });

    it('meldet einen Fehler beim Öffnen über den MeldungsDienst', async () => {
      einsaetze._vorbelegen(testEinsatz({ pepId: crypto.randomUUID() }));
      planung.cloudOeffnen.mockResolvedValue({ geoeffnet: false, fehler: 'kaputt' });
      const fehler = vi.spyOn(TestBed.inject(MeldungsDienst), 'fehler');

      await dienst.pepOeffnenOderAnlegen((await liste())[0]);
      expect(fehler).toHaveBeenCalledWith('kaputt');
    });

    it('legt ohne HiOrg eine leere Planung an und merkt den Einsatz ohne Datei', async () => {
      const einsatz = testEinsatz({ titel: 'Dienst ohne HiOrg' });
      einsaetze._vorbelegen(einsatz);
      const merken = vi.spyOn(TestBed.inject(EinsatzPepKontext), 'merken');

      await dienst.pepOeffnenOderAnlegen((await liste())[0]);

      expect(planung.leerePlanungOeffnen).toHaveBeenCalledWith(
        'Dienst ohne HiOrg',
        einsatz.beginn,
        einsatz.ende,
        expect.any(Function),
      );
      expect(merken).toHaveBeenCalledWith(einsatz.id, 'planung-3', null);
    });

    it('legt mit HiOrg-Veranstaltung über EFS an, wenn der Einsatz schon besteht', async () => {
      const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
      einsaetze._vorbelegen(einsatz);
      planung.gruppeFuerVeranstaltung.mockResolvedValue(gruppe);
      const merken = vi.spyOn(TestBed.inject(EinsatzPepKontext), 'merken');

      await dienst.pepOeffnenOderAnlegen((await liste())[0]);

      expect(planung.gruppeFuerVeranstaltung).toHaveBeenCalledWith('4711');
      expect(planung.efsGruppeOeffnen).toHaveBeenCalledWith(gruppe, expect.any(Function));
      expect(merken).toHaveBeenCalledWith(einsatz.id, 'planung-2', null);
    });

    it('fällt mit Warnung auf eine leere Planung zurück, wenn die Veranstaltung fehlt', async () => {
      einsaetze._vorbelegen(testEinsatz({ hiorgVeranstaltungId: '4711' }));
      const warnung = vi.spyOn(TestBed.inject(MeldungsDienst), 'warnung');

      await dienst.pepOeffnenOderAnlegen((await liste())[0]);

      expect(warnung).toHaveBeenCalledWith(expect.stringContaining('nicht gefunden'));
      expect(planung.leerePlanungOeffnen).toHaveBeenCalledTimes(1);
    });

    it('legt für eine Veranstaltung ohne Einsatz zuerst still den Einsatz an', async () => {
      const merken = vi.spyOn(TestBed.inject(EinsatzPepKontext), 'merken');

      await dienst.pepOeffnenOderAnlegen(gruppe);

      const alle = await einsaetze.ladeEinsaetze();
      expect(alle).toHaveLength(1);
      expect(alle[0]).toMatchObject({ hiorgVeranstaltungId: '4711', titel: gruppe.titel });
      expect(planung.efsGruppeOeffnen).toHaveBeenCalledWith(gruppe, expect.any(Function));
      expect(merken).toHaveBeenCalledWith(alle[0].id, 'planung-2', null);
    });

    it('öffnet für eine Veranstaltung mit bekanntem PEP den vorhandenen Plan', async () => {
      const pepId = crypto.randomUUID();
      einsaetze._vorbelegen(testEinsatz({ hiorgVeranstaltungId: '4711', pepId }));

      await dienst.pepOeffnenOderAnlegen(gruppe);

      expect(await einsaetze.ladeEinsaetze()).toHaveLength(1);
      expect(planung.cloudOeffnen).toHaveBeenCalledWith(pepId, expect.any(Function));
    });

    it('meldet einen Fehler beim Anlegen des Einsatzes und öffnet nichts', async () => {
      vi.spyOn(einsaetze, 'legeEinsatzAn').mockRejectedValue(new Error('Server weg'));
      const fehler = vi.spyOn(TestBed.inject(MeldungsDienst), 'fehler');

      await dienst.pepOeffnenOderAnlegen(gruppe);

      expect(fehler).toHaveBeenCalledWith('Server weg');
      expect(planung.efsGruppeOeffnen).not.toHaveBeenCalled();
    });
  });

  describe('VB', () => {
    it('navigiert bei vorhandener VB direkt in den Editor, ohne Dialog', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      vorbereitungen._vorbelegen(einsatz.id, testVorbereitung());

      await dienst.vbOeffnenOderAnlegen((await liste())[0]);

      expect(dialogOeffnen).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', einsatz.id, 'vb']);
    });

    it('kopiert nach der Wahl einer Vorlage und öffnet den Editor', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      const vorlage = testVorlage();
      vorlagen._vorbelegen(vorlage);
      dialogAntwort = { art: 'vorlage', vorlageId: vorlage.id };
      const ausVorlage = vi.spyOn(TestBed.inject(ApiVorbereitungStorage), 'legeVorbereitungAn');

      await dienst.vbOeffnenOderAnlegen((await liste())[0]);

      expect(ausVorlage).toHaveBeenCalledTimes(1);
      expect(vorbereitungen.kennzahlen(einsatz.id)).toEqual({ laufzettel: 1, positionen: 1 });
      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', einsatz.id, 'vb']);
    });

    it('legt bei „Leer beginnen“ eine leere VB an und öffnet den Editor', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      dialogAntwort = { art: 'leer' };

      await dienst.vbOeffnenOderAnlegen((await liste())[0]);

      expect(vorbereitungen.kennzahlen(einsatz.id)).toEqual({ laufzettel: 0, positionen: 0 });
      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', einsatz.id, 'vb']);
    });

    it('tut bei Abbruch des Dialogs nichts', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      dialogAntwort = undefined;

      await dienst.vbOeffnenOderAnlegen((await liste())[0]);

      expect(vorbereitungen.kennzahlen(einsatz.id)).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect(dienst.laufend()).toBeNull();
    });

    it('meldet einen Fehler beim Anlegen und navigiert nicht', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      dialogAntwort = { art: 'vorlage', vorlageId: crypto.randomUUID() };
      const fehler = vi.spyOn(TestBed.inject(MeldungsDienst), 'fehler');

      await dienst.vbOeffnenOderAnlegen((await liste())[0]);

      expect(fehler).toHaveBeenCalledWith('Die Vorlage wurde nicht gefunden.');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('legt für eine Veranstaltung ohne Einsatz zuerst den Einsatz an', async () => {
      dialogAntwort = { art: 'leer' };

      await dienst.vbOeffnenOderAnlegen(gruppe);

      const alle = await einsaetze.ladeEinsaetze();
      expect(alle).toHaveLength(1);
      expect(alle[0]).toMatchObject({ hiorgVeranstaltungId: '4711' });
      expect(vorbereitungen.kennzahlen(alle[0].id)).not.toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', alle[0].id, 'vb']);
    });

    it('legt für eine Veranstaltung ohne Einsatz auch bei Abbruch nur den Einsatz an', async () => {
      await dienst.vbOeffnenOderAnlegen(gruppe);

      const alle = await einsaetze.ladeEinsaetze();
      expect(alle).toHaveLength(1);
      expect(vorbereitungen.kennzahlen(alle[0].id)).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('Sperre', () => {
    it('ignoriert weitere Aktionen, solange eine läuft', async () => {
      const einsatz = testEinsatz({ pepId: crypto.randomUUID() });
      einsaetze._vorbelegen(einsatz);
      const eintrag = (await liste())[0];
      let fertig!: () => void;
      planung.cloudOeffnen.mockImplementation(
        () =>
          new Promise((aufloesen) => {
            fertig = () => aufloesen({ geoeffnet: true, fehler: '' });
          }),
      );

      const erste = dienst.pepOeffnenOderAnlegen(eintrag);
      await vi.waitFor(() => expect(dienst.laufend()).toBe(einsatzZielSchluessel(eintrag)));
      await dienst.pepOeffnenOderAnlegen(eintrag);
      await dienst.vbOeffnenOderAnlegen(eintrag);
      expect(planung.cloudOeffnen).toHaveBeenCalledTimes(1);
      expect(dialogOeffnen).not.toHaveBeenCalled();

      fertig();
      await erste;
      expect(dienst.laufend()).toBeNull();
    });

    it('unterscheidet Schlüssel für Einsatz und Veranstaltung', () => {
      expect(einsatzZielSchluessel(gruppe)).toBe('hiorg:4711');
      const einsatz = testEinsatz();
      expect(einsatzZielSchluessel(einsatz)).toBe(einsatz.id);
    });
  });
});
