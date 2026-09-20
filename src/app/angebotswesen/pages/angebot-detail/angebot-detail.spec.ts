import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { AngebotDetail } from './angebot-detail';
import { AngebotStoreService } from '../../services/angebot-store.service';
import { PreiskatalogStoreService } from '../../services/preiskatalog-store.service';
import { TabellenZwischenablageService } from '../../services/tabellen-zwischenablage';
import {
  erzeugeTestAngebot,
  erzeugeTestPosition,
  erzeugeTestSchicht,
} from '../../testing/angebot-testdaten';

function route(id: string): ActivatedRoute {
  const paramMap = convertToParamMap({ id });
  return { paramMap: of(paramMap), snapshot: { paramMap } } as unknown as ActivatedRoute;
}

function preiskatalogStoreMock() {
  return { laden: vi.fn().mockResolvedValue(undefined), eintraege: () => [] };
}

function erzeugeDetail(providers: unknown[]): AngebotDetail {
  TestBed.configureTestingModule({
    providers: [
      { provide: PreiskatalogStoreService, useValue: preiskatalogStoreMock() },
      {
        provide: DialogDienst,
        useValue: { bestaetigen: vi.fn().mockResolvedValue(true), hinweis: vi.fn() },
      },
      {
        provide: TabellenZwischenablageService,
        useValue: { kopieren: vi.fn().mockResolvedValue(true) },
      },
      ...providers,
    ],
  });
  const detail = TestBed.runInInjectionContext(() => new AngebotDetail());
  TestBed.tick();
  return detail;
}

describe('AngebotDetail', () => {
  it('beginnt bei der Route "neu" ein neues Angebot', () => {
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => null,
      speichertGerade: () => false,
      istNeu: () => true,
    };
    erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
    ]);
    expect(store.neuesAngebotBeginnen).toHaveBeenCalledOnce();
  });

  it('lädt ein bestehendes Angebot anhand der Routen-Id', () => {
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => null,
      geladen: () => null,
      speichertGerade: () => false,
      istNeu: () => true,
    };
    erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('abc-123') },
    ]);
    expect(store.angebotLaden).toHaveBeenCalledWith('abc-123');
  });

  it('lädt nicht erneut, wenn das angeforderte Angebot bereits geladen ist', () => {
    const angebot = erzeugeTestAngebot({ id: 'abc-123' });
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => angebot,
      geladen: () => ({ daten: angebot, version: '"1"' }),
      speichertGerade: () => false,
      istNeu: () => false,
    };
    erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('abc-123') },
    ]);
    expect(store.angebotLaden).not.toHaveBeenCalled();
  });

  it('fügt eine neue Schicht mit heutigem Datum hinzu', () => {
    const angebot = erzeugeTestAngebot({ schichten: [] });
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => angebot,
      schichtenAktualisieren: vi.fn(),
      speichertGerade: () => false,
      istNeu: () => true,
    };
    const detail = erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
    ]);
    detail.schichtHinzufuegen();
    expect(store.schichtenAktualisieren).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ positionen: [] })]),
    );
  });

  it('ersetzt eine geänderte Schicht in der Liste', () => {
    const schicht = erzeugeTestSchicht({ id: 's-1' });
    const angebot = erzeugeTestAngebot({ schichten: [schicht] });
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => angebot,
      schichtenAktualisieren: vi.fn(),
      speichertGerade: () => false,
      istNeu: () => true,
    };
    const detail = erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
    ]);
    const geaendert = { ...schicht, von: '09:00' };
    detail.schichtAktualisieren(geaendert);
    expect(store.schichtenAktualisieren).toHaveBeenCalledWith([geaendert]);
  });

  it('fügt beim Duplizieren eine Kopie mit neuen Ids direkt nach dem Original ein', () => {
    const original = erzeugeTestSchicht({
      id: 's-1',
      positionen: [erzeugeTestPosition({ id: 'p-1' })],
    });
    const andere = erzeugeTestSchicht({ id: 's-2' });
    const angebot = erzeugeTestAngebot({ schichten: [original, andere] });
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => angebot,
      schichtenAktualisieren: vi.fn(),
      speichertGerade: () => false,
      istNeu: () => true,
    };
    const detail = erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
    ]);
    detail.schichtDuplizieren(original);
    const neueListe = store.schichtenAktualisieren.mock.calls[0][0] as typeof angebot.schichten;
    expect(neueListe).toHaveLength(3);
    expect(neueListe[0].id).toBe('s-1');
    expect(neueListe[1].id).not.toBe('s-1');
    expect(neueListe[1].positionen[0].id).not.toBe('p-1');
    expect(neueListe[1].positionen[0].bezeichnung).toBe(original.positionen[0].bezeichnung);
    expect(neueListe[2].id).toBe('s-2');
  });

  it('setzt beim Aktivieren des Pauschalpreises einen Standardwert von 0', () => {
    const angebot = erzeugeTestAngebot({ pauschalpreisAktiv: false, pauschalpreisCent: null });
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => angebot,
      entwurfAktualisieren: vi.fn(),
      speichertGerade: () => false,
      istNeu: () => true,
    };
    const detail = erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
    ]);
    detail.pauschalpreisAktivAktualisieren(true);
    expect(store.entwurfAktualisieren).toHaveBeenCalledWith({
      pauschalpreisAktiv: true,
      pauschalpreisCent: 0,
    });
  });

  it('setzt beim Aktivieren der Materialpauschale einen Standardwert von 0', () => {
    const angebot = erzeugeTestAngebot({
      materialpauschaleAktiv: false,
      materialpauschaleCent: null,
    });
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => angebot,
      entwurfAktualisieren: vi.fn(),
      speichertGerade: () => false,
      istNeu: () => true,
    };
    const detail = erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
    ]);
    detail.materialpauschaleAktivAktualisieren(true);
    expect(store.entwurfAktualisieren).toHaveBeenCalledWith({
      materialpauschaleAktiv: true,
      materialpauschaleCent: 0,
    });
  });

  it('kopiert die Kalkulationstabelle über den Zwischenablage-Dienst', async () => {
    const angebot = erzeugeTestAngebot();
    const store = {
      neuesAngebotBeginnen: vi.fn(),
      angebotLaden: vi.fn(),
      entwurf: () => angebot,
      speichertGerade: () => false,
      istNeu: () => true,
    };
    const zwischenablage = { kopieren: vi.fn().mockResolvedValue(true) };
    const detail = erzeugeDetail([
      { provide: AngebotStoreService, useValue: store },
      { provide: ActivatedRoute, useValue: route('neu') },
      { provide: TabellenZwischenablageService, useValue: zwischenablage },
    ]);
    await detail.tabelleKopieren();
    expect(zwischenablage.kopieren).toHaveBeenCalledOnce();
  });
});
