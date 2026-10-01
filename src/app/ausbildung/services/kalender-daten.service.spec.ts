import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerFehler } from '../../kern/worker-client';
import { Jahresblatt, leererTermin } from '../models/plan.model';
import { ApiKalenderStorage } from '../storage/api-kalender-storage';
import { KalenderKonfliktFehler, KalenderStand } from '../storage/kalender-storage';
import { DiensttagService } from './diensttag.service';
import { KalenderDatenService } from './kalender-daten.service';
import { PlanStore } from './plan-store';

/** Ein Jahr, dessen Diensttage bereits belegt sind – das Laden ergänzt dann nichts. */
function blatt(jahr: number, thema = 'Erfundenes Thema'): Jahresblatt {
  return {
    jahr,
    titel: `Jahresplan ${jahr}`,
    termine: [{ ...leererTermin(`${jahr}-03-02`), id: `t-${jahr}`, thema }],
    ideen: [{ ...leererTermin(null), id: `idee-${jahr}`, thema: 'Idee' }],
    katsThemen: [
      { id: `k-${jahr}`, nummer: '1.1', titel: `Thema ${jahr}`, beschreibung: '', pflicht: true },
    ],
  };
}

function stand(...jahre: number[]): KalenderStand {
  return {
    jahre: jahre.map((jahr) => ({ blatt: blatt(jahr), version: '"1"' })),
  };
}

function verzoegert<T>() {
  let freigeben!: (wert: T) => void;
  const ergebnis = new Promise<T>((resolve) => {
    freigeben = resolve;
  });
  return { ergebnis, freigeben };
}

