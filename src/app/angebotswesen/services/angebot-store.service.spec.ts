import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erzeugeTestAngebot } from '../testing/angebot-testdaten';
import { ApiAngebotStorage } from '../storage/api-angebot-storage';
import { AngebotKonfliktFehler } from '../storage/angebot-storage';
import { AngebotStoreService } from './angebot-store.service';

describe('AngebotStoreService', () => {
  const storage = {
    ladeAngebote: vi.fn(),
    ladeAngebot: vi.fn(),
    speichereAngebot: vi.fn(),
    loescheAngebot: vi.fn(),
  };
  let service: AngebotStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiAngebotStorage, useValue: storage }],
    });
    service = TestBed.inject(AngebotStoreService);
  });

  it('lädt die Liste und meldet Fehler statt zu werfen', async () => {
    storage.ladeAngebote.mockResolvedValue([erzeugeTestAngebot()]);
    await service.listeLaden();
    expect(service.angebote()).toHaveLength(1);

    storage.ladeAngebote.mockRejectedValue(new Error('kaputt'));
    await service.listeLaden();
    expect(service.listeFehler()).toBe('kaputt');
  });

  it('beginnt ein neues Angebot als sofort ungesichert', () => {
    service.neuesAngebotBeginnen();
    expect(service.istNeu()).toBe(true);
    expect(service.hatUngesicherteAenderungen()).toBe(true);
  });

  it('meldet ein frisch geladenes Angebot als gesichert, eine Änderung als ungesichert', async () => {
    const angebot = erzeugeTestAngebot();
    storage.ladeAngebot.mockResolvedValue({ daten: angebot, version: '"1"' });
    await service.angebotLaden(angebot.id);
    expect(service.hatUngesicherteAenderungen()).toBe(false);

    service.entwurfAktualisieren({ bemerkung: 'geändert' });
    expect(service.hatUngesicherteAenderungen()).toBe(true);
  });

  it('setzt einen Ladefehler, wenn das Angebot nicht existiert', async () => {
    storage.ladeAngebot.mockResolvedValue(null);
    await service.angebotLaden('unbekannt');
    expect(service.ladeFehler()).toBe('Angebot nicht gefunden.');
    expect(service.entwurf()).toBeNull();
  });

  it('lehnt das Speichern ohne Bezeichnung ab, ohne den Server zu kontaktieren', async () => {
    service.neuesAngebotBeginnen();
    service.entwurfAktualisieren({ bezeichnung: '' });
    const erfolg = await service.speichern();
    expect(erfolg).toBe(false);
    expect(service.speicherFehler()).toContain('erforderlich');
    expect(storage.speichereAngebot).not.toHaveBeenCalled();
  });

  it('speichert erfolgreich, lädt neu und aktualisiert die Liste', async () => {
    const angebot = erzeugeTestAngebot({ bezeichnung: 'Stadtfest' });
    storage.speichereAngebot.mockResolvedValue('"1"');
    storage.ladeAngebot.mockResolvedValue({ daten: angebot, version: '"1"' });
    service.neuesAngebotBeginnen();
    service.entwurfAktualisieren(angebot);
    const erfolg = await service.speichern();
    expect(erfolg).toBe(true);
    expect(service.hatUngesicherteAenderungen()).toBe(false);
    expect(service.angebote()).toContainEqual(angebot);
  });

  it('hält den Entwurf bei einem Konflikt unverändert und meldet ihn gesondert', async () => {
    const angebot = erzeugeTestAngebot();
    storage.ladeAngebot.mockResolvedValue({ daten: angebot, version: '"1"' });
    await service.angebotLaden(angebot.id);
    service.entwurfAktualisieren({ bemerkung: 'lokal geändert' });
    storage.speichereAngebot.mockRejectedValue(new AngebotKonfliktFehler(angebot.id));
    const erfolg = await service.speichern();
    expect(erfolg).toBe(false);
    expect(service.speicherKonflikt()).toBe(true);
    expect(service.entwurf()?.bemerkung).toBe('lokal geändert');
  });

  it('meldet ungesicherte Änderungen an VerlassenSchutz', async () => {
    service.neuesAngebotBeginnen();
    const { VerlassenSchutz } = await import('../../kern/verlassen-schutz');
    const verlassenSchutz = TestBed.inject(VerlassenSchutz);
    expect(verlassenSchutz.hatUngesicherteAenderungen()).toBe(true);
  });
});
