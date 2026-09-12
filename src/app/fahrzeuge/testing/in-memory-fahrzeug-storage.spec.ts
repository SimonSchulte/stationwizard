import { describe, expect, it } from 'vitest';
import { InMemoryFahrzeugStorage } from './in-memory-fahrzeug-storage';
import { FahrzeugKonfliktFehler } from '../storage/fahrzeug-storage';
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
});
