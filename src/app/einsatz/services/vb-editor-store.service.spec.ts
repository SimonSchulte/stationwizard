import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import { ApiVbVorlagenStorage } from '../storage/api-vb-vorlagen-storage';
import { ApiVorbereitungStorage } from '../storage/api-vorbereitung-storage';
import { EinsatzplanungKonfliktFehler } from '../storage/einsatzplanung-fehler';
import {
  InMemoryVbVorlagenStorage,
  InMemoryVorbereitungStorage,
} from '../testing/in-memory-einsatzplanung';
import {
  testAbschnitt,
  testInhalt,
  testLaufzettel,
  testPosition,
  testVorlage,
} from '../testing/vb-testdaten';
import { VbEditorStoreService } from './vb-editor-store.service';

describe('VbEditorStoreService', () => {
  let vorlagen: InMemoryVbVorlagenStorage;
  let vorbereitungen: InMemoryVorbereitungStorage;
  let store: VbEditorStoreService;
  const einsatzId = crypto.randomUUID();

  const vorlage = testVorlage({
    inhalt: testInhalt({
      abschnitte: [
        testAbschnitt({
          titel: 'Betreuung',
          fachgruppe: 'betreuung',
          laufzettel: [
            testLaufzettel({
              lagerort: 'A',
              positionen: [
                testPosition({ material: 'Stühle' }),
                testPosition({ material: 'Tische' }),
              ],
            }),
            testLaufzettel({ lagerort: 'B' }),
          ],
        }),
        testAbschnitt({ titel: 'TeSi', farbe: 'abschnitt-2', fachgruppe: 'tesi', laufzettel: [] }),
      ],
    }),
  });

  beforeEach(() => {
    vorlagen = new InMemoryVbVorlagenStorage();
    vorbereitungen = new InMemoryVorbereitungStorage();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiVbVorlagenStorage, useValue: vorlagen },
        { provide: ApiVorbereitungStorage, useValue: vorbereitungen },
      ],
    });
    store = TestBed.inject(VbEditorStoreService);
    vorlagen._vorbelegen(vorlage);
  });

  async function vbAusVorlage() {
    expect(await store.ausVorlageAnlegen(einsatzId, vorlage.id)).toBe(true);
    return store.inhalt()!;
  }

  describe('Anlegen und Laden', () => {
    it('legt die VB aus der Vorlage an, speichert sie sofort und setzt Herkunft und Vorlagenversion', async () => {
      const inhalt = await vbAusVorlage();
      expect(store.modus()).toBe('vorbereitung');
      expect(store.geaendert()).toBe(false);
      expect(inhalt.abschnitte[0].herkunftId).toBe(vorlage.inhalt.abschnitte[0].id);
      expect(inhalt.abschnitte[0].id).not.toBe(vorlage.inhalt.abschnitte[0].id);
      const gespeichert = await vorbereitungen.ladeVorbereitung(einsatzId);
      expect(gespeichert?.daten).toMatchObject({ vorlageId: vorlage.id, vorlageVersion: 1 });
      expect(store.abweichungen()).toEqual([]);
    });

    it('legt leer an', async () => {
      expect(await store.leerAnlegen(einsatzId)).toBe(true);
      expect(store.inhalt()).toEqual({ anweisungen: '', abschnitte: [] });
      expect((await vorbereitungen.ladeVorbereitung(einsatzId))?.daten.vorlageId).toBeNull();
    });

    it('meldet eine unbekannte Vorlage und einen schon vorhandenen Einsatz', async () => {
      expect(await store.ausVorlageAnlegen(einsatzId, crypto.randomUUID())).toBe(false);
      expect(store.ladeFehler()).toContain('nicht gefunden');
      await store.leerAnlegen(einsatzId);
      expect(await store.leerAnlegen(einsatzId)).toBe(false);
      expect(store.ladeFehler()).toContain('existiert bereits');
    });

    it('lädt vorhandene VB und Vorlage, merkt fehlende', async () => {
      await store.leerAnlegen(einsatzId);
      store.zuruecksetzen();
      await store.vorbereitungLaden(einsatzId);
      expect(store.modus()).toBe('vorbereitung');
      expect(store.inhalt()).not.toBeNull();

      await store.vorbereitungLaden(crypto.randomUUID());
      expect(store.nichtGefunden()).toBe(true);
      expect(store.inhalt()).toBeNull();

      await store.vorlageLaden(vorlage.id);
      expect(store.modus()).toBe('vorlage');
      expect(store.titel()).toBe(vorlage.titel);
      expect(store.vorlageId()).toBe(vorlage.id);
    });
  });

  describe('Bearbeiten und Rückgängig', () => {
    beforeEach(() => vbAusVorlage());

    it('markiert Änderungen und macht sie rückgängig', () => {
      store.anweisungenAendern('Neu');
      expect(store.geaendert()).toBe(true);
      expect(store.kannRueckgaengig()).toBe(true);
      store.rueckgaengig();
      expect(store.inhalt()!.anweisungen).toBe(vorlage.inhalt.anweisungen);
      expect(store.geaendert()).toBe(false);
      expect(store.kannRueckgaengig()).toBe(false);
    });

    it('fasst aufeinanderfolgende Eingaben in dasselbe Feld zu einem Schritt zusammen', () => {
      const id = store.inhalt()!.abschnitte[0].laufzettel[0].id;
      store.laufzettelAendern(id, { lagerort: 'X' });
      store.laufzettelAendern(id, { lagerort: 'XY' });
      store.laufzettelAendern(id, { lagerort: 'XYZ' });
      store.rueckgaengig();
      expect(store.inhalt()!.abschnitte[0].laufzettel[0].lagerort).toBe('A');
    });

    it('hält mindestens 30 Rückgängig-Schritte', () => {
      for (let i = 0; i < 35; i += 1) store.abschnittHinzufuegen();
      expect(store.inhalt()!.abschnitte).toHaveLength(2 + 28); // Grenze 30
      let schritte = 0;
      while (store.kannRueckgaengig()) {
        store.rueckgaengig();
        schritte += 1;
      }
      expect(schritte).toBe(28);
    });

    it('verwaltet Abschnitte', () => {
      const id = store.abschnittHinzufuegen()!;
      const neu = store.inhalt()!.abschnitte[2];
      expect(neu.id).toBe(id);
      expect(neu.farbe).toBe('abschnitt-3');
      store.abschnittAendern(id, { titel: 'Verpflegung', fachgruppe: 'verpflegung' });
      expect(store.inhalt()!.abschnitte[2]).toMatchObject({
        titel: 'Verpflegung',
        fachgruppe: 'verpflegung',
      });
      store.abschnittVerschieben(id, 0);
      expect(store.inhalt()!.abschnitte[0].id).toBe(id);
      store.abschnittLoeschen(id);
      expect(store.inhalt()!.abschnitte).toHaveLength(2);
    });

    it('verschiebt die Laufzettel eines gelöschten Abschnitts nach „Ohne Abschnitt“', () => {
      const [erster, zweiter] = store.inhalt()!.abschnitte;
      const ids = [...erster.laufzettel, ...zweiter.laufzettel].map((l) => l.id);
      store.abschnittLoeschen(erster.id);
      store.abschnittLoeschen(zweiter.id);
      const abschnitte = store.inhalt()!.abschnitte;
      const sammel = abschnitte.filter((a) => a.titel === 'Ohne Abschnitt');
      expect(sammel).toHaveLength(1);
      expect(sammel[0].laufzettel.map((l) => l.id)).toEqual(ids);
    });

    it('überträgt die Fachgruppe des Abschnitts auf alle seine Laufzettel', () => {
      const abschnitt = store.inhalt()!.abschnitte[0];
      store.abschnittAendern(abschnitt.id, { fachgruppe: 'verpflegung' });
      store.fachgruppeAufLaufzettelUebertragen(abschnitt.id);
      expect(store.inhalt()!.abschnitte[0].laufzettel.map((l) => l.fachgruppe)).toEqual([
        'verpflegung',
        'verpflegung',
      ]);
    });

    it('fügt Laufzettel mit Vorgaben des Abschnitts ein', () => {
      const tesi = store.inhalt()!.abschnitte[1];
      const id = store.laufzettelHinzufuegen(tesi.id)!;
      expect(store.laufzettelFinden(id)?.laufzettel).toMatchObject({
        fachgruppe: 'tesi',
        auftraggeber: 'GF TeSi',
        ueberschrift: 'Material verlasten',
      });
    });

    it('verschiebt Laufzettel zwischen Abschnitten', () => {
      const [a, b] = store.inhalt()!.abschnitte;
      store.laufzettelVerschieben(a.laufzettel[0].id, b.id, 0);
      expect(store.inhalt()!.abschnitte[0].laufzettel).toHaveLength(1);
      expect(store.inhalt()!.abschnitte[1].laufzettel[0].id).toBe(a.laufzettel[0].id);
      store.laufzettelVerschieben(a.laufzettel[0].id, b.id, 99);
      expect(store.inhalt()!.abschnitte[1].laufzettel).toHaveLength(1);
    });

    it('dupliziert hinter das Original', () => {
      const original = store.inhalt()!.abschnitte[0].laufzettel[0];
      const kopieId = store.laufzettelDuplizieren(original.id)!;
      const liste = store.inhalt()!.abschnitte[0].laufzettel;
      expect(liste.map((l) => l.id)).toEqual([original.id, kopieId, liste[2].id]);
      expect(liste[1].herkunftId).toBeNull();
    });

    it('teilt und führt wieder zusammen', () => {
      const original = store.inhalt()!.abschnitte[0].laufzettel[0];
      const zweiter = original.positionen[1].id;
      const neuId = store.laufzettelTeilen(original.id, [zweiter])!;
      let liste = store.inhalt()!.abschnitte[0].laufzettel;
      expect(liste[0].positionen).toHaveLength(1);
      expect(liste[1].id).toBe(neuId);
      expect(liste[1].positionen.map((p) => p.id)).toEqual([zweiter]);

      expect(store.laufzettelZusammenfuehren(original.id, neuId)).toBe(true);
      liste = store.inhalt()!.abschnitte[0].laufzettel;
      expect(liste).toHaveLength(2);
      expect(liste[0].positionen).toHaveLength(2);
    });

    it('teilt nicht ohne oder mit allen Positionen und meldet einen Hinweis', () => {
      const original = store.inhalt()!.abschnitte[0].laufzettel[0];
      expect(store.laufzettelTeilen(original.id, [])).toBeNull();
      expect(store.hinweis()).toContain('mindestens eine');
      expect(
        store.laufzettelTeilen(
          original.id,
          original.positionen.map((p) => p.id),
        ),
      ).toBeNull();
    });

    it('teilt einen zu vollen Laufzettel automatisch', () => {
      const original = store.inhalt()!.abschnitte[0].laufzettel[0];
      for (let i = 0; i < 24; i += 1) {
        const id = store.positionHinzufuegen(original.id)!;
        store.positionAendern(id, { material: `Teil ${i}` });
      }
      expect(store.laufzettelAufteilen(store.inhalt()!.abschnitte[0].laufzettel[1].id)).toBeNull();
      const neuId = store.laufzettelAufteilen(original.id);
      expect(neuId).not.toBeNull();
      const liste = store.inhalt()!.abschnitte[0].laufzettel;
      expect(liste[0].positionen.length + liste[1].positionen.length).toBe(26);
      expect(liste[0].positionen.length).toBeLessThanOrEqual(23);
    });

    it('verweigert das Zusammenführen über 50 Positionen', () => {
      const [erster, zweiter] = store.inhalt()!.abschnitte[0].laufzettel;
      for (let i = 0; i < 49; i += 1) store.positionHinzufuegen(erster.id);
      for (let i = 0; i < 5; i += 1) store.positionHinzufuegen(zweiter.id);
      expect(store.laufzettelZusammenfuehren(erster.id, zweiter.id)).toBe(false);
      expect(store.hinweis()).toContain('50 Positionen');
    });

    it('verwaltet Positionen und begrenzt sie auf 50', () => {
      const lz = store.inhalt()!.abschnitte[0].laufzettel[0];
      const id = store.positionHinzufuegen(lz.id)!;
      store.positionAendern(id, { material: 'Zelt', anzahl: '3' });
      expect(store.laufzettelFinden(lz.id)!.laufzettel.positionen[2]).toMatchObject({
        material: 'Zelt',
        anzahl: '3',
      });
      store.positionVerschieben(lz.id, id, 0);
      expect(store.laufzettelFinden(lz.id)!.laufzettel.positionen[0].id).toBe(id);
      store.positionLoeschen(id);
      expect(store.laufzettelFinden(lz.id)!.laufzettel.positionen).toHaveLength(2);
      for (let i = 0; i < 48; i += 1) store.positionHinzufuegen(lz.id);
      expect(store.positionHinzufuegen(lz.id)).toBeNull();
      expect(store.hinweis()).toContain('50');
    });

    it('löscht Laufzettel', () => {
      store.laufzettelLoeschen(store.inhalt()!.abschnitte[0].laufzettel[0].id);
      expect(store.inhalt()!.abschnitte[0].laufzettel).toHaveLength(1);
    });

    it('meldet ungesicherte Änderungen an den Verlassen-Schutz', () => {
      const schutz = TestBed.inject(VerlassenSchutz);
      expect(schutz.hatUngesicherteAenderungen()).toBe(false);
      store.anweisungenAendern('x');
      expect(schutz.hatUngesicherteAenderungen()).toBe(true);
    });
  });

  describe('Speichern', () => {
    beforeEach(() => vbAusVorlage());

    it('speichert mit If-Match, behält danach den Rückgängig-Stapel und ist nicht mehr geändert', async () => {
      store.anweisungenAendern('Neu');
      expect(await store.speichern()).toBe(true);
      expect(store.geaendert()).toBe(false);
      expect(store.kannRueckgaengig()).toBe(true);
      expect((await vorbereitungen.ladeVorbereitung(einsatzId))?.daten.inhalt.anweisungen).toBe(
        'Neu',
      );
      store.anweisungenAendern('Noch neuer');
      expect(await store.speichern()).toBe(true);
    });

    it('lehnt ungültigen Inhalt vor dem Speichern ab', async () => {
      const lz = store.inhalt()!.abschnitte[0].laufzettel[0].id;
      store.positionHinzufuegen(lz); // leeres Material
      expect(await store.speichern()).toBe(false);
      expect(store.speicherZustand()).toBe('fehler');
      expect(store.speicherFehler()).toContain('Materialangabe');
      expect(store.geaendert()).toBe(true);
    });

    it('bewahrt bei 412 den Entwurf und zeigt den Konflikt', async () => {
      store.anweisungenAendern('Meine Änderung');
      const fremd = await vorbereitungen.ladeVorbereitung(einsatzId);
      await vorbereitungen.speichereVorbereitung(einsatzId, fremd!.daten, fremd!.version);

      expect(await store.speichern()).toBe(false);
      expect(store.konflikt()).toBe(true);
      expect(store.inhalt()!.anweisungen).toBe('Meine Änderung');
      expect(store.geaendert()).toBe(true);

      await store.neuLadenNachKonflikt();
      expect(store.konflikt()).toBe(false);
      expect(store.inhalt()!.anweisungen).toBe(vorlage.inhalt.anweisungen);
    });

    it('löscht die Vorbereitung', async () => {
      expect(await store.vorbereitungLoeschen()).toBe(true);
      expect(await vorbereitungen.ladeVorbereitung(einsatzId)).toBeNull();
      expect(store.modus()).toBeNull();
    });

    it('legt „als neue Vorlage“ mit neuen Ids und ohne Herkunft an', async () => {
      const id = await store.alsNeueVorlageSpeichern('Kopie');
      expect(id).not.toBeNull();
      const neu = await vorlagen.ladeVorlage(id!);
      expect(neu?.daten.titel).toBe('Kopie');
      expect(JSON.stringify(neu?.daten.inhalt)).not.toMatch(/"herkunftId":"/);
      expect(neu?.daten.inhalt.abschnitte[0].id).not.toBe(store.inhalt()!.abschnitte[0].id);
      expect(await store.alsNeueVorlageSpeichern(' ')).toBeNull();
    });
  });

  describe('Vorlage bearbeiten', () => {
    it('speichert eine bestehende Vorlage mit Titel und prüft den Titel', async () => {
      await store.vorlageLaden(vorlage.id);
      store.titelAendern('Umbenannt');
      expect(await store.speichern()).toBe(true);
      expect((await vorlagen.ladeVorlage(vorlage.id))?.daten.titel).toBe('Umbenannt');
      store.titelAendern(' ');
      expect(await store.speichern()).toBe(false);
      expect(store.speicherFehler()).toContain('Titel');
    });

    it('legt eine neue Vorlage beim ersten Speichern an', async () => {
      store.neueVorlageBeginnen('Frisch');
      expect(store.istNeu()).toBe(true);
      expect(store.geaendert()).toBe(true);
      expect(await store.speichern()).toBe(true);
      expect(store.istNeu()).toBe(false);
      expect(await vorlagen.ladeVorlage(store.vorlageId()!)).not.toBeNull();
      expect(store.abweichungen()).toEqual([]);
    });

    it('löscht die Vorlage', async () => {
      await store.vorlageLaden(vorlage.id);
      expect(await store.vorlageLoeschen()).toBe(true);
      expect(await vorlagen.ladeVorlage(vorlage.id)).toBeNull();
    });
  });

  describe('Abgleich mit der Vorlage', () => {
    beforeEach(() => vbAusVorlage());

    async function abgleichBereit() {
      await store.abgleichVorlageLaden();
    }

    it('zeigt Abweichungen gegen die geladene Vorlage', async () => {
      await abgleichBereit();
      store.laufzettelAendern(store.inhalt()!.abschnitte[0].laufzettel[0].id, { lagerort: 'Neu' });
      expect(store.abweichungen()).toHaveLength(1);
      expect(store.abweichungen()[0].art).toBe('geaendert');
    });

    it('zeigt ohne Vorlage keine Abweichungen', async () => {
      await store.leerAnlegen(crypto.randomUUID());
      store.abschnittHinzufuegen();
      await store.abgleichVorlageLaden();
      expect(store.abweichungen()).toEqual([]);
    });

    it('wendet auf die Vorlage an: Vorlage und VB gespeichert, Versionen und Herkunft stimmen', async () => {
      await abgleichBereit();
      const lz = store.inhalt()!.abschnitte[0].laufzettel[0];
      store.laufzettelAendern(lz.id, { lagerort: 'Neu' });
      const neuId = store.laufzettelHinzufuegen(store.inhalt()!.abschnitte[1].id)!;
      const schluessel = new Set(store.abweichungen().map((a) => a.schluessel));
      expect(schluessel.size).toBe(2);

      expect(await store.aufVorlageAnwenden(schluessel)).toBe(true);

      const v = await vorlagen.ladeVorlage(vorlage.id);
      expect(v?.version).toBe('"2"');
      expect(v?.daten.inhalt.abschnitte[0].laufzettel[0].lagerort).toBe('Neu');
      expect(v?.daten.inhalt.abschnitte[1].laufzettel).toHaveLength(1);
      const vb = await vorbereitungen.ladeVorbereitung(einsatzId);
      expect(vb?.daten.vorlageVersion).toBe(2);
      const inVb = vb!.daten.inhalt.abschnitte[1].laufzettel[0];
      expect(inVb.id).toBe(neuId);
      expect(inVb.herkunftId).toBe(v!.daten.inhalt.abschnitte[1].laufzettel[0].id);
      expect(store.abweichungen()).toEqual([]);
      expect(store.geaendert()).toBe(false);
    });

    it('arbeitet gegen den frischen Stand der Vorlage, nicht gegen den geladenen', async () => {
      await abgleichBereit();
      store.laufzettelAendern(store.inhalt()!.abschnitte[0].laufzettel[0].id, {
        lagerort: 'Meins',
      });
      const schluessel = new Set(store.abweichungen().map((a) => a.schluessel));
      // Jemand ändert die Vorlage zwischenzeitlich (anderes Feld).
      const fremd = await vorlagen.ladeVorlage(vorlage.id);
      fremd!.daten.inhalt.anweisungen = 'Fremd';
      await vorlagen.speichereVorlage(fremd!.daten, fremd!.version);

      expect(await store.aufVorlageAnwenden(schluessel)).toBe(true);
      const v = await vorlagen.ladeVorlage(vorlage.id);
      expect(v?.daten.inhalt.anweisungen).toBe('Fremd');
      expect(v?.daten.inhalt.abschnitte[0].laufzettel[0].lagerort).toBe('Meins');
    });

    it('lässt die VB unangetastet, wenn die Vorlage nicht gespeichert werden kann (412)', async () => {
      await abgleichBereit();
      store.laufzettelAendern(store.inhalt()!.abschnitte[0].laufzettel[0].id, {
        lagerort: 'Meins',
      });
      const schluessel = new Set(store.abweichungen().map((a) => a.schluessel));
      const vorher = JSON.stringify(store.entwurf());
      const vbVersion = (await vorbereitungen.ladeVorbereitung(einsatzId))!.version;
      vorlagen.speichereVorlage = () =>
        Promise.reject(new EinsatzplanungKonfliktFehler('Die Vorlage'));

      expect(await store.aufVorlageAnwenden(schluessel)).toBe(false);
      expect(store.vorlageKonflikt()).toBe(true);
      expect(store.speicherFehler()).toContain('zwischenzeitlich geändert');
      expect(JSON.stringify(store.entwurf())).toBe(vorher);
      expect((await vorbereitungen.ladeVorbereitung(einsatzId))!.version).toBe(vbVersion);
      expect(store.kannRueckgaengig()).toBe(true); // nur die Eingabe selbst
    });

    it('lädt die Vorlage nach einem Versionskonflikt über abgleichNeuLaden erneut', async () => {
      await abgleichBereit();
      store.laufzettelAendern(store.inhalt()!.abschnitte[0].laufzettel[0].id, {
        lagerort: 'Meins',
      });
      const schluessel = new Set(store.abweichungen().map((a) => a.schluessel));
      const echt = vorlagen.speichereVorlage.bind(vorlagen);
      vorlagen.speichereVorlage = () =>
        Promise.reject(new EinsatzplanungKonfliktFehler('Die Vorlage'));
      expect(await store.aufVorlageAnwenden(schluessel)).toBe(false);
      expect(store.abweichungen()).toEqual([]);
      vorlagen.speichereVorlage = echt;

      await store.abgleichNeuLaden();

      expect(store.vorlageKonflikt()).toBe(false);
      expect(store.speicherFehler()).toBe('');
      expect(store.speicherZustand()).toBe('ruhig');
      expect(store.abweichungen()).toHaveLength(1);
      expect(store.geaendert()).toBe(true);
    });

    it('meldet eine inzwischen gelöschte Vorlage', async () => {
      await abgleichBereit();
      const stand = await vorlagen.ladeVorlage(vorlage.id);
      await vorlagen.loescheVorlage(vorlage.id, stand!.version);
      expect(await store.aufVorlageAnwenden(new Set())).toBe(false);
      expect(store.vorlageFehlt()).toBe(true);
    });

    it('ist im Modus Vorlage wirkungslos', async () => {
      await store.vorlageLaden(vorlage.id);
      expect(await store.aufVorlageAnwenden(new Set(['x']))).toBe(false);
    });
  });
});
