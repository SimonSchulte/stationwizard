import { describe, expect, it } from 'vitest';
import { VorlageInBenutzungFehler, VorlageKonfliktFehler } from '../storage/pruefvorlage-storage';
import { InMemoryPruefvorlageStorage } from './in-memory-pruefvorlage-storage';
import { erzeugeTestvorlage } from './material-testdaten';

describe('InMemoryPruefvorlageStorage', () => {
  it('legt eine Vorlage ohne Version an und vergibt Version 1', async () => {
    const storage = new InMemoryPruefvorlageStorage();
    expect(await storage.speichereVorlage(erzeugeTestvorlage(), null)).toBe('"1"');
  });

  it('weist ein zweites Anlegen derselben Kennung ab', async () => {
    const storage = new InMemoryPruefvorlageStorage();
    await storage.speichereVorlage(erzeugeTestvorlage(), null);
    await expect(storage.speichereVorlage(erzeugeTestvorlage(), null)).rejects.toBeInstanceOf(
      VorlageKonfliktFehler,
    );
  });

  it('weist einen veralteten Stand ab, statt ihn zu überschreiben', async () => {
    const storage = new InMemoryPruefvorlageStorage();
    const vorlage = erzeugeTestvorlage();
    await storage.speichereVorlage(vorlage, null);
    await storage.speichereVorlage({ ...vorlage, bezeichnung: 'Erst' }, '"1"');
    await expect(
      storage.speichereVorlage({ ...vorlage, bezeichnung: 'Dann' }, '"1"'),
    ).rejects.toBeInstanceOf(VorlageKonfliktFehler);
  });

  it('liefert Kennzahlen statt des Baums in den Kopfdaten', async () => {
    const storage = new InMemoryPruefvorlageStorage();
    storage.vorbelegen(erzeugeTestvorlage());
    const koepfe = await storage.ladeKoepfe();
    expect(koepfe[0]?.anzahlFaecher).toBe(1);
    expect(koepfe[0]?.anzahlArtikel).toBe(2);
  });

  it('gibt einen geladenen Stand als Kopie heraus, damit ein Entwurf den Speicher nicht verändert', async () => {
    const storage = new InMemoryPruefvorlageStorage();
    storage.vorbelegen(erzeugeTestvorlage());
    const geladen = await storage.ladeVorlage('vorlage-1');
    geladen!.daten.bezeichnung = 'Verbogen';
    const erneut = await storage.ladeVorlage('vorlage-1');
    expect(erneut!.daten.bezeichnung).toBe('Erfundene Prüfvorlage');
  });

  it('verweigert das Löschen einer benutzten Vorlage', async () => {
    const storage = new InMemoryPruefvorlageStorage();
    storage.vorbelegen(erzeugeTestvorlage());
    storage.inBenutzung.add('vorlage-1');
    await expect(storage.loescheVorlage('vorlage-1')).rejects.toBeInstanceOf(
      VorlageInBenutzungFehler,
    );
  });
});
