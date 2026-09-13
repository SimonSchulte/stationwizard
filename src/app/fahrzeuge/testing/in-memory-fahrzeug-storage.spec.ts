import { describe, expect, it } from 'vitest';
import { InMemoryFahrzeugStorage } from './in-memory-fahrzeug-storage';
import { AblesungHatKorrekturFehler, FahrzeugKonfliktFehler } from '../storage/fahrzeug-storage';
import { erzeugeTestfahrzeug } from './fahrzeug-testdaten';

describe('InMemoryFahrzeugStorage', () => {
  it('legt ein neues Fahrzeug nur mit version=null an', async () => {
    const storage = new InMemoryFahrzeugStorage();
    const fahrzeug = erzeugeTestfahrzeug();
    const version = await storage.speichereFahrzeug(fahrzeug, null);
    expect(version).toBeTruthy();
    expect(await storage.ladeFahrzeug(fahrzeug.id)).toEqual({ daten: fahrzeug, version });
  });

  it('lehnt eine Neuanlage ab, wenn die id bereits existiert', async () => {
    const storage = new InMemoryFahrzeugStorage();
    const fahrzeug = erzeugeTestfahrzeug();
    await storage.speichereFahrzeug(fahrzeug, null);
    await expect(storage.speichereFahrzeug(fahrzeug, null)).rejects.toBeInstanceOf(
      FahrzeugKonfliktFehler,
    );
  });

  it('lehnt ein Update mit veralteter Version ab (Konflikt)', async () => {
    const storage = new InMemoryFahrzeugStorage();
    const fahrzeug = erzeugeTestfahrzeug();
    const version1 = await storage.speichereFahrzeug(fahrzeug, null);
    await storage.speichereFahrzeug({ ...fahrzeug, bemerkung: 'geändert' }, version1);
    await expect(
      storage.speichereFahrzeug({ ...fahrzeug, bemerkung: 'zu spät' }, version1),
    ).rejects.toBeInstanceOf(FahrzeugKonfliktFehler);
  });

  it('setzt erfasstVon und erfasstAm serverseitig, unabhängig von der Eingabe', async () => {
    const storage = new InMemoryFahrzeugStorage(() => 'geprueft@example.invalid');
    const ablesung = await storage.ergaenzeAblesung({
      fahrzeugId: 'f1',
      abgelesenAm: '2026-06-01',
      stand: 1000,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    expect(ablesung.erfasstVon).toBe('geprueft@example.invalid');
    expect(ablesung.erfasstAm).toBeTruthy();
  });

  it('filtert Ablesungen ab einem Jahr', async () => {
    const storage = new InMemoryFahrzeugStorage();
    await storage.ergaenzeAblesung({
      fahrzeugId: 'f1',
      abgelesenAm: '2025-06-01',
      stand: 500,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    await storage.ergaenzeAblesung({
      fahrzeugId: 'f1',
      abgelesenAm: '2026-06-01',
      stand: 1000,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    const ab2026 = await storage.ladeAblesungen('f1', 2026);
    expect(ab2026).toHaveLength(1);
    expect(ab2026[0].abgelesenAm).toBe('2026-06-01');
  });

  it('löscht eine Ablesung ohne Korrektur', async () => {
    const storage = new InMemoryFahrzeugStorage();
    const ablesung = await storage.ergaenzeAblesung({
      fahrzeugId: 'f1',
      abgelesenAm: '2026-06-01',
      stand: 1000,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    await storage.loescheAblesung('f1', ablesung.id);
    expect(await storage.ladeAblesungen('f1')).toHaveLength(0);
  });

  it('lehnt das Löschen einer bereits korrigierten Ablesung ab', async () => {
    const storage = new InMemoryFahrzeugStorage();
    const original = await storage.ergaenzeAblesung({
      fahrzeugId: 'f1',
      abgelesenAm: '2026-06-01',
      stand: 1000,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    await storage.ergaenzeAblesung({
      fahrzeugId: 'f1',
      abgelesenAm: '2026-06-01',
      stand: 1050,
      quelle: 'korrektur',
      korrigiert: original.id,
      bemerkung: '',
    });
    await expect(storage.loescheAblesung('f1', original.id)).rejects.toBeInstanceOf(
      AblesungHatKorrekturFehler,
    );
    expect(await storage.ladeAblesungen('f1')).toHaveLength(2);
  });
});

describe('InMemoryFahrzeugStorage – Änderungsprotokoll', () => {
  it('protokolliert die Anlage und Änderungen an Stammdaten, neueste zuerst', async () => {
    const storage = new InMemoryFahrzeugStorage(() => 'geprueft@example.invalid');
    const fahrzeug = erzeugeTestfahrzeug({ bezeichnung: 'MTW A', eigentuemer: 'organisation' });
    const version = await storage.speichereFahrzeug(fahrzeug, null);
    await storage.speichereFahrzeug(
      { ...fahrzeug, bezeichnung: 'MTW B', eigentuemer: 'bund' },
      version,
    );
    const eintraege = await storage.ladeAenderungen(fahrzeug.id);
    expect(eintraege).toHaveLength(2);
    expect(eintraege[0].von).toBe('geprueft@example.invalid');
    expect(eintraege[0].beschreibung).toContain('Bezeichnung geändert: MTW A → MTW B');
    expect(eintraege[0].beschreibung).toContain('Eigentümer geändert: Organisation → Bund');
    expect(eintraege[1].beschreibung).toBe('Fahrzeug angelegt');
  });

  it('protokolliert keinen zusätzlichen Eintrag ohne echte Änderung', async () => {
    const storage = new InMemoryFahrzeugStorage();
    const fahrzeug = erzeugeTestfahrzeug();
    const version = await storage.speichereFahrzeug(fahrzeug, null);
    await storage.speichereFahrzeug(fahrzeug, version);
    expect(await storage.ladeAenderungen(fahrzeug.id)).toHaveLength(1);
  });

  it('protokolliert eine erfasste und eine gelöschte Ablesung', async () => {
    const storage = new InMemoryFahrzeugStorage();
    const ablesung = await storage.ergaenzeAblesung({
      fahrzeugId: 'f1',
      abgelesenAm: '2026-06-01',
      stand: 1000,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    await storage.loescheAblesung('f1', ablesung.id);
    const beschreibungen = (await storage.ladeAenderungen('f1')).map((a) => a.beschreibung);
    expect(beschreibungen).toContain('Kilometerstand erfasst: 1000 km am 2026-06-01');
    expect(beschreibungen).toContain('Kilometerstand gelöscht: 1000 km vom 2026-06-01');
  });
});
