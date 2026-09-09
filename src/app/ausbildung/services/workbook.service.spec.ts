import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wochentageImJahr } from '../../kern/kalender/datum';
import {
  PlanDocument,
  einJahrArbeitsmappe,
  leererTermin,
  leeresDocument,
} from '../models/plan.model';
import { WorkbookInhalt, WorkbookStorage } from '../storage/workbook-storage';
import { leseArbeitsmappe } from './excel-lesen';
import { schreibeArbeitsmappe } from './excel-schreiben';
import { PlanStore } from './plan-store';
import { WorkbookService } from './workbook.service';

function testDokument(titel = 'Fiktiver Ausbildungsplan'): PlanDocument {
  return {
    ...leeresDocument(2026),
    titel,
    termine: wochentageImJahr(2026, 'Mo').map((datum) => leererTermin(datum)),
  };
}

/** Liest genau das Jahresblatt 2026 der Testmappe als eigenständiges Dokument. */
function leseTestDokument(daten: ArrayBuffer): PlanDocument {
  const { arbeitsmappe } = leseArbeitsmappe(daten);
  const blatt = arbeitsmappe.jahre.find((j) => j.jahr === 2026);
  if (!blatt) {
    throw new Error('Kein Jahresblatt 2026 in der Testmappe.');
  }
  return { ...blatt, backlog: arbeitsmappe.backlog };
}

function testQuelle() {
  return {
    art: 'nextcloud',
    bezeichnung: 'Fiktive_Arbeitsmappe.xlsx',
    faehigkeiten: { direktesSpeichern: true, neuLaden: true },
    laden: vi.fn<WorkbookStorage['laden']>().mockResolvedValue({
      daten: schreibeArbeitsmappe(einJahrArbeitsmappe(testDokument())),
      dateiname: 'Fiktive_Arbeitsmappe.xlsx',
    }),
    speichern: vi.fn<WorkbookStorage['speichern']>().mockResolvedValue(),
  } satisfies WorkbookStorage;
}

function verzoegert<T>() {
  let freigeben!: (wert: T) => void;
  const ergebnis = new Promise<T>((resolve) => {
    freigeben = resolve;
  });
  return { ergebnis, freigeben };
}

