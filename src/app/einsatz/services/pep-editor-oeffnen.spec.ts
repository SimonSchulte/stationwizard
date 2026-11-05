import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import { EfsEinsatzGruppe } from '../models/planung.model';
import { ApiPepStorage } from '../storage/api-pep-storage';
import { ApiPepVorlagenStorage } from '../storage/api-pep-vorlagen-storage';
import {
  InMemoryPepStorage,
  InMemoryPepVorlagenStorage,
} from '../testing/in-memory-einsatzplanung';
import { testPep, testPepVorlage } from '../testing/pep-testdaten';
import { testEinsatz } from '../testing/vb-testdaten';
import { PepEditorKontext } from './pep-editor-kontext';
import { PepEditorOeffnenDienst, einsatzZeitAlsPlanungszeit } from './pep-editor-oeffnen';
import { PlanungOeffnenDienst } from './planung-oeffnen';
import { PlanungStoreService } from './planung-store.service';
import { erzeugeTestplanung } from './testing/pep-testdaten';

describe('einsatzZeitAlsPlanungszeit', () => {
  it('liest die lokale Zeit als lokale Zeit, ohne UTC-Verschiebung', () => {
    const zeit = new Date(einsatzZeitAlsPlanungszeit('2026-12-05T10:30')!);
    expect(zeit.getFullYear()).toBe(2026);
    expect(zeit.getMonth()).toBe(11);
    expect(zeit.getDate()).toBe(5);
    expect(zeit.getHours()).toBe(10);
    expect(zeit.getMinutes()).toBe(30);
  });

  it('liefert für fehlende oder unlesbare Werte null', () => {
    expect(einsatzZeitAlsPlanungszeit(null)).toBeNull();
    expect(einsatzZeitAlsPlanungszeit('')).toBeNull();
    expect(einsatzZeitAlsPlanungszeit('kein Datum')).toBeNull();
  });
});