describe('KalenderDatenService', () => {
  const storage = {
    laden: vi.fn<ApiKalenderStorage['laden']>(),
    speichereJahr: vi.fn<ApiKalenderStorage['speichereJahr']>(),
    migriere: vi.fn<ApiKalenderStorage['migriere']>(),
  };
  let dienst: KalenderDatenService;
  let store: PlanStore;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiKalenderStorage, useValue: storage },
        // Ein Diensttag ohne Wirkung auf die Testdaten: nur ergänzen, was fehlt.
        { provide: DiensttagService, useValue: { wochentag: () => 'Mo' } },
      ],
    });
    store = TestBed.inject(PlanStore);
    dienst = TestBed.inject(KalenderDatenService);
  });

  async function geladen(kalender: KalenderStand): Promise<void> {
    storage.laden.mockResolvedValue(kalender);
    await dienst.laden();
    // Das ergänzte Diensttagsgerüst einmal speichern, damit jeder Test von einem
    // gesicherten Stand ausgeht.
    storage.speichereJahr.mockResolvedValue('"2"');
    await dienst.speichern();
    vi.clearAllMocks();
  }

  it('meldet eine nicht eingerichtete Datenbank, statt einen Fehler vorzutäuschen', async () => {
    storage.laden.mockRejectedValue(new WorkerFehler('nicht eingerichtet', 503));
    await expect(dienst.laden()).rejects.toThrow();
    expect(dienst.zustand()).toBe('nicht-eingerichtet');
  });

  it('meldet andere Abruffehler mit Text', async () => {
    storage.laden.mockRejectedValue(new WorkerFehler('Server nicht erreichbar', 502));
    await expect(dienst.laden()).rejects.toThrow();
    expect(dienst.zustand()).toBe('fehler');
    expect(dienst.fehler()).toBe('Server nicht erreichbar');
  });

  it('erkennt einen leeren Kalender und legt dann kein Diensttagsgerüst an', async () => {
    storage.laden.mockResolvedValue({ jahre: [] });
    await dienst.laden();
    expect(dienst.istLeer()).toBe(true);
    expect(store.hatDaten()).toBe(false);
    expect(store.ungespeichert()).toBe(false);
  });

  it('öffnet das laufende Jahr, sofern vorhanden, sonst das jüngste', async () => {
    const laufend = new Date().getFullYear();
    storage.laden.mockResolvedValue(stand(laufend - 1, laufend, laufend + 1));
    await dienst.laden();
    expect(store.jahr()).toBe(laufend);
    expect(dienst.verfuegbareJahre()).toEqual([laufend - 1, laufend, laufend + 1]);
    expect(store.backlog().map((t) => t.id)).toEqual([`idee-${laufend}`]);
  });

  it('schreibt nichts, wenn sich nichts geändert hat', async () => {
    await geladen(stand(2026));
    const ergebnis = await dienst.speichern();
    expect(ergebnis.geschrieben).toBe(0);
    expect(storage.speichereJahr).not.toHaveBeenCalled();
  });

  it('schreibt nur das geänderte Jahr mit seiner Version', async () => {
    await geladen(stand(2026));
    store.aktualisiereTermin('t-2026', { thema: 'Geändert' });
    storage.speichereJahr.mockResolvedValue('"3"');

    const ergebnis = await dienst.speichern();

    expect(ergebnis.geschrieben).toBe(1);
    expect(storage.speichereJahr).toHaveBeenCalledTimes(1);
    expect(storage.speichereJahr.mock.calls[0]![1]).toBe('"2"');
    expect(store.ungespeichert()).toBe(false);
  });

  it('schreibt geänderte Ideen mit ihrem Jahr und dessen Version', async () => {
    await geladen(stand(2026));
    store.neueIdee();
    storage.speichereJahr.mockResolvedValue('"5"');

    await dienst.speichern();

    expect(storage.speichereJahr).toHaveBeenCalledTimes(1);
    expect(storage.speichereJahr.mock.calls[0]![0].ideen).toHaveLength(2);
    expect(storage.speichereJahr.mock.calls[0]![1]).toBe('"2"');
  });

  it('führt je Jahr eine eigene Ideensammlung', async () => {
    await geladen(stand(2025, 2026));
    dienst.waehleJahr(2025);
    expect(store.backlog().map((t) => t.id)).toEqual(['idee-2025']);
    dienst.waehleJahr(2026);
    expect(store.backlog().map((t) => t.id)).toEqual(['idee-2026']);
  });

  it('beginnt ein neues Jahr mit leerer Ideensammlung und leerem KatS-Plan', async () => {
    await geladen(stand(2026));
    dienst.neuesJahr(2027);
    expect(store.backlog()).toEqual([]);
    expect(store.katsThemen()).toEqual([]);
  });

  it('übernimmt Ideen und Themen ins Zieljahr, rückgängig machbar und ungespeichert', async () => {
    await geladen(stand(2025, 2026));
    const quelle = dienst.blatt(2025)!;

    dienst.uebernehmeInJahr(2026, quelle.ideen, quelle.katsThemen);

    expect(store.jahr()).toBe(2026);
    expect(store.backlog().map((t) => t.id)).toEqual(['idee-2026', 'idee-2025']);
    expect(store.katsThemen().map((t) => t.id)).toEqual(['k-2026', 'k-2025']);
    expect(store.ungespeichert()).toBe(true);
    expect(dienst.blatt(2025)).toEqual(quelle);

    store.rueckgaengig();
    expect(store.backlog().map((t) => t.id)).toEqual(['idee-2026']);
  });

  it('übernimmt in ein nicht aktives, ungespeichertes Jahr und speichert es mit', async () => {
    await geladen(stand(2025, 2026));
    dienst.waehleJahr(2026);
    const quelle = dienst.blatt(2026)!;
    dienst.neuesJahr(2027);
    dienst.waehleJahr(2026);

    dienst.uebernehmeInJahr(2027, quelle.ideen, []);
    dienst.waehleJahr(2026);
    storage.speichereJahr.mockResolvedValue('"1"');
    await dienst.speichern();

    const gespeichert = storage.speichereJahr.mock.calls.find(([b]) => b.jahr === 2027)!;
    expect(gespeichert[0].ideen.map((t) => t.id)).toEqual(['idee-2026']);
  });

  it('lehnt eine Übernahme in ein unbekanntes Jahr ab', async () => {
    await geladen(stand(2026));
    expect(() => dienst.uebernehmeInJahr(2031, [], [])).toThrow(/nicht angelegt/);
  });

  it('legt ein neues Jahr mit If-None-Match an (Version null) und behält das bisherige', async () => {
    await geladen(stand(2026));
    dienst.neuesJahr(2027);
    expect(store.jahr()).toBe(2027);
    expect(dienst.verfuegbareJahre()).toEqual([2026, 2027]);
    storage.speichereJahr.mockResolvedValue('"1"');

    await dienst.speichern();

    expect(storage.speichereJahr).toHaveBeenCalledTimes(1);
    expect(storage.speichereJahr.mock.calls[0]![0].jahr).toBe(2027);
    expect(storage.speichereJahr.mock.calls[0]![1]).toBeNull();
  });

  it('merkt sich Änderungen eines Jahres beim Wechsel und speichert sie später mit', async () => {
    await geladen(stand(2025, 2026));
    dienst.waehleJahr(2025);
    store.aktualisiereTermin('t-2025', { thema: 'Geändert 2025' });
    dienst.waehleJahr(2026);
    expect(store.ungespeichert()).toBe(true);
    storage.speichereJahr.mockResolvedValue('"3"');

    await dienst.speichern();

    expect(storage.speichereJahr).toHaveBeenCalledTimes(1);
    expect(storage.speichereJahr.mock.calls[0]![0].termine[0]!.thema).toBe('Geändert 2025');
  });

  it('markiert bei einem Konflikt nichts als gespeichert und wiederholt nicht', async () => {
    await geladen(stand(2026));
    store.aktualisiereTermin('t-2026', { thema: 'Geändert' });
    storage.speichereJahr.mockRejectedValue(new KalenderKonfliktFehler('Das Jahr 2026'));

    await expect(dienst.speichern()).rejects.toBeInstanceOf(KalenderKonfliktFehler);

    expect(storage.speichereJahr).toHaveBeenCalledTimes(1);
    expect(store.ungespeichert()).toBe(true);
    expect(dienst.beschaeftigt()).toBe(false);
  });

  it('quittiert keine Bearbeitung, die während des Speicherns hinzukam', async () => {
    await geladen(stand(2026));
    store.aktualisiereTermin('t-2026', { thema: 'Erste Änderung' });
    const schreiben = verzoegert<string>();
    storage.speichereJahr.mockReturnValue(schreiben.ergebnis);

    const speichern = dienst.speichern();
    store.aktualisiereTermin('t-2026', { thema: 'Zweite Änderung' });
    schreiben.freigeben('"3"');
    await speichern;

    expect(store.ungespeichert()).toBe(true);
  });

  it('überschreibt keine Bearbeitung mit einer verspäteten Ladeantwort', async () => {
    const laden = verzoegert<KalenderStand>();
    storage.laden.mockReturnValue(laden.ergebnis);
    const vorgang = dienst.laden();
    store.neueIdee();
    const bearbeitet = store.dokument();
    laden.freigeben(stand(2026));

    await expect(vorgang).rejects.toThrow(/während des Ladens geändert/);
    expect(store.dokument()).toBe(bearbeitet);
  });

  it('lässt Laden und Speichern nicht ineinandergreifen', async () => {
    await geladen(stand(2026));
    const laden = verzoegert<KalenderStand>();
    storage.laden.mockReturnValue(laden.ergebnis);
    const vorgang = dienst.laden();

    await expect(dienst.speichern()).rejects.toThrow(/bereits geladen oder gespeichert/);

    laden.freigeben(stand(2026));
    await vorgang;
  });

  it('speichert nicht ohne verbundene Datenbank', async () => {
    await expect(dienst.speichern()).rejects.toThrow(/nicht verbunden/);
    expect(storage.speichereJahr).not.toHaveBeenCalled();
  });

  it('liefert für die Excel-Kopie alle Jahre samt aktuellem Stand', async () => {
    await geladen(stand(2025, 2026));
    store.aktualisiereTermin('t-2026', { thema: 'Ungespeichert' });
    const mappe = dienst.arbeitsmappe();
    expect(mappe.jahre.map((j) => j.jahr)).toEqual([2025, 2026]);
    expect(mappe.jahre[1]!.termine.find((t) => t.id === 't-2026')?.thema).toBe('Ungespeichert');
    expect(mappe.jahre.map((j) => j.ideen.map((t) => t.id))).toEqual([
      ['idee-2025'],
      ['idee-2026'],
    ]);
  });
});
