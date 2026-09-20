import { describe, expect, it } from 'vitest';
import { erzeugeTestAngebot } from './angebot-testdaten';
import { InMemoryAngebotStorage } from './in-memory-angebot-storage';
import { AngebotKonfliktFehler } from '../storage/angebot-storage';

describe('InMemoryAngebotStorage', () => {
  it('legt ein neues Angebot an und lässt es sich mit seiner Version wieder laden', async () => {
    const storage = new InMemoryAngebotStorage();
    const angebot = erzeugeTestAngebot();
    const version = await storage.speichereAngebot(angebot, null);
    const geladen = await storage.ladeAngebot(angebot.id);
    expect(geladen).toEqual({ daten: angebot, version });
  });

  it('lehnt eine zweite Anlage mit derselben id als Konflikt ab', async () => {
    const storage = new InMemoryAngebotStorage();
    const angebot = erzeugeTestAngebot();
    await storage.speichereAngebot(angebot, null);
    await expect(storage.speichereAngebot(angebot, null)).rejects.toBeInstanceOf(
      AngebotKonfliktFehler,
    );
  });

  it('lehnt ein Update mit veralteter Version ab', async () => {
    const storage = new InMemoryAngebotStorage();
    const angebot = erzeugeTestAngebot();
    await storage.speichereAngebot(angebot, null);
    await expect(storage.speichereAngebot(angebot, 'veraltete-version')).rejects.toBeInstanceOf(
      AngebotKonfliktFehler,
    );
  });

  it('löscht ein Angebot', async () => {
    const storage = new InMemoryAngebotStorage();
    const angebot = erzeugeTestAngebot();
    storage._vorbelegen(angebot);
    await storage.loescheAngebot(angebot.id);
    expect(await storage.ladeAngebot(angebot.id)).toBeNull();
  });

  it('liefert die Liste ohne Version', async () => {
    const storage = new InMemoryAngebotStorage();
    const angebot = erzeugeTestAngebot();
    storage._vorbelegen(angebot);
    expect(await storage.ladeAngebote()).toEqual([angebot]);
  });
});
