import { describe, expect, it } from 'vitest';
import {
  EinsatzplanungBereitsVorhandenFehler,
  EinsatzplanungKonfliktFehler,
} from '../storage/einsatzplanung-fehler';
import { versionAlsZahl } from '../storage/einsatzplanung-version';
import {
  InMemoryEinsatzStorage,
  InMemoryPepStorage,
  InMemoryPepVorlagenStorage,
  InMemoryVbVorlagenStorage,
  InMemoryVorbereitungStorage,
} from './in-memory-einsatzplanung';
import { testPep, testPepVorlage } from './pep-testdaten';
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

describe('InMemoryPepStorage', () => {
  it('legt an, prüft Versionen und liefert Kennzahlen', async () => {
    const storage = new InMemoryPepStorage();
    const id = crypto.randomUUID();
    expect(await storage.ladePep(id)).toBeNull();
    expect(storage.kennzahlen(id)).toBeNull();
    const v1 = await storage.legePepAn(id, testPep());
    await expect(storage.legePepAn(id, testPep())).rejects.toBeInstanceOf(
      EinsatzplanungBereitsVorhandenFehler,
    );
    expect(storage.kennzahlen(id)).toEqual({ posten: 1, positionen: 2, besetzt: 1 });
    const v2 = await storage.speicherePep(id, testPep({ vorlageId: crypto.randomUUID() }), v1);
    await expect(storage.speicherePep(id, testPep(), v1)).rejects.toBeInstanceOf(
      EinsatzplanungKonfliktFehler,
    );
    await expect(storage.loeschePep(id, v1)).rejects.toBeInstanceOf(EinsatzplanungKonfliktFehler);
    await storage.loeschePep(id, v2);
    expect(await storage.ladePep(id)).toBeNull();
  });

  it('liefert Kopien, die den Speicher nicht verändern', async () => {
    const storage = new InMemoryPepStorage();
    const id = crypto.randomUUID();
    await storage.legePepAn(id, testPep());
    (await storage.ladePep(id))!.daten.inhalt.beschreibung = 'geändert';
    expect((await storage.ladePep(id))!.daten.inhalt.beschreibung).not.toBe('geändert');
  });

  it('erscheint als Kennzahl in der Einsatzliste', async () => {
    const peps = new InMemoryPepStorage();
    const einsaetze = new InMemoryEinsatzStorage(undefined, peps);
    const mit = testEinsatz();
    const ohne = testEinsatz();
    einsaetze._vorbelegen(mit);
    einsaetze._vorbelegen(ohne);
    peps._vorbelegen(mit.id, testPep());
    const liste = await einsaetze.ladeEinsaetze();
    expect(liste.find((e) => e.id === mit.id)?.pep).toEqual({
      posten: 1,
      positionen: 2,
      besetzt: 1,
    });
    expect(liste.find((e) => e.id === ohne.id)?.pep).toBeNull();
  });
});

describe('InMemoryPepVorlagenStorage', () => {
  it('liefert Kopfdaten mit Kennzahlen und prüft Versionen', async () => {
    const storage = new InMemoryPepVorlagenStorage();
    const vorlage = testPepVorlage();
    const v1 = await storage.legeVorlageAn(vorlage);
    await expect(storage.legeVorlageAn(vorlage)).rejects.toBeInstanceOf(
      EinsatzplanungBereitsVorhandenFehler,
    );
    expect((await storage.ladeVorlagen())[0]).toMatchObject({
      id: vorlage.id,
      version: 1,
      posten: 1,
      positionen: 2,
    });
    const v2 = await storage.speichereVorlage({ ...vorlage, titel: 'B' }, v1);
    expect((await storage.ladeVorlage(vorlage.id))?.daten.titel).toBe('B');
    await expect(storage.speichereVorlage(vorlage, v1)).rejects.toBeInstanceOf(
      EinsatzplanungKonfliktFehler,
    );
    await storage.loescheVorlage(vorlage.id, v2);
    expect(await storage.ladeVorlagen()).toEqual([]);
    expect(await storage.ladeVorlage(vorlage.id)).toBeNull();
  });
});