describe('PepEditorOeffnenDienst', () => {
  let peps: InMemoryPepStorage;
  let vorlagen: InMemoryPepVorlagenStorage;
  let dienst: PepEditorOeffnenDienst;
  let store: PlanungStoreService;
  let kontext: PepEditorKontext;
  let navigate: ReturnType<typeof vi.fn>;
  let dialogAntwort: unknown;
  const dialogOeffnen = vi.fn();
  const planungOeffnen = { gruppeFuerVeranstaltung: vi.fn(), planungAusEfsBauen: vi.fn() };
  const gruppe: EfsEinsatzGruppe = {
    veranstaltung_id: '4711',
    titel: 'Weihnachtsmarkt Ummeln',
    datum_von: '2026-12-05T09:00:00.000Z',
    datum_bis: '2026-12-05T19:30:00.000Z',
    schichten: [],
  };

  beforeEach(() => {
    peps = new InMemoryPepStorage();
    vorlagen = new InMemoryPepVorlagenStorage();
    navigate = vi.fn().mockResolvedValue(true);
    dialogAntwort = undefined;
    dialogOeffnen.mockReset().mockImplementation(() => ({ afterClosed: () => of(dialogAntwort) }));
    planungOeffnen.gruppeFuerVeranstaltung.mockReset();
    planungOeffnen.planungAusEfsBauen.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiPepStorage, useValue: peps },
        { provide: ApiPepVorlagenStorage, useValue: vorlagen },
        { provide: Router, useValue: { navigate } },
        { provide: MatDialog, useValue: { open: dialogOeffnen } },
        { provide: PlanungOeffnenDienst, useValue: planungOeffnen },
      ],
    });
    dienst = TestBed.inject(PepEditorOeffnenDienst);
    store = TestBed.inject(PlanungStoreService);
    kontext = TestBed.inject(PepEditorKontext);
  });

  describe('oeffnen', () => {
    it('lädt die PEP, setzt Kopf aus dem Einsatz, Kontext und navigiert in den Editor', async () => {
      const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
      peps._vorbelegen(einsatz.id, testPep());

      await dienst.oeffnen(einsatz);

      const planung = store.active()!;
      expect(planung.id).toBe(einsatz.id);
      expect(planung.name).toBe(einsatz.titel);
      expect(planung.hiorg_einsatz_id).toBe('4711');
      expect(new Date(planung.start).getHours()).toBe(10);
      expect(new Date(planung.end).getHours()).toBe(20);
      expect(planung.posten).toHaveLength(1);
      expect(planung.einsatzkraefte[0].name).toBe('Testperson Nord');
      expect(planung.einsatzleiter?.id).toBe('kraft-1');
      expect(kontext.ziel()).toEqual({ art: 'einsatz', einsatz });
      expect(store.hatUngesichertes()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/editor']);
    });

    it('nimmt ohne Zeitangaben den Zeitpunkt jetzt, statt zu scheitern', async () => {
      const einsatz = testEinsatz({ beginn: null, ende: null });
      peps._vorbelegen(einsatz.id, testPep());
      await dienst.oeffnen(einsatz);
      const planung = store.active()!;
      expect(Number.isNaN(new Date(planung.start).getTime())).toBe(false);
      expect(planung.end).toBe(planung.start);
    });

    it('wirft ohne PEP und öffnet nichts', async () => {
      await expect(dienst.oeffnen(testEinsatz())).rejects.toThrow('noch keine PEP');
      expect(store.active()).toBeNull();
      expect(kontext.ziel()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('wirft den Ladefehler des Speichers', async () => {
      vi.spyOn(peps, 'ladePep').mockRejectedValue(new Error('Server weg'));
      await expect(dienst.oeffnen(testEinsatz())).rejects.toThrow('Server weg');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('anlegen', () => {
    it('kopiert nach der Wahl einer Vorlage deren Posten mit neuen Ids und öffnet die PEP', async () => {
      const einsatz = testEinsatz();
      const vorlage = testPepVorlage();
      vorlagen._vorbelegen(vorlage);
      dialogAntwort = { art: 'vorlage', vorlageId: vorlage.id };

      await dienst.anlegen(einsatz, null);

      expect(dialogOeffnen).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ data: { art: 'pep' } }),
      );
      const gespeichert = (await peps.ladePep(einsatz.id))!;
      expect(gespeichert.daten.vorlageId).toBe(vorlage.id);
      expect(gespeichert.daten.inhalt.posten[0].bezeichnung).toBe('Sanitätsstation');
      expect(gespeichert.daten.inhalt.posten[0].id).not.toBe(vorlage.inhalt.posten[0].id);
      expect(gespeichert.daten.inhalt.einsatzkraefte).toEqual([]);
      expect(store.active()?.id).toBe(einsatz.id);
      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/editor']);
      expect(planungOeffnen.planungAusEfsBauen).not.toHaveBeenCalled();
    });

    it('legt bei „Leer beginnen“ eine leere PEP an', async () => {
      const einsatz = testEinsatz();
      dialogAntwort = { art: 'leer' };

      await dienst.anlegen(einsatz, null);

      const gespeichert = (await peps.ladePep(einsatz.id))!;
      expect(gespeichert.daten.vorlageId).toBeNull();
      expect(gespeichert.daten.inhalt.posten).toEqual([]);
      expect(store.active()?.posten).toEqual([]);
    });

    it('tut bei Abbruch des Dialogs nichts', async () => {
      const einsatz = testEinsatz();
      dialogAntwort = undefined;

      await dienst.anlegen(einsatz, gruppe);

      expect(await peps.ladePep(einsatz.id)).toBeNull();
      expect(planungOeffnen.planungAusEfsBauen).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(store.active()).toBeNull();
    });

    it('übernimmt bei einer HiOrg-Gruppe Posten und Einsatzkräfte aus EFS als Basis', async () => {
      const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
      const basis = erzeugeTestplanung();
      planungOeffnen.planungAusEfsBauen.mockResolvedValue(basis);
      dialogAntwort = { art: 'leer' };

      await dienst.anlegen(einsatz, gruppe);

      expect(planungOeffnen.planungAusEfsBauen).toHaveBeenCalledWith(gruppe);
      expect(planungOeffnen.gruppeFuerVeranstaltung).not.toHaveBeenCalled();
      const inhalt = (await peps.ladePep(einsatz.id))!.daten.inhalt;
      expect(inhalt.einsatzkraefte.map((k) => k.name)).toEqual(['Testperson Nord']);
      expect(inhalt.posten[0].bezeichnung).toBe('Übungsposten');
      // Kopf bleibt der des Einsatzes, nicht der der EFS-Planung.
      expect(store.active()?.name).toBe(einsatz.titel);
      expect(store.active()?.id).toBe(einsatz.id);
    });

    it('sucht die Veranstaltung selbst, wenn nur der Einsatz bekannt ist', async () => {
      const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
      planungOeffnen.gruppeFuerVeranstaltung.mockResolvedValue(gruppe);
      planungOeffnen.planungAusEfsBauen.mockResolvedValue(erzeugeTestplanung());
      dialogAntwort = { art: 'leer' };

      await dienst.anlegen(einsatz, null);

      expect(planungOeffnen.gruppeFuerVeranstaltung).toHaveBeenCalledWith('4711');
      expect(planungOeffnen.planungAusEfsBauen).toHaveBeenCalledWith(gruppe);
    });

    it('warnt, wenn die Veranstaltung nicht im EFS-Abruf ist, und legt ohne Basis an', async () => {
      const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
      planungOeffnen.gruppeFuerVeranstaltung.mockResolvedValue(null);
      const warnung = vi
        .spyOn(TestBed.inject(MeldungsDienst), 'warnung')
        .mockReturnValue({} as never);
      dialogAntwort = { art: 'leer' };

      await dienst.anlegen(einsatz, null);

      expect(warnung).toHaveBeenCalledWith(expect.stringContaining('nicht im EFS-Abruf'));
      expect(planungOeffnen.planungAusEfsBauen).not.toHaveBeenCalled();
      expect((await peps.ladePep(einsatz.id))?.daten.inhalt.einsatzkraefte).toEqual([]);
      expect(store.active()?.id).toBe(einsatz.id);
    });

    it('legt für einen Einsatz ohne HiOrg nie eine EFS-Abfrage an', async () => {
      dialogAntwort = { art: 'leer' };
      await dienst.anlegen(testEinsatz({ hiorgVeranstaltungId: null }), null);
      expect(planungOeffnen.gruppeFuerVeranstaltung).not.toHaveBeenCalled();
    });

    it('wirft einen Fehler des EFS-Abrufs, ohne etwas anzulegen', async () => {
      const einsatz = testEinsatz();
      planungOeffnen.planungAusEfsBauen.mockRejectedValue(new Error('EFS nicht erreichbar'));
      dialogAntwort = { art: 'leer' };

      await expect(dienst.anlegen(einsatz, gruppe)).rejects.toThrow('EFS nicht erreichbar');

      expect(await peps.ladePep(einsatz.id)).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('wirft, wenn die gewählte Vorlage fehlt, und öffnet nichts', async () => {
      const einsatz = testEinsatz();
      dialogAntwort = { art: 'vorlage', vorlageId: crypto.randomUUID() };

      await expect(dienst.anlegen(einsatz, null)).rejects.toThrow(
        'Die Vorlage wurde nicht gefunden.',
      );

      expect(await peps.ladePep(einsatz.id)).toBeNull();
      expect(store.active()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('wirft, wenn der Einsatz inzwischen eine PEP hat (If-None-Match), und lässt sie unverändert', async () => {
      const einsatz = testEinsatz();
      peps._vorbelegen(einsatz.id, testPep());
      dialogAntwort = { art: 'leer' };

      await expect(dienst.anlegen(einsatz, null)).rejects.toThrow();

      expect((await peps.ladePep(einsatz.id))?.version).toBe('"1"');
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
