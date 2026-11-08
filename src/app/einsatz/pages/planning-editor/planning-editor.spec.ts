import { TestBed } from '@angular/core/testing';
import { Provider, signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningEditor } from './planning-editor';
import { EfsQuelle } from '../../services/efs-quelle.service';
import type { EfsEinsatzGruppe, EfsEinsatzkraft } from '../../models/efs.model';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PdfExportService } from '../../services/pdf-export.service';
import { SaveLoadService } from '../../services/save-load.service';
import { PepEditorKontext } from '../../services/pep-editor-kontext';
import { PepEditorOeffnenDienst } from '../../services/pep-editor-oeffnen';
import { erzeugeTestplanung } from '../../services/testing/pep-testdaten';
import { ApiEinsatzStorage } from '../../storage/api-einsatz-storage';
import { ApiPepStorage } from '../../storage/api-pep-storage';
import { ApiPepVorlagenStorage } from '../../storage/api-pep-vorlagen-storage';
import {
  InMemoryEinsatzStorage,
  InMemoryPepStorage,
  InMemoryPepVorlagenStorage,
  InMemoryVorbereitungStorage,
} from '../../testing/in-memory-einsatzplanung';
import { testPep, testPepVorlage } from '../../testing/pep-testdaten';
import { testEinsatz } from '../../testing/vb-testdaten';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../../kern/zustand/zustand';
import { Einsatz } from '../../models/einsatz.model';
import { Planung } from '../../models/planung.model';

