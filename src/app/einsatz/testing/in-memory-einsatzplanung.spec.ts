import { describe, expect, it } from 'vitest';
import {
  EinsatzplanungBereitsVorhandenFehler,
  EinsatzplanungKonfliktFehler,
} from '../storage/einsatzplanung-fehler';
import { versionAlsZahl } from '../storage/einsatzplanung-version';
import {
  InMemoryEinsatzStorage,
  InMemoryVbVorlagenStorage,
  InMemoryVorbereitungStorage,
} from './in-memory-einsatzplanung';
import { testEinsatz, testVorbereitung, testVorlage } from './vb-testdaten';

describe('InMemoryEinsatzStorage', () => {
  it('legt an, lädt, speichert mit Version und weist veraltete ab', async () => {
    const storage = new InMemoryEinsatzStorage();
    const einsatz = testEinsatz();
    const v1 = await storage.legeEinsatzAn(einsatz);
    expect(versionAlsZahl(v1)).toBe(1);
    await expect(storage.legeEinsatzAn(einsatz)).rejects.toBeInstanceOf(
      EinsatzplanungBereitsVorhandenFehler,
    );
    const v2 = await storage.speichereEinsatz({ ...einsatz, titel: 'Neu' }, v1);
    expect(v2).not.toBe(v1);
    await expect(storage.speichereEinsatz(einsatz, v1)).rejects.toBeInstanceOf(
      EinsatzplanungKonfliktFehler,
    );
    expect((await storage.ladeEinsatz(einsatz.id))?.daten.titel).toBe('Neu');
    expect(await storage.ladeEinsatz(crypto.randomUUID())).toBeNull();
  });

  it('hält die HiOrg-Veranstaltung eindeutig', async () => {
    const storage = new InMemoryEinsatzStorage();
    await storage.legeEinsatzAn(testEinsatz({ hiorgVeranstaltungId: '77' }));
    const fehler = await storage
      .legeEinsatzAn(testEinsatz({ hiorgVeranstaltungId: '77' }))
      .catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(EinsatzplanungBereitsVorhandenFehler);
    expect((fehler as EinsatzplanungBereitsVorhandenFehler).veranstaltungVergeben).toBe(true);
  });

  it('liefert VB-Kennzahlen in der Liste', async () => {
    const vorbereitungen = new InMemoryVorbereitungStorage();
    const storage = new InMemoryEinsatzStorage(vorbereitungen);
    const einsatz = testEinsatz();
    await storage.legeEinsatzAn(einsatz);
    expect((await storage.ladeEinsaetze())[0].vb).toBeNull();
    await vorbereitungen.legeVorbereitungAn(einsatz.id, testVorbereitung());
    expect((await storage.ladeEinsaetze())[0]).toMatchObject({
      vb: { laufzettel: 1, positionen: 1 },
      version: 1,
    });
  });
});

describe('InMemoryVorbereitungStorage', () => {
  it('kennt Anlage, Konflikt und Löschen', async () => {
    const storage = new InMemoryVorbereitungStorage();
    const id = crypto.randomUUID();
    expect(await storage.ladeVorbereitung(id)).toBeNull();
    const v1 = await storage.legeVorbereitungAn(id, testVorbereitung());
    await expect(storage.legeVorbereitungAn(id, testVorbereitung())).rejects.toBeInstanceOf(
      EinsatzplanungBereitsVorhandenFehler,
    );
    await expect(
      storage.speichereVorbereitung(id, testVorbereitung(), '"99"'),
    ).rejects.toBeInstanceOf(EinsatzplanungKonfliktFehler);
    const v2 = await storage.speichereVorbereitung(id, testVorbereitung(), v1);
    await expect(storage.loescheVorbereitung(id, v1)).rejects.toBeInstanceOf(
      EinsatzplanungKonfliktFehler,
    );
    await storage.loescheVorbereitung(id, v2);
    expect(await storage.ladeVorbereitung(id)).toBeNull();
  });

  it('gibt Kopien heraus, damit Aufrufer den Speicher nicht verändern', async () => {
    const storage = new InMemoryVorbereitungStorage();
    const id = crypto.randomUUID();
    await storage.legeVorbereitungAn(id, testVorbereitung());
    const stand = await storage.ladeVorbereitung(id);
    stand!.daten.inhalt.anweisungen = 'geändert';
    expect((await storage.ladeVorbereitung(id))!.daten.inhalt.anweisungen).not.toBe('geändert');
  });
});

describe('InMemoryVbVorlagenStorage', () => {
  it('liefert Kopfdaten mit Kennzahlen und prüft Versionen', async () => {
    const storage = new InMemoryVbVorlagenStorage();
    const vorlage = testVorlage();
    const v1 = await storage.legeVorlageAn(vorlage);
    const [kopf] = await storage.ladeVorlagen();
    expect(kopf).toMatchObject({
      id: vorlage.id,
      version: 1,
      abschnitte: 1,
      laufzettel: 1,
      positionen: 1,
    });
    const v2 = await storage.speichereVorlage({ ...vorlage, titel: 'B' }, v1);
    expect((await storage.ladeVorlagen())[0].version).toBe(2);
    await expect(storage.speichereVorlage(vorlage, v1)).rejects.toBeInstanceOf(
      EinsatzplanungKonfliktFehler,
    );
    await expect(storage.loescheVorlage(vorlage.id, v1)).rejects.toBeInstanceOf(
      EinsatzplanungKonfliktFehler,
    );
    await storage.loescheVorlage(vorlage.id, v2);
    expect(await storage.ladeVorlagen()).toEqual([]);
  });
});
