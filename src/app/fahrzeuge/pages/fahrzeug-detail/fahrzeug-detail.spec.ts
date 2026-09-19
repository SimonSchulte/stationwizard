import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { FahrzeugDetail } from './fahrzeug-detail';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { ApiErfassungslinkStorage } from '../../storage/api-erfassungslink-storage';
import { FreigabeVerweigertFehler } from '../../storage/einreichung-storage';
import { AblesungStoreService } from '../../services/ablesung-store.service';
import { AenderungsprotokollStoreService } from '../../services/aenderungsprotokoll-store.service';
import {
  erzeugeTestablesung,
  erzeugeTestaenderung,
  erzeugeTestfahrzeug,
} from '../../testing/fahrzeug-testdaten';
import { FahrzeugDruckbogenService } from '../../services/fahrzeug-druckbogen.service';

function route(id: string): ActivatedRoute {
  const paramMap = convertToParamMap({ id });
  return { paramMap: of(paramMap), snapshot: { paramMap } } as unknown as ActivatedRoute;
}

function ablesungStoreMock(ueberschreibung: Record<string, unknown> = {}) {
  return {
    laden: vi.fn().mockResolvedValue(undefined),
    ablesungen: () => [],
    laedt: () => false,
    fehler: () => '',
    erfassen: vi.fn().mockResolvedValue(true),
    erfassungsFehler: () => '',
    erfasstGerade: () => false,
    loeschen: vi.fn().mockResolvedValue(true),
    loeschFehler: () => '',
    loeschtGerade: () => false,
    ...ueberschreibung,
  };
}

function aenderungsprotokollStoreMock(ueberschreibung: Record<string, unknown> = {}) {
  return {
    laden: vi.fn().mockResolvedValue(undefined),
    eintraege: () => [],
    laedt: () => false,
    fehler: () => '',
    ...ueberschreibung,
  };
}

const TEST_TOKEN = 'a'.repeat(32);

/** Das Erfassungstoken kommt über einen eigenen Endpunkt, nicht mit dem Fahrzeug. */
function erfassungslinkStorageMock(ueberschreibung: Record<string, unknown> = {}) {
  return {
    ladeLink: vi.fn(async (fahrzeugId: string) => ({ fahrzeugId, token: TEST_TOKEN })),
    erneuere: vi.fn(async (fahrzeugId: string) => ({ fahrzeugId, token: 'b'.repeat(32) })),
    ...ueberschreibung,
  };
}

/** Instanziiert die Komponente und lässt den Lade-Effekt im Konstruktor einmal laufen. */
function erzeugeDetail(providers: unknown[]): FahrzeugDetail {
  TestBed.configureTestingModule({
    providers: [
      { provide: AblesungStoreService, useValue: ablesungStoreMock() },
      { provide: AenderungsprotokollStoreService, useValue: aenderungsprotokollStoreMock() },
      { provide: ApiErfassungslinkStorage, useValue: erfassungslinkStorageMock() },
      ...providers,
    ],
  });
  const detail = TestBed.runInInjectionContext(() => new FahrzeugDetail());
  TestBed.tick();
  return detail;
}