describe('PlanningEditor', () => {
  const dialog = {
    bestaetigen: vi.fn(),
    hinweis: vi.fn().mockResolvedValue(undefined),
    eingabe: vi.fn(),
  };
  const dialogOeffnen = vi.fn();
  const speichernLokal = vi.fn();
  const navigate = vi.fn();
  let peps: InMemoryPepStorage;
  let vorlagen: InMemoryPepVorlagenStorage;
  let einsaetze: InMemoryEinsatzStorage;
  let store: PlanungStoreService;
  let kontext: PepEditorKontext;
  let meldungen: MeldungsDienst;

  function konfigurieren(
    route: { data?: Record<string, unknown>; id?: string } = {},
    zusatz: Provider[] = [],
  ) {
    TestBed.configureTestingModule({
      providers: [
        ...zusatz,
        { provide: PdfExportService, useValue: {} },
        { provide: MatDialog, useValue: { open: dialogOeffnen } },
        { provide: DialogDienst, useValue: dialog },
        { provide: SaveLoadService, useValue: { save: speichernLokal } },
        { provide: Router, useValue: { navigate } },
        { provide: ApiPepStorage, useValue: peps },
        { provide: ApiPepVorlagenStorage, useValue: vorlagen },
        { provide: ApiEinsatzStorage, useValue: einsaetze },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: route.data ?? {},
              paramMap: convertToParamMap(route.id ? { id: route.id } : {}),
            },
          },
        },
      ],
    });
    store = TestBed.inject(PlanungStoreService);
    kontext = TestBed.inject(PepEditorKontext);
    meldungen = TestBed.inject(MeldungsDienst);
    // Keine echten Snackbars im Test: sie würden erst nach dem Abbau des Injectors öffnen.
    for (const art of ['erfolg', 'fehler', 'warnung', 'info'] as const) {
      vi.spyOn(meldungen, art).mockReturnValue({} as never);
    }
  }

  const editorBauen = () => TestBed.runInInjectionContext(() => new PlanningEditor());

  beforeEach(() => {
    vi.resetAllMocks();
    dialog.hinweis.mockResolvedValue(undefined);
    navigate.mockResolvedValue(true);
    peps = new InMemoryPepStorage();
    vorlagen = new InMemoryPepVorlagenStorage();
    einsaetze = new InMemoryEinsatzStorage(new InMemoryVorbereitungStorage(), peps);
  });

  /** Einsatz mit PEP in der Datenbank, im Editor geöffnet wie über die Einsatzübersicht. */
  async function einsatzOeffnen(): Promise<{ einsatz: Einsatz; editor: PlanningEditor }> {
    const einsatz = testEinsatz();
    einsaetze._vorbelegen(einsatz);
    peps._vorbelegen(einsatz.id, testPep());
    await TestBed.inject(PepEditorOeffnenDienst).oeffnen(einsatz);
    return { einsatz, editor: editorBauen() };
  }

  describe('Speichern in die Datenbank', () => {
    beforeEach(() => konfigurieren());

    it('speichert die PEP des Einsatzes mit If-Match und gilt danach als gesichert', async () => {
      const { einsatz, editor } = await einsatzOeffnen();
      const erfolg = vi.spyOn(meldungen, 'erfolg');
      const planung = store.active()!;
      store.updateActive({ ...planung, beschreibung: 'Geänderte Lage' });
      expect(editor.hatUngesichertes()).toBe(true);

      await editor.speichern();

      expect((await peps.ladePep(einsatz.id))?.daten.inhalt.beschreibung).toBe('Geänderte Lage');
      expect((await peps.ladePep(einsatz.id))?.version).toBe('"2"');
      expect(editor.hatUngesichertes()).toBe(false);
      expect(editor.speicherFehler()).toBe('');
      expect(erfolg).toHaveBeenCalledWith('Gespeichert.');
    });

    it('meldet während des Speicherns neu hinzugekommene Änderungen als ungespeichert', async () => {
      const { editor } = await einsatzOeffnen();
      const planung = store.active()!;
      store.updateActive({ ...planung, beschreibung: 'Erster Stand' });
      let fertig!: () => void;
      const original = peps.speicherePep.bind(peps);
      vi.spyOn(peps, 'speicherePep').mockImplementation(
        (...args) =>
          new Promise((resolve) => {
            fertig = () => resolve(original(...args));
          }),
      );

      const speichern = editor.speichern();
      expect(editor.speichert()).toBe(true);
      store.updateActive({ ...store.active()!, beschreibung: 'Nach Speicherstart geändert' });
      fertig();
      await speichern;

      expect(editor.speichert()).toBe(false);
      expect(editor.hatUngesichertes()).toBe(true);
    });

    it('bewahrt bei einem Konflikt (412) den lokalen Stand und lädt erst nach Bestätigung neu', async () => {
      const { einsatz, editor } = await einsatzOeffnen();
      const lokal = { ...store.active()!, beschreibung: 'Meine Änderung' };
      store.updateActive(lokal);
      // Jemand anderes speichert zwischendurch.
      await peps.speicherePep(
        einsatz.id,
        testPep({ inhalt: { ...testPep().inhalt, beschreibung: 'Fremde Änderung' } }),
        '"1"',
      );

      await editor.speichern();

      expect(editor.konflikt()).toBe(true);
      expect(editor.speicherFehler()).toContain('zwischenzeitlich geändert');
      expect(store.active()).toEqual(lokal);
      expect(editor.hatUngesichertes()).toBe(true);
      expect((await peps.ladePep(einsatz.id))?.daten.inhalt.beschreibung).toBe('Fremde Änderung');

      // Abgelehnte Bestätigung: nichts wird verworfen, nichts heruntergeladen.
      dialog.bestaetigen.mockResolvedValueOnce(false);
      await editor.neuLaden();
      expect(store.active()).toEqual(lokal);
      expect(speichernLokal).not.toHaveBeenCalled();

      // Bestätigt: erst die Rettungskopie (JSON), dann der gespeicherte Stand.
      dialog.bestaetigen.mockResolvedValueOnce(true);
      await editor.neuLaden();
      expect(speichernLokal).toHaveBeenCalledWith(lokal);
      expect(store.active()?.beschreibung).toBe('Fremde Änderung');
      expect(editor.hatUngesichertes()).toBe(false);
      expect(editor.konflikt()).toBe(false);
      // Danach gelingt das Speichern mit der neuen Version.
      store.updateActive({ ...store.active()!, beschreibung: 'Zusammengeführt' });
      await editor.speichern();
      expect(editor.speicherFehler()).toBe('');
      expect((await peps.ladePep(einsatz.id))?.daten.inhalt.beschreibung).toBe('Zusammengeführt');
    });

    it('zeigt andere Speicherfehler ohne Konflikt und bewahrt den Stand', async () => {
      const { editor } = await einsatzOeffnen();
      const lokal = { ...store.active()!, beschreibung: 'Meine Änderung' };
      store.updateActive(lokal);
      vi.spyOn(peps, 'speicherePep').mockRejectedValue(new Error('Server weg'));

      await editor.speichern();

      expect(editor.konflikt()).toBe(false);
      expect(editor.speicherFehler()).toBe('Server weg');
      expect(store.active()).toEqual(lokal);
      expect(editor.speichert()).toBe(false);
    });

    it('sperrt Titel und Zeitraum, solange die Planung zu einem Einsatz gehört', async () => {
      const { editor } = await einsatzOeffnen();
      expect(editor.kopfGesperrt()).toBe(true);
    });
  });

  describe('Datei ohne Einsatz', () => {
    beforeEach(() => konfigurieren());

    it('fragt über den Zuordnen-Dialog nach dem Einsatz, legt die PEP an und setzt den Kontext', async () => {
      const einsatz = testEinsatz({ titel: 'Zugeordneter Dienst' });
      einsaetze._vorbelegen(einsatz);
      await TestBed.inject(ApiEinsatzStorage).ladeEinsaetze();
      const datei = erzeugeTestplanung();
      store.oeffneGespeichert(datei);
      const editor = editorBauen();
      dialogOeffnen.mockReturnValue({
        afterClosed: () => of({ ...einsatz, pep: null, vb: null, version: 1 }),
      });
      const erfolg = vi.spyOn(meldungen, 'erfolg');

      await editor.speichern();

      expect(dialogOeffnen).toHaveBeenCalledTimes(1);
      const gespeichert = await peps.ladePep(einsatz.id);
      expect(gespeichert?.daten.inhalt.einsatzkraefte).toHaveLength(1);
      expect(gespeichert?.daten.inhalt.posten[0].bezeichnung).toBe('Übungsposten');
      expect(kontext.ziel()).toMatchObject({ art: 'einsatz', einsatz: { id: einsatz.id } });
      expect(store.active()?.id).toBe(einsatz.id);
      expect(store.active()?.name).toBe('Zugeordneter Dienst');
      expect(editor.hatUngesichertes()).toBe(false);
      expect(erfolg).toHaveBeenCalledWith(expect.stringContaining('Zugeordneter Dienst'));
    });

    it('tut bei abgebrochenem Zuordnen-Dialog nichts', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      const datei = erzeugeTestplanung();
      store.oeffneGespeichert(datei);
      const editor = editorBauen();
      dialogOeffnen.mockReturnValue({
        afterClosed: () => of(undefined),
      });

      await editor.speichern();

      expect(await peps.ladePep(einsatz.id)).toBeNull();
      expect(kontext.ziel()).toBeNull();
      expect(store.active()).toEqual(datei);
    });

    it('meldet, wenn der Einsatz inzwischen schon eine PEP hat, und behält die Datei', async () => {
      const einsatz = testEinsatz();
      einsaetze._vorbelegen(einsatz);
      peps._vorbelegen(einsatz.id, testPep());
      const datei = erzeugeTestplanung();
      store.oeffneGespeichert(datei);
      const editor = editorBauen();
      dialogOeffnen.mockReturnValue({
        afterClosed: () => of({ ...einsatz, pep: null, vb: null, version: 1 }),
      });

      await editor.speichern();

      expect(editor.speicherFehler()).not.toBe('');
      expect(kontext.ziel()).toBeNull();
      expect(store.active()).toEqual(datei);
    });
  });

  describe('Als Vorlage speichern', () => {
    beforeEach(() => konfigurieren());

    it('fragt den Titel ab und legt Posten ohne Einsatzkräfte als Vorlage an', async () => {
      const { editor } = await einsatzOeffnen();
      dialog.eingabe.mockResolvedValue('  Sanitätsdienst Standard ');
      const erfolg = vi.spyOn(meldungen, 'erfolg');

      await editor.alsVorlageSpeichern();

      const liste = await vorlagen.ladeVorlagen();
      expect(liste).toHaveLength(1);
      expect(liste[0].titel).toBe('Sanitätsdienst Standard');
      const vorlage = await vorlagen.ladeVorlage(liste[0].id);
      expect(
        vorlage?.daten.inhalt.posten[0].positionen.every((p) => p.einsatzkraftId === null),
      ).toBe(true);
      expect(erfolg).toHaveBeenCalled();
    });

    it('legt bei abgebrochener Titelabfrage nichts an', async () => {
      const { editor } = await einsatzOeffnen();
      dialog.eingabe.mockResolvedValue(null);
      await editor.alsVorlageSpeichern();
      expect(await vorlagen.ladeVorlagen()).toHaveLength(0);
    });

    it('meldet einen Fehler über den MeldungsDienst', async () => {
      const { editor } = await einsatzOeffnen();
      dialog.eingabe.mockResolvedValue('Vorlage');
      vi.spyOn(vorlagen, 'legeVorlageAn').mockRejectedValue(new Error('Server weg'));
      const fehler = vi.spyOn(meldungen, 'fehler');
      await editor.alsVorlageSpeichern();
      expect(fehler).toHaveBeenCalledWith('Server weg');
    });
  });

  describe('Modus Vorlage', () => {
    it('beginnt mit „neu“ leer, legt beim ersten Speichern an und wechselt auf die Vorlagen-Adresse', async () => {
      peps = new InMemoryPepStorage();
      konfigurieren({ data: { modus: 'vorlage' }, id: 'neu' });
      const editor = editorBauen();
      expect(editor.istVorlage).toBe(true);
      const planung = store.active()!;
      expect(planung.name).toBe('Neue Vorlage');
      expect(editor.kopfGesperrt()).toBe(false);

      editor.updateName('Neue Standardvorlage');
      store.addPosten();
      await editor.speichern();

      const liste = await vorlagen.ladeVorlagen();
      expect(liste).toHaveLength(1);
      expect(liste[0]).toMatchObject({ id: planung.id, titel: 'Neue Standardvorlage', posten: 1 });
      expect(editor.hatUngesichertes()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/pep-vorlagen', planung.id], {
        replaceUrl: true,
      });
    });

    it('lädt eine vorhandene Vorlage ohne Einsatzkräfte und speichert mit If-Match', async () => {
      const vorlage = testPepVorlage();
      vorlagen._vorbelegen(vorlage);
      konfigurieren({ data: { modus: 'vorlage' }, id: vorlage.id });
      const editor = editorBauen();
      await vi.waitFor(() => expect(store.active()?.id).toBe(vorlage.id));
      expect(store.active()?.name).toBe(vorlage.titel);
      expect(store.active()?.einsatzkraefte).toEqual([]);

      editor.updateName('Umbenannt');
      await editor.speichern();
      expect(editor.speicherFehler()).toBe('');
      expect((await vorlagen.ladeVorlage(vorlage.id))?.version).toBe('"2"');
      expect((await vorlagen.ladeVorlage(vorlage.id))?.daten.titel).toBe('Umbenannt');
      expect(navigate).not.toHaveBeenCalled();

      // Veraltete Version: Konflikt, lokaler Stand bleibt.
      await vorlagen.speichereVorlage({ ...vorlage, titel: 'Fremd' }, '"2"');
      editor.updateName('Noch einmal');
      await editor.speichern();
      expect(editor.konflikt()).toBe(true);
      expect(store.active()?.name).toBe('Noch einmal');
    });

    it('zeigt den Fehler, wenn die Vorlage nicht gefunden wird', async () => {
      konfigurieren({ data: { modus: 'vorlage' }, id: crypto.randomUUID() });
      const editor = editorBauen();
      await vi.waitFor(() => expect(editor.speicherFehler()).toContain('nicht gefunden'));
      expect(store.active()).toBeNull();
    });

    it('geht mit dem Zurück-Pfeil in die Vorlagenverwaltung', () => {
      konfigurieren({ data: { modus: 'vorlage' }, id: 'neu' });
      editorBauen().goBack();
      expect(navigate).toHaveBeenCalledWith(['/verwaltung/einsatz-vorlagen']);
    });

    it('blendet Helferpool, Zeitraum und Einsatzleitung aus', async () => {
      konfigurieren({ data: { modus: 'vorlage' }, id: 'neu' });
      const fixture = TestBed.createComponent(PlanningEditor);
      await fixture.whenStable();
      fixture.detectChanges();
      const wurzel: HTMLElement = fixture.nativeElement;
      expect(wurzel.querySelector('.pane-roster')).toBeNull();
      expect(wurzel.querySelector('.einsatzleiter-field')).toBeNull();
      expect(wurzel.querySelector('[aria-label="Startdatum"]')).toBeNull();
      expect(wurzel.textContent).toContain('Vorlage: Posten und Positionen ohne Einsatzkräfte');
      expect(wurzel.querySelector('input[aria-label="Titel der Vorlage"]')).not.toBeNull();
      expect(wurzel.textContent).not.toContain('Als Vorlage speichern');
    });
  });

  describe('Darstellung im Einsatzmodus', () => {
    it('zeigt „Speichern“, Helferpool und das Menü „Als Vorlage speichern“, nichts von Nextcloud', async () => {
      konfigurieren();
      await einsatzOeffnen();
      const fixture = TestBed.createComponent(PlanningEditor);
      await fixture.whenStable();
      fixture.detectChanges();
      const wurzel: HTMLElement = fixture.nativeElement;
      const knoepfe = [...wurzel.querySelectorAll('button')].map((k) => k.textContent?.trim());
      expect(knoepfe.some((t) => t?.includes('Speichern'))).toBe(true);
      expect(wurzel.querySelector('.pane-roster')).not.toBeNull();
      expect(wurzel.querySelector('button[aria-label="JSON herunterladen"]')).not.toBeNull();
      expect(wurzel.textContent).not.toContain('Nextcloud');
      expect(wurzel.querySelector('input[aria-label="Planungsname"]')).not.toBeNull();
    });
  });

  describe('Posten im Fokus', () => {
    beforeEach(() => konfigurieren());

    /** Zwei Posten; der erste hat eine freie Position und eine verfügbare Einsatzkraft passt. */
    function planungMitZweiPosten(): Planung {
      const basis = erzeugeTestplanung();
      const helfer = { id: 'ek-frei', name: 'Frei Franka', tags: { medizinisch: ['RS' as const] } };
      return {
        ...basis,
        einsatzkraefte: [...basis.einsatzkraefte, helfer],
        posten: [
          {
            ...basis.posten[0],
            positions: [
              ...basis.posten[0].positions,
              {
                id: 'pos-frei',
                label: 'Sanitäter',
                requirements: { taktisch: null, medizinisch: 'RS' as const },
                assigned: null,
              },
            ],
          },
          { id: 'posten-zwei', label: 'Streife', fahrzeug: null, positions: [] },
        ],
      };
    }

    async function editorAnzeigen() {
      store.oeffneGespeichert(planungMitZweiPosten());
      const fixture = TestBed.createComponent(PlanningEditor);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    it('zeigt zunächst den ersten Posten und wechselt über die Schiene', async () => {
      const fixture = await editorAnzeigen();
      const wurzel: HTMLElement = fixture.nativeElement;
      const planung = store.active()!;
      expect(planung.posten.length).toBeGreaterThan(1);
      expect(fixture.componentInstance.aktiverPosten()?.id).toBe(planung.posten[0].id);
      const knoepfe = wurzel.querySelectorAll<HTMLButtonElement>(
        'app-posten-schiene button.posten',
      );
      expect(knoepfe).toHaveLength(planung.posten.length);

      knoepfe[1].click();
      fixture.detectChanges();
      expect(fixture.componentInstance.aktiverPosten()?.id).toBe(planung.posten[1].id);
      expect(wurzel.querySelectorAll('app-position-zeile')).toHaveLength(
        planung.posten[1].positions.length,
      );
    });

    it('fällt nach dem Löschen des gewählten Postens auf den ersten zurück', async () => {
      const fixture = await editorAnzeigen();
      const planung = store.active()!;
      fixture.componentInstance.postenWaehlen(planung.posten[1].id);
      store.deletePosten(planung.posten[1].id);
      expect(fixture.componentInstance.aktiverPosten()?.id).toBe(planung.posten[0].id);
    });

    it('wählt einen neu angelegten Posten sofort', async () => {
      const fixture = await editorAnzeigen();
      fixture.componentInstance.addPosten();
      const neu = store.active()!.posten.at(-1)!;
      expect(fixture.componentInstance.aktiverPosten()?.id).toBe(neu.id);
    });

    it('teilt einen Vorschlag per Klick zu', async () => {
      const fixture = await editorAnzeigen();
      const editor = fixture.componentInstance;
      const planung = store.active()!;
      const posten = planung.posten[0];
      const frei = posten.positions.find((p) => !p.assigned);
      const kandidat = editor.verfuegbar()[0];
      expect(frei && kandidat).toBeTruthy();
      editor.vorschlagUebernehmen(posten.id, frei!.id, kandidat.id);
      const danach = store.active()!.posten[0].positions.find((p) => p.id === frei!.id);
      expect(danach?.assigned?.id).toBe(kandidat.id);
      expect(editor.verfuegbar().map((e) => e.id)).not.toContain(kandidat.id);
      expect(editor.eingeteilt().map((e) => e.id)).toContain(kandidat.id);
    });
  });

  describe('Abgleich mit EFS', () => {
    const gruppe: EfsEinsatzGruppe = {
      veranstaltung_id: 'v1',
      titel: 'Synthetischer Übungsplan',
      datum_von: '2026-09-08T10:00:00',
      datum_bis: '2026-09-08T12:00:00',
      schichten: [],
    };
    const efsKraft = (nachname: string, vorname = 'Vorname'): EfsEinsatzkraft => ({
      hiorg_org_id: nachname,
      vorname,
      nachname,
      ausbildungen: ['RS'],
    });
    const personalLaden = vi.fn();

    function efsBereitstellen(art: 'treffer' | 'keiner'): void {
      konfigurieren({}, [
        {
          provide: EfsQuelle,
          useValue: {
            erreichbar: () => true,
            laden: vi.fn().mockResolvedValue(undefined),
            abgleich: () => ({
              art,
              treffer: art === 'treffer' ? gruppe : null,
              kandidaten: [],
            }),
            personalLaden,
          },
        },
      ]);
    }

    it('bietet den Abgleich nur bei einem EFS-Treffer an', () => {
      efsBereitstellen('keiner');
      store.oeffneGespeichert(erzeugeTestplanung());
      expect(editorBauen().efsMoeglich()).toBe(false);
    });

    it('stellt EFS-Personal gegenüber, ändert nichts und übernimmt erst nach der Bestätigung', async () => {
      efsBereitstellen('treffer');
      const planung = erzeugeTestplanung();
      store.oeffneGespeichert(planung);
      personalLaden.mockResolvedValue([efsKraft('Testperson', 'Nord'), efsKraft('Neu')]);
      const editor = editorBauen();
      expect(editor.efsMoeglich()).toBe(true);

      await editor.efsAbgleichen();
      expect(personalLaden).toHaveBeenCalledWith(gruppe, true);
      expect(editor.efsVergleich()?.neu.map((e) => e.name)).toEqual(['Neu Vorname']);
      expect(editor.efsVergleich()?.entfallen).toEqual([]);
      expect(store.active()?.einsatzkraefte).toHaveLength(1);

      editor.efsUebernehmen();
      expect(store.active()?.einsatzkraefte.map((e) => e.name)).toEqual([
        'Testperson Nord',
        'Neu Vorname',
      ]);
      expect(editor.efsVergleich()).toBeNull();
    });

    it('meldet einen Fehler von EFS und lässt die PEP unverändert', async () => {
      efsBereitstellen('treffer');
      store.oeffneGespeichert(erzeugeTestplanung());
      personalLaden.mockRejectedValue(new Error('EFS weg'));
      const editor = editorBauen();
      await editor.efsAbgleichen();
      expect(meldungen.fehler).toHaveBeenCalledWith(expect.stringContaining('EFS weg'));
      expect(editor.efsVergleich()).toBeNull();
      expect(editor.efsLaedt()).toBe(false);
    });
  });

  describe('Asynchrone Editor-Aktionen', () => {
    let editor: PlanningEditor;
    beforeEach(() => {
      konfigurieren();
      editor = editorBauen();
    });

    it('löscht einen Posten bei abgebrochener Bestätigung nicht', async () => {
      dialog.bestaetigen.mockResolvedValue(false);
      const planung = erzeugeTestplanung();
      store.oeffneGespeichert(planung);
      await editor.deletePosten(planung.posten[0]);
      expect(store.active()).toEqual(planung);
    });

    it('löscht nach einer Bestätigung keine inzwischen geänderten Zuteilungen', async () => {
      let bestaetigen!: (entscheidung: boolean) => void;
      dialog.bestaetigen.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            bestaetigen = resolve;
          }),
      );
      const planung = erzeugeTestplanung();
      store.oeffneGespeichert(planung);
      const loeschen = editor.deletePosten(planung.posten[0]);
      store.updatePostenLabel(planung.posten[0].id, 'Während des Dialogs geändert');
      bestaetigen(true);
      await loeschen;
      expect(store.active()?.posten[0].label).toBe('Während des Dialogs geändert');
      expect(dialog.hinweis).toHaveBeenCalled();
    });
  });
});
