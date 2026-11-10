import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiAufbauStorage, ApiAufbauVorlagenStorage } from '../storage/api-aufbau-storage';
import { InMemoryAufbauStorage, InMemoryAufbauVorlagenStorage } from '../testing/in-memory-aufbau';
import { testAufbau, testAufbauInhalt, testEinheit, testId } from '../testing/aufbau-testdaten';
import { einheitHinzufuegen } from './aufbau-bearbeiten';
import { AufbauEditorStoreService } from './aufbau-editor-store.service';

describe('AufbauEditorStoreService', () => {
  let aufbauten: InMemoryAufbauStorage;
  let vorlagen: InMemoryAufbauVorlagenStorage;
  let store: AufbauEditorStoreService;
  const einsatzId = testId(900);

  beforeEach(() => {
    aufbauten = new InMemoryAufbauStorage();
    vorlagen = new InMemoryAufbauVorlagenStorage();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiAufbauStorage, useValue: aufbauten },
        { provide: ApiAufbauVorlagenStorage, useValue: vorlagen },
      ],
    });
    store = TestBed.inject(AufbauEditorStoreService);
  });

  it('meldet einen fehlenden Aufbau als nicht gefunden', async () => {
    await store.ladeAufbau(einsatzId);
    expect(store.nichtGefunden()).toBe(true);
    expect(store.inhalt()).toBeNull();
  });

  it('legt leer an, ändert, merkt Änderungen, macht rückgängig und speichert mit Version', async () => {
    expect(await store.anlegen(einsatzId, null)).toBe(true);
    expect(store.geaendert()).toBe(false);

    const neu = einheitHinzufuegen(store.inhalt()!, 'wagen', 'Rollwagen');
    store.aendern(neu.inhalt);
    expect(store.geaendert()).toBe(true);
    expect(store.kannRueckgaengig()).toBe(true);

    store.rueckgaengig();
    expect(store.geaendert()).toBe(false);
    store.aendern(neu.inhalt);

    expect(await store.speichern()).toBe(true);
    expect(store.geaendert()).toBe(false);
    const gespeichert = await aufbauten.ladeAufbau(einsatzId);
    expect(gespeichert?.version).toBe('"2"');
    expect(gespeichert?.daten.inhalt.einheiten[0]?.name).toBe('Rollwagen');
  });

  it('bewahrt den Entwurf bei einem Versionskonflikt', async () => {
    aufbauten._vorbelegen(einsatzId, testAufbau());
    await store.ladeAufbau(einsatzId);
    store.aendern(einheitHinzufuegen(store.inhalt()!, 'wagen', 'Neu').inhalt);
    // Jemand anderes speichert zuerst.
    await aufbauten.speichereAufbau(einsatzId, testAufbau(), '"1"');
    expect(await store.speichern()).toBe(false);
    expect(store.konflikt()).toBe(true);
    expect(store.geaendert()).toBe(true);
    expect(store.inhalt()!.einheiten.map((e) => e.name)).toContain('Neu');
  });

  it('wendet eine Vorlage mit neuen Ids an und merkt sich Vorlage und Version', async () => {
    const vorlageInhalt = testAufbauInhalt([testEinheit({ name: 'Rollwagen 03' })]);
    const vorlage = { id: testId(5), titel: 'Standard', inhalt: vorlageInhalt };
    vorlagen._vorbelegen(vorlage);
    const stand = await vorlagen.ladeVorlage(vorlage.id);
    expect(await store.anlegen(einsatzId, stand)).toBe(true);
    expect(store.inhalt()!.einheiten[0]!.name).toBe('Rollwagen 03');
    expect(store.inhalt()!.einheiten[0]!.id).not.toBe(vorlageInhalt.einheiten[0]!.id);
    expect(store.entwurf()).toMatchObject({ vorlageId: vorlage.id, vorlageVersion: 1 });
  });

  it('lehnt eine zweite Anlage ab und meldet den Fehler', async () => {
    await store.anlegen(einsatzId, null);
    expect(await store.anlegen(einsatzId, null)).toBe(false);
    expect(store.speicherZustand()).toBe('fehler');
  });

  it('bearbeitet eine neue Vorlage: ohne Titel kein Speichern, danach Anlage und Folgespeichern', async () => {
    await store.ladeVorlage('neu');
    store.aendern(einheitHinzufuegen(store.inhalt()!, 'fahrzeug', 'GW').inhalt);
    expect(await store.speichern()).toBe(false);
    expect(store.speicherFehler()).toContain('Titel');
    store.titelSetzen('Sanitätsdienst Standard');
    expect(await store.speichern()).toBe(true);
    const liste = await vorlagen.ladeVorlagen();
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ titel: 'Sanitätsdienst Standard', einheiten: 1 });
    store.titelSetzen('Umbenannt');
    expect(await store.speichern()).toBe(true);
    expect((await vorlagen.ladeVorlagen())[0]).toMatchObject({ titel: 'Umbenannt', version: 2 });
  });

  it('lehnt eine Änderung über der Grenze ab und merkt einen Hinweis', async () => {
    await store.anlegen(einsatzId, null);
    const zuViele = testAufbauInhalt(Array.from({ length: 61 }, () => testEinheit()));
    store.aendern(zuViele);
    expect(store.hinweis()).not.toBe('');
    expect(store.geaendert()).toBe(false);
  });

  it('setzt beim Zurücksetzen alles zurück', async () => {
    await store.anlegen(einsatzId, null);
    store.zuruecksetzen();
    expect(store.entwurf()).toBeNull();
    expect(store.modus()).toBeNull();
  });
});