describe('FahrzeugDetail', () => {
  it('beginnt bei der Route "neu" ein neues Fahrzeug', () => {
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => null,
      speichertGerade: () => false,
      istNeu: () => true,
    };
    erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
    ]);
    expect(store.neuesFahrzeugBeginnen).toHaveBeenCalledOnce();
    expect(store.fahrzeugLaden).not.toHaveBeenCalled();
  });

  it('lädt ein bestehendes Fahrzeug anhand der Routen-id', () => {
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => null,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('bestehende-id') },
    ]);
    expect(store.fahrzeugLaden).toHaveBeenCalledWith('bestehende-id');
    expect(store.neuesFahrzeugBeginnen).not.toHaveBeenCalled();
  });

  it('erkennt eine bereits offene Hauptuntersuchung und lässt weitere Termine zu', () => {
    const fahrzeug = erzeugeTestfahrzeug({
      wartungstermine: [
        {
          id: 'hu-1',
          art: 'hu',
          bezeichnung: 'Hauptuntersuchung',
          faelligAm: '2026-12-01',
          erinnerungTage: 30,
          erledigtAm: null,
        },
      ],
    });
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
      wartungstermineAktualisieren: vi.fn(),
    };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
    ]);
    expect(detail.hatOffeneHu()).toBe(true);

    detail.wartungHinzufuegen('frei');
    expect(store.wartungstermineAktualisieren).toHaveBeenCalledWith([
      fahrzeug.wartungstermine[0],
      expect.objectContaining({ art: 'frei', bezeichnung: '' }),
    ]);
  });

  it('navigiert nach erfolgreichem Speichern eines neuen Fahrzeugs zur Detailseite', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => true,
      speichern: vi.fn().mockResolvedValue(true),
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
      { provide: Router, useValue: router },
    ]);
    await detail.speichern();
    expect(router.navigate).toHaveBeenCalledWith(['/fahrzeuge', fahrzeug.id], { replaceUrl: true });
  });

  it('navigiert nicht, wenn ein bestehendes Fahrzeug gespeichert wird', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
      speichern: vi.fn().mockResolvedValue(true),
    };
    const router = { navigate: vi.fn() };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: Router, useValue: router },
    ]);
    await detail.speichern();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('lädt nach bestätigtem Konflikt den aktuellen Stand neu, sonst nicht', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
      neuLadenNachKonflikt: vi.fn(),
    };
    const dialog = { bestaetigen: vi.fn() };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: DialogDienst, useValue: dialog },
    ]);

    dialog.bestaetigen.mockResolvedValue(false);
    await detail.nachKonfliktNeuLaden();
    expect(store.neuLadenNachKonflikt).not.toHaveBeenCalled();

    dialog.bestaetigen.mockResolvedValue(true);
    await detail.nachKonfliktNeuLaden();
    expect(store.neuLadenNachKonflikt).toHaveBeenCalledWith(fahrzeug.id);
  });

  it('lädt die Ablesungen mit, sobald ein bestehendes Fahrzeug geöffnet wird', () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const ablesungStore = ablesungStoreMock();
    erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AblesungStoreService, useValue: ablesungStore },
    ]);
    expect(ablesungStore.laden).toHaveBeenCalledWith(fahrzeug.id);
  });

  it('lädt das Änderungsprotokoll mit, sobald ein bestehendes Fahrzeug geöffnet wird', () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const aenderungsprotokollStore = aenderungsprotokollStoreMock();
    erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AenderungsprotokollStoreService, useValue: aenderungsprotokollStore },
    ]);
    expect(aenderungsprotokollStore.laden).toHaveBeenCalledWith(fahrzeug.id);
  });

  it('teilt eine mehrzeilige Protokollbeschreibung in einzelne Zeilen auf', () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
    ]);
    const eintrag = erzeugeTestaenderung({ beschreibung: 'Zeile eins\nZeile zwei' });
    expect(detail.beschreibungZeilen(eintrag)).toEqual(['Zeile eins', 'Zeile zwei']);
  });

  it('berechnet keine Kilometerbilanz für ein neues, ungespeichertes Fahrzeug', () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => true,
    };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
    ]);
    expect(detail.jahresbilanz()).toBeNull();
  });

  it('berechnet die Kilometerbilanz für ein bestehendes Fahrzeug aus den geladenen Ablesungen', () => {
    const fahrzeug = erzeugeTestfahrzeug({ eigentuemer: 'bund' });
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const jahr = new Date().getFullYear();
    const ablesungStore = ablesungStoreMock({
      ablesungen: () => [
        erzeugeTestablesung({ abgelesenAm: `${jahr - 1}-12-31`, stand: 1000 }),
        erzeugeTestablesung({ abgelesenAm: `${jahr}-06-01`, stand: 1300 }),
      ],
    });
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AblesungStoreService, useValue: ablesungStore },
    ]);
    const bilanz = detail.jahresbilanz();
    expect(bilanz?.sollKm).toBe(600);
    expect(bilanz?.istKm).toBe(300);
    expect(bilanz?.unvollstaendig).toBe(false);
  });

  it('startet, speichert und bricht eine Korrektur korrekt ab', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const original = erzeugeTestablesung({ id: 'original', stand: 500, abgelesenAm: '2026-01-01' });
    const ablesungStore = ablesungStoreMock();
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AblesungStoreService, useValue: ablesungStore },
    ]);

    detail.korrekturBeginnen(original);
    expect(detail.korrigiertId()).toBe('original');
    expect(detail.korrekturStand()).toBe('500');

    detail.korrekturAbbrechen();
    expect(detail.korrigiertId()).toBeNull();

    detail.korrekturBeginnen(original);
    detail.korrekturStand.set('520');
    await detail.korrekturSpeichern();
    expect(ablesungStore.erfassen).toHaveBeenCalledWith(
      expect.objectContaining({
        fahrzeugId: fahrzeug.id,
        stand: 520,
        quelle: 'korrektur',
        korrigiert: 'original',
      }),
    );
    expect(detail.korrigiertId()).toBeNull();
  });

  it('löscht eine Ablesung erst nach Bestätigung des Dialogs', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const ablesung = erzeugeTestablesung({ id: 'a1' });
    const ablesungStore = ablesungStoreMock();
    const dialog = { bestaetigen: vi.fn() };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AblesungStoreService, useValue: ablesungStore },
      { provide: DialogDienst, useValue: dialog },
    ]);

    dialog.bestaetigen.mockResolvedValue(false);
    await detail.ablesungLoeschen(ablesung);
    expect(ablesungStore.loeschen).not.toHaveBeenCalled();

    dialog.bestaetigen.mockResolvedValue(true);
    await detail.ablesungLoeschen(ablesung);
    expect(ablesungStore.loeschen).toHaveBeenCalledWith(fahrzeug.id, 'a1');
  });

  it('erkennt eine Ablesung, auf die eine Korrektur verweist', () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const original = erzeugeTestablesung({ id: 'original' });
    const korrektur = erzeugeTestablesung({ id: 'korrektur', korrigiert: 'original' });
    const ablesungStore = ablesungStoreMock({ ablesungen: () => [original, korrektur] });
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AblesungStoreService, useValue: ablesungStore },
    ]);

    expect(detail.hatKorrektur(original)).toBe(true);
    expect(detail.hatKorrektur(korrektur)).toBe(false);
  });

  it('beginnt das Nachtragen mit dem 1.1. des laufenden Jahres, speichert und bricht ab', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const ablesungStore = ablesungStoreMock();
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AblesungStoreService, useValue: ablesungStore },
    ]);

    detail.nachtragBeginnen();
    expect(detail.nachtragOffen()).toBe(true);
    expect(detail.nachtragDatum()).toBe(`${new Date().getFullYear()}-01-01`);

    detail.nachtragAbbrechen();
    expect(detail.nachtragOffen()).toBe(false);

    detail.nachtragBeginnen();
    detail.nachtragStand.set('8000');
    detail.nachtragBemerkung.set('Jahresanfang nachgetragen');
    await detail.nachtragSpeichern();
    expect(ablesungStore.erfassen).toHaveBeenCalledWith(
      expect.objectContaining({
        fahrzeugId: fahrzeug.id,
        abgelesenAm: `${new Date().getFullYear()}-01-01`,
        stand: 8000,
        quelle: 'formular',
        korrigiert: null,
        bemerkung: 'Jahresanfang nachgetragen',
      }),
    );
    expect(detail.nachtragOffen()).toBe(false);
  });

  it('lässt das Nachtragen bei ungültigem Stand offen, statt fehlerhaft zu speichern', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const ablesungStore = ablesungStoreMock();
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AblesungStoreService, useValue: ablesungStore },
    ]);

    detail.nachtragBeginnen();
    detail.nachtragStand.set('abc');
    await detail.nachtragSpeichern();
    expect(ablesungStore.erfassen).not.toHaveBeenCalled();
    expect(detail.nachtragOffen()).toBe(true);
  });

  it('wandelt ein ISO-Datum für den Datepicker in ein lokales Date um und zurück', () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const ablesungStore = ablesungStoreMock();
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: AblesungStoreService, useValue: ablesungStore },
    ]);

    const datum = detail.alsDatum('2026-01-01');
    expect(datum?.getFullYear()).toBe(2026);
    expect(datum?.getMonth()).toBe(0);
    expect(datum?.getDate()).toBe(1);

    detail.nachtragDatumAktualisieren({ value: new Date(2026, 5, 15) } as never);
    expect(detail.nachtragDatum()).toBe('2026-06-15');
  });

  it('zeigt QR-Codes an, lädt sie aber nur einmal', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
    ]);
    expect(detail.qrCodes()).toBeNull();
    await detail.qrCodesAnzeigen();
    expect(detail.qrCodes()?.uebersicht).toMatch(/^data:image\/png;base64,/);
    expect(detail.qrCodes()?.km).toMatch(/^data:image\/png;base64,/);
    expect(detail.qrCodes()?.oeffentlich).toMatch(/^data:image\/png;base64,/);
  });

  it('erneuert das Erfassungstoken nur nach Bestätigung', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const linkStorage = erfassungslinkStorageMock();
    const dialog = { bestaetigen: vi.fn().mockResolvedValue(false) };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: ApiErfassungslinkStorage, useValue: linkStorage },
      { provide: DialogDienst, useValue: dialog },
    ]);

    await detail.qrErneuern();
    expect(dialog.bestaetigen).toHaveBeenCalled();
    expect(linkStorage.erneuere).not.toHaveBeenCalled();

    dialog.bestaetigen.mockResolvedValue(true);
    await detail.qrErneuern();
    expect(linkStorage.erneuere).toHaveBeenCalledWith(fahrzeug.id);
    expect(detail.qrCodes()?.oeffentlich).toMatch(/^data:image\/png;base64,/);
  });

  it('meldet eine verweigerte Erneuerung fachlich', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      {
        provide: ApiErfassungslinkStorage,
        useValue: erfassungslinkStorageMock({
          erneuere: vi.fn(async () => {
            throw new FreigabeVerweigertFehler('Nur die Zugführung darf das.');
          }),
        }),
      },
      { provide: DialogDienst, useValue: { bestaetigen: vi.fn().mockResolvedValue(true) } },
    ]);
    await detail.qrErneuern();
    expect(detail.qrErneuernFehler()).toBe('Nur die Zugführung darf das.');
  });

  it('lädt einen einzelnen QR-Code als SVG herunter', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
    ]);
    const erzeugteUrl = 'blob:mock-url';
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(erzeugteUrl);
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const klickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await detail.qrSvgHerunterladen('km');
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const blob = createObjectUrlSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('image/svg+xml');
    expect(klickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(erzeugteUrl);
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    klickSpy.mockRestore();
  });

  it('meldet einen Fehler, wenn der Druckbogen nicht erzeugt werden kann', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    const druckbogenService = {
      erzeugeUndSpeichere: vi.fn().mockRejectedValue(new Error('PDF fehlgeschlagen')),
    };
    const detail = erzeugeDetail([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      { provide: FahrzeugDruckbogenService, useValue: druckbogenService },
    ]);
    await detail.druckbogenHerunterladen();
    expect(detail.druckbogenFehler()).toBe('PDF fehlgeschlagen');
  });
});
