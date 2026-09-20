import { describe, expect, it } from 'vitest';
import { erzeugeTestPreiskatalogEintrag } from './preiskatalog-testdaten';
import { InMemoryPreiskatalogStorage } from './in-memory-preiskatalog-storage';
import { PreiskatalogKonfliktFehler } from '../storage/preiskatalog-storage';

describe('InMemoryPreiskatalogStorage', () => {
  it('legt einen neuen Eintrag mit Version 1 an', async () => {
    const storage = new InMemoryPreiskatalogStorage();
    const eintrag = await storage.speichereEintrag(
      { id: 'x', bezeichnung: 'Test', art: 'einsatzkraft', einzelpreisCent: 1000 },
      null,
    );
    expect(eintrag.version).toBe(1);
  });

  it('lehnt eine zweite Anlage mit derselben id als Konflikt ab', async () => {
    const storage = new InMemoryPreiskatalogStorage();
    await storage.speichereEintrag(
      { id: 'x', bezeichnung: 'Test', art: 'einsatzkraft', einzelpreisCent: 1000 },
      null,
    );
    await expect(
      storage.speichereEintrag(
        { id: 'x', bezeichnung: 'Test 2', art: 'einsatzkraft', einzelpreisCent: 1100 },
        null,
      ),
    ).rejects.toBeInstanceOf(PreiskatalogKonfliktFehler);
  });

  it('erhöht die Version bei jedem Update', async () => {
    const storage = new InMemoryPreiskatalogStorage();
    const erste = await storage.speichereEintrag(
      { id: 'x', bezeichnung: 'Test', art: 'einsatzkraft', einzelpreisCent: 1000 },
      null,
    );
    const zweite = await storage.speichereEintrag(
      { id: 'x', bezeichnung: 'Test', art: 'einsatzkraft', einzelpreisCent: 1100 },
      erste.version,
    );
    expect(zweite.version).toBe(2);
  });

  it('lehnt ein Update mit veralteter Version ab', async () => {
    const storage = new InMemoryPreiskatalogStorage();
    await storage.speichereEintrag(
      { id: 'x', bezeichnung: 'Test', art: 'einsatzkraft', einzelpreisCent: 1000 },
      null,
    );
    await expect(
      storage.speichereEintrag(
        { id: 'x', bezeichnung: 'Test', art: 'einsatzkraft', einzelpreisCent: 1100 },
        99,
      ),
    ).rejects.toBeInstanceOf(PreiskatalogKonfliktFehler);
  });

  it('löscht einen Eintrag', async () => {
    const storage = new InMemoryPreiskatalogStorage();
    storage._vorbelegen([erzeugeTestPreiskatalogEintrag({ id: 'x' })]);
    await storage.loescheEintrag('x');
    expect(await storage.ladeEintraege()).toHaveLength(0);
  });
});
