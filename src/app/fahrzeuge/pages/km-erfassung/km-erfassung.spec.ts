import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { KmErfassung } from './km-erfassung';
import { AblesungStoreService } from '../../services/ablesung-store.service';
import { ApiFahrzeugStorage } from '../../storage/api-fahrzeug-storage';
import { erzeugeTestablesung, erzeugeTestfahrzeug } from '../../testing/fahrzeug-testdaten';

function route(id: string, quelle: string | null = null): ActivatedRoute {
  return {
    snapshot: {
      paramMap: convertToParamMap({ id }),
      queryParamMap: convertToParamMap(quelle ? { quelle } : {}),
    },
  } as unknown as ActivatedRoute;
}

async function erzeuge(
  routeId: string,
  quelle: string | null,
  storageMock: Record<string, unknown>,
  ablesungMock: Record<string, unknown>,
): Promise<KmErfassung> {
  TestBed.configureTestingModule({
    providers: [
      { provide: ActivatedRoute, useValue: route(routeId, quelle) },
      { provide: ApiFahrzeugStorage, useValue: storageMock },
      { provide: AblesungStoreService, useValue: ablesungMock },
    ],
  });
  const komponente = TestBed.runInInjectionContext(() => new KmErfassung());
  await komponente.bereit;
  return komponente;
}

describe('KmErfassung', () => {
  it('lädt Fahrzeug und Ablesungen beim Start', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const storage = {
      ladeFahrzeug: vi.fn().mockResolvedValue({ daten: fahrzeug, version: '"1"' }),
    };
    const ablesung = { laden: vi.fn().mockResolvedValue(undefined), letzteAblesung: () => null };
    const komponente = await erzeuge(fahrzeug.id, null, storage, ablesung);
    expect(komponente.fahrzeug()).toEqual(fahrzeug);
    expect(ablesung.laden).toHaveBeenCalledWith(fahrzeug.id);
  });

  it('meldet ein nicht gefundenes Fahrzeug', async () => {
    const storage = { ladeFahrzeug: vi.fn().mockResolvedValue(null) };
    const ablesung = { laden: vi.fn().mockResolvedValue(undefined), letzteAblesung: () => null };
    const komponente = await erzeuge('unbekannt', null, storage, ablesung);
    expect(komponente.ladeFehler()).toBe('Fahrzeug nicht gefunden.');
  });

  it('setzt die Quelle je nach Herkunft der Route (qr vs. formular)', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const storage = {
      ladeFahrzeug: vi.fn().mockResolvedValue({ daten: fahrzeug, version: '"1"' }),
    };
    const erfassen = vi.fn().mockResolvedValue(true);
    const ablesung = {
      laden: vi.fn().mockResolvedValue(undefined),
      letzteAblesung: () => null,
      erfassen,
      erfassungsFehler: () => '',
      erfasstGerade: () => false,
    };
    const komponente = await erzeuge(fahrzeug.id, 'qr', storage, ablesung);
    komponente.stand.set('1234');
    await komponente.speichern();
    expect(erfassen).toHaveBeenCalledWith(expect.objectContaining({ quelle: 'qr', stand: 1234 }));
  });

  it('verwendet formular als Quelle ohne Query-Parameter', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const storage = {
      ladeFahrzeug: vi.fn().mockResolvedValue({ daten: fahrzeug, version: '"1"' }),
    };
    const erfassen = vi.fn().mockResolvedValue(true);
    const ablesung = {
      laden: vi.fn().mockResolvedValue(undefined),
      letzteAblesung: () => null,
      erfassen,
      erfassungsFehler: () => '',
      erfasstGerade: () => false,
    };
    const komponente = await erzeuge(fahrzeug.id, null, storage, ablesung);
    komponente.stand.set('500');
    await komponente.speichern();
    expect(erfassen).toHaveBeenCalledWith(expect.objectContaining({ quelle: 'formular' }));
  });

  it('lehnt eine leere oder ungültige Eingabe ohne Serverkontakt ab', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const storage = {
      ladeFahrzeug: vi.fn().mockResolvedValue({ daten: fahrzeug, version: '"1"' }),
    };
    const erfassen = vi.fn();
    const ablesung = {
      laden: vi.fn().mockResolvedValue(undefined),
      letzteAblesung: () => null,
      erfassen,
    };
    const komponente = await erzeuge(fahrzeug.id, null, storage, ablesung);
    komponente.stand.set('');
    await komponente.speichern();
    komponente.stand.set('-5');
    await komponente.speichern();
    expect(erfassen).not.toHaveBeenCalled();
  });

  it('warnt bei einem Tachorückschritt, blockiert das Speichern aber nicht', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const letzte = erzeugeTestablesung({ stand: 10_000 });
    const storage = {
      ladeFahrzeug: vi.fn().mockResolvedValue({ daten: fahrzeug, version: '"1"' }),
    };
    const ablesung = {
      laden: vi.fn().mockResolvedValue(undefined),
      letzteAblesung: () => letzte,
      erfassen: vi.fn().mockResolvedValue(true),
      erfassungsFehler: () => '',
      erfasstGerade: () => false,
    };
    const komponente = await erzeuge(fahrzeug.id, null, storage, ablesung);
    komponente.stand.set('9000');
    expect(komponente.hinweis()).toBe('rueckschritt');
    await komponente.speichern();
    expect(ablesung.erfassen).toHaveBeenCalledOnce();
  });

  it('setzt das Formular nach erfolgreicher Erfassung zurück und zeigt eine Bestätigung', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const storage = {
      ladeFahrzeug: vi.fn().mockResolvedValue({ daten: fahrzeug, version: '"1"' }),
    };
    const ablesung = {
      laden: vi.fn().mockResolvedValue(undefined),
      letzteAblesung: () => null,
      erfassen: vi.fn().mockResolvedValue(true),
      erfassungsFehler: () => '',
      erfasstGerade: () => false,
    };
    const komponente = await erzeuge(fahrzeug.id, null, storage, ablesung);
    komponente.stand.set('1000');
    komponente.bemerkung.set('Testnotiz');
    await komponente.speichern();
    expect(komponente.erfolgreichErfasst()).toBe(true);
    expect(komponente.stand()).toBe('');
    expect(komponente.bemerkung()).toBe('');

    komponente.weitereErfassung();
    expect(komponente.erfolgreichErfasst()).toBe(false);
  });
});
