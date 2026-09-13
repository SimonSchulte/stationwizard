import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erzeugeTestfahrzeug } from '../testing/fahrzeug-testdaten';
import { ApiFahrzeugStorage } from '../storage/api-fahrzeug-storage';
import { FahrzeugKonfliktFehler } from '../storage/fahrzeug-storage';
import { FahrzeugStoreService } from './fahrzeug-store.service';

describe('FahrzeugStoreService', () => {
  const storage = {
    ladeFahrzeuge: vi.fn(),
    ladeFahrzeug: vi.fn(),
    speichereFahrzeug: vi.fn(),
    ladeAblesungen: vi.fn(),
    ergaenzeAblesung: vi.fn(),
  };
  let service: FahrzeugStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiFahrzeugStorage, useValue: storage }],
    });
    service = TestBed.inject(FahrzeugStoreService);
  });

  it('lädt die Liste und meldet Fehler statt zu werfen', async () => {
    storage.ladeFahrzeuge.mockResolvedValue([erzeugeTestfahrzeug()]);
    await service.listeLaden();
    expect(service.fahrzeuge()).toHaveLength(1);
    expect(service.listeFehler()).toBe('');

    storage.ladeFahrzeuge.mockRejectedValue(new Error('kaputt'));
    await service.listeLaden();
    expect(service.listeFehler()).toBe('kaputt');
  });

  it('beginnt ein neues Fahrzeug als sofort ungesichert', () => {
    service.neuesFahrzeugBeginnen();
    expect(service.istNeu()).toBe(true);
    expect(service.hatUngesicherteAenderungen()).toBe(true);
  });

  it('meldet ein frisch geladenes Fahrzeug als gesichert, eine Änderung als ungesichert', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    storage.ladeFahrzeug.mockResolvedValue({ daten: fahrzeug, version: '"1"' });
    await service.fahrzeugLaden(fahrzeug.id);
    expect(service.hatUngesicherteAenderungen()).toBe(false);

    service.entwurfAktualisieren({ bemerkung: 'geändert' });
    expect(service.hatUngesicherteAenderungen()).toBe(true);
  });

  it('setzt einen Ladefehler, wenn das Fahrzeug nicht existiert', async () => {
    storage.ladeFahrzeug.mockResolvedValue(null);
    await service.fahrzeugLaden('unbekannt');
    expect(service.ladeFehler()).toBe('Fahrzeug nicht gefunden.');
    expect(service.entwurf()).toBeNull();
  });

  it('lehnt das Speichern ohne Bezeichnung oder Kennzeichen ab, ohne den Server zu kontaktieren', async () => {
    service.neuesFahrzeugBeginnen();
    service.entwurfAktualisieren({ bezeichnung: '', kennzeichen: '' });
    const erfolg = await service.speichern();
    expect(erfolg).toBe(false);
    expect(service.speicherFehler()).toContain('erforderlich');
    expect(storage.speichereFahrzeug).not.toHaveBeenCalled();
  });

  it('speichert erfolgreich, lädt neu und aktualisiert die Liste', async () => {
    const fahrzeug = erzeugeTestfahrzeug({ bezeichnung: 'MTW 2', kennzeichen: 'XY-TE 2' });
    storage.speichereFahrzeug.mockResolvedValue('"1"');
    storage.ladeFahrzeug.mockResolvedValue({ daten: fahrzeug, version: '"1"' });
    service.neuesFahrzeugBeginnen();
    service.entwurfAktualisieren(fahrzeug);
    const erfolg = await service.speichern();
    expect(erfolg).toBe(true);
    expect(service.hatUngesicherteAenderungen()).toBe(false);
    expect(service.fahrzeuge()).toContainEqual(fahrzeug);
    expect(storage.speichereFahrzeug).toHaveBeenCalledWith(expect.objectContaining(fahrzeug), null);
  });

  it('hält den Entwurf bei einem Konflikt unverändert und meldet ihn gesondert', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    storage.ladeFahrzeug.mockResolvedValue({ daten: fahrzeug, version: '"1"' });
    await service.fahrzeugLaden(fahrzeug.id);
    service.entwurfAktualisieren({ bemerkung: 'lokal geändert' });
    storage.speichereFahrzeug.mockRejectedValue(new FahrzeugKonfliktFehler(fahrzeug.id));
    const erfolg = await service.speichern();
    expect(erfolg).toBe(false);
    expect(service.speicherKonflikt()).toBe(true);
    expect(service.entwurf()?.bemerkung).toBe('lokal geändert');
  });

  it('meldet ungesicherte Änderungen an VerlassenSchutz', async () => {
    service.neuesFahrzeugBeginnen();
    const { VerlassenSchutz } = await import('../../kern/verlassen-schutz');
    const verlassenSchutz = TestBed.inject(VerlassenSchutz);
    expect(verlassenSchutz.hatUngesicherteAenderungen()).toBe(true);
  });
});