describe('WorkbookService schützt Bearbeitungen während asynchroner Vorgänge', () => {
  let store: PlanStore;
  let workbook: WorkbookService;

  beforeEach(() => {
    store = TestBed.inject(PlanStore);
    workbook = TestBed.inject(WorkbookService);
    store.setzeDokument(testDokument());
  });

  it('speichert den angeforderten Snapshot und lässt spätere Änderungen ungespeichert', async () => {
    const quelle = testQuelle();
    await workbook.laden(quelle);
    store.setzeTitel('Stand beim Speichern');
    const geschrieben = verzoegert<void>();
    const antwort = verzoegert<void>();
    quelle.speichern.mockImplementation(async () => {
      geschrieben.freigeben();
      await antwort.ergebnis;
    });

    const speichern = workbook.speichern();
    // Auch Bearbeitungen während des dynamischen Excel-Imports gehören nicht zum Auftrag.
    store.setzeTitel('Spätere Bearbeitung');
    await geschrieben.ergebnis;
    const datei = leseTestDokument(quelle.speichern.mock.calls[0][0]);
    expect(datei.titel).toBe('Stand beim Speichern');
    antwort.freigeben();
    await speichern;

    expect(store.dokument().titel).toBe('Spätere Bearbeitung');
    expect(store.ungespeichert()).toBe(true);
    expect(workbook.beschaeftigt()).toBe(false);
  });

  it('markiert einen unverändert gespeicherten Stand als gesichert', async () => {
    const quelle = testQuelle();
    await workbook.laden(quelle);
    store.setzeTitel('Gespeicherte Bearbeitung');

    await workbook.speichern();

    expect(store.ungespeichert()).toBe(false);
  });

  it('markiert nach einem neuen Dokument keinen anderen Plan als gespeichert', async () => {
    const quelle = testQuelle();
    await workbook.laden(quelle);
    store.setzeTitel('Alter Plan');
    const antwort = verzoegert<void>();
    quelle.speichern.mockReturnValue(antwort.ergebnis);

    const speichern = workbook.speichern();
    workbook.neuesDokument(testDokument('Neuer Plan'));
    store.setzeTitel('Neuer bearbeiteter Plan');
    antwort.freigeben();
    await speichern;

    expect(store.dokument().titel).toBe('Neuer bearbeiteter Plan');
    expect(store.ungespeichert()).toBe(true);
    expect(workbook.ziel()).toBeNull();
    expect(quelle.speichern.mock.calls[0][1]).toBe('Fiktive_Arbeitsmappe.xlsx');
  });

  it('überschreibt keine Bearbeitung mit einer verspäteten Ladeantwort', async () => {
    const quelle = testQuelle();
    const antwort = verzoegert<WorkbookInhalt>();
    quelle.laden.mockReturnValue(antwort.ergebnis);

    const laden = workbook.laden(quelle);
    store.setzeTitel('Während des Ladens bearbeitet');
    antwort.freigeben({
      daten: schreibeArbeitsmappe(einJahrArbeitsmappe(testDokument('Stand vom Server'))),
      dateiname: 'Server.xlsx',
    });

    await expect(laden).rejects.toThrow('während des Ladens geändert');
    expect(store.dokument().titel).toBe('Während des Ladens bearbeitet');
    expect(store.ungespeichert()).toBe(true);
    expect(workbook.ziel()).toBeNull();
    expect(workbook.beschaeftigt()).toBe(false);
  });

  it('hält nach abgelehntem Reload auch einen bereits aktualisierten Storage-ETag vom Schreiben zurück', async () => {
    const quelle = testQuelle();
    await workbook.laden(quelle);
    const antwort = verzoegert<WorkbookInhalt>();
    quelle.laden.mockReturnValueOnce(antwort.ergebnis);

    const neuLaden = workbook.neuLaden();
    store.setzeTitel('Lokale Bearbeitung während Reload');
    antwort.freigeben({
      daten: schreibeArbeitsmappe(einJahrArbeitsmappe(testDokument('Neuer Serverstand'))),
      dateiname: 'Fiktive_Arbeitsmappe.xlsx',
    });
    await expect(neuLaden).rejects.toThrow('während des Ladens geändert');
    await expect(workbook.speichern()).rejects.toThrow('nicht vollständig übernommen');
    expect(quelle.speichern).not.toHaveBeenCalled();
    expect(workbook.ziel()).toBe(quelle);

    await workbook.neuLaden();
    await workbook.speichern();
    expect(quelle.speichern).toHaveBeenCalledOnce();
  });

  it('lässt konkurrierende Lese- und Schreibaufträge nicht ineinandergreifen', async () => {
    const quelle = testQuelle();
    const zweiteQuelle = testQuelle();
    const antwort = verzoegert<WorkbookInhalt>();
    quelle.laden.mockReturnValue(antwort.ergebnis);

    const laden = workbook.laden(quelle);
    await expect(workbook.laden(zweiteQuelle)).rejects.toThrow('bereits geladen oder gespeichert');
    await expect(workbook.speichernIn(zweiteQuelle)).rejects.toThrow(
      'bereits geladen oder gespeichert',
    );
    expect(zweiteQuelle.laden).not.toHaveBeenCalled();
    expect(zweiteQuelle.speichern).not.toHaveBeenCalled();
    expect(workbook.beschaeftigt()).toBe(true);
    antwort.freigeben({
      daten: schreibeArbeitsmappe(einJahrArbeitsmappe(testDokument())),
      dateiname: 'Test.xlsx',
    });
    await laden;
    expect(workbook.beschaeftigt()).toBe(false);
  });

  it('übernimmt nach Beginn eines neuen Plans keine frühere Ladeantwort', async () => {
    const quelle = testQuelle();
    const antwort = verzoegert<WorkbookInhalt>();
    quelle.laden.mockReturnValue(antwort.ergebnis);
    const laden = workbook.laden(quelle);

    workbook.neuesDokument(testDokument('Gewählter neuer Plan'));
    antwort.freigeben({
      daten: schreibeArbeitsmappe(einJahrArbeitsmappe(testDokument('Alter Plan'))),
      dateiname: 'Alt.xlsx',
    });

    await expect(laden).rejects.toThrow('während des Ladens geändert');
    expect(store.dokument().titel).toBe('Gewählter neuer Plan');
    expect(workbook.ziel()).toBeNull();
  });

  it('liefert auch beim Download den ursprünglichen Stand und Dateinamen zusammen', async () => {
    const quelle = testQuelle();
    await workbook.laden(quelle);
    store.setzeTitel('Exportierter Stand');
    const exportieren = workbook.exportieren();
    workbook.neuesDokument(testDokument('Neuer Plan nach Exportstart'));
    store.setzeTitel('Noch nicht gesicherte Änderung');

    const { daten, dateiname, stand } = await exportieren;
    store.alsGespeichertMarkieren(stand);

    expect(leseTestDokument(daten).titel).toBe('Exportierter Stand');
    expect(dateiname).toBe('Fiktive_Arbeitsmappe.xlsx');
    expect(store.ungespeichert()).toBe(true);
  });
});
