import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { VerlassenSchutz } from '../../../kern/verlassen-schutz';
import { AufbauDruckDienst } from '../../services/aufbau-druck';
import { AufbauEditorStoreService } from '../../services/aufbau-editor-store.service';
import { ApiAufbauStorage, ApiAufbauVorlagenStorage } from '../../storage/api-aufbau-storage';
import { ApiEinsatzStorage } from '../../storage/api-einsatz-storage';
import { ApiStammdatenStorage } from '../../storage/api-stammdaten-storage';
import { testAufbau, testAufbauInhalt, testEinheit, testId } from '../../testing/aufbau-testdaten';
import {
  InMemoryAufbauStorage,
  InMemoryAufbauVorlagenStorage,
} from '../../testing/in-memory-aufbau';
import { InMemoryEinsatzStorage } from '../../testing/in-memory-einsatzplanung';
import { InMemoryStammdatenStorage } from '../../testing/in-memory-stammdaten-storage';
import {
  erzeugeTestArtikel,
  erzeugeTestKiste,
  erzeugeTestLager,
} from '../../testing/stammdaten-testdaten';
import { testEinsatz } from '../../testing/vb-testdaten';
import { AufbauEditor } from './aufbau-editor';

describe('AufbauEditor', () => {
  let aufbauten: InMemoryAufbauStorage;
  let vorlagen: InMemoryAufbauVorlagenStorage;
  let einsaetze: InMemoryEinsatzStorage;
  let stammdaten: InMemoryStammdatenStorage;
  let druck: { drucken: ReturnType<typeof vi.fn>; herunterladen: ReturnType<typeof vi.fn> };
  let meldungen: Record<
    'fehler' | 'warnung' | 'info' | 'erfolg' | 'zeige',
    ReturnType<typeof vi.fn>
  >;
  const einsatz = testEinsatz({ titel: 'Stadtfest' });
  const halle = erzeugeTestLager({ name: 'Halle A', reihenfolge: 1 });
  const wasser = erzeugeTestArtikel({ name: 'Trinkwasser', einheit: 'Liter', lagerId: halle.id });
  const kiste = erzeugeTestKiste({
    name: 'Verbandkiste',
    lagerId: halle.id,
    inhalt: [{ artikelId: wasser.id, menge: 3, bemerkung: '' }],
  });

  beforeEach(async () => {
    aufbauten = new InMemoryAufbauStorage();
    vorlagen = new InMemoryAufbauVorlagenStorage();
    einsaetze = new InMemoryEinsatzStorage();
    stammdaten = new InMemoryStammdatenStorage();
    stammdaten._vorbelegen([halle], [wasser], [kiste]);
    druck = {
      drucken: vi.fn().mockResolvedValue(undefined),
      herunterladen: vi.fn().mockResolvedValue(undefined),
    };
    const stumm = () => ({ schliessen: () => undefined });
    meldungen = {
      fehler: vi.fn(stumm),
      warnung: vi.fn(stumm),
      info: vi.fn(stumm),
      erfolg: vi.fn(stumm),
      zeige: vi.fn(stumm),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'einsatzplanung', pathMatch: 'full', children: [] },
          {
            path: 'einsatzplanung/einsatz/:id/aufbau',
            component: AufbauEditor,
            data: { modus: 'aufbau' },
          },
          {
            path: 'einsatzplanung/aufbau-vorlagen/:id',
            component: AufbauEditor,
            data: { modus: 'vorlage' },
          },
        ]),
        { provide: ApiAufbauStorage, useValue: aufbauten },
        { provide: ApiAufbauVorlagenStorage, useValue: vorlagen },
        { provide: ApiEinsatzStorage, useValue: einsaetze },
        { provide: ApiStammdatenStorage, useValue: stammdaten },
        { provide: MeldungsDienst, useValue: meldungen },
        { provide: AufbauDruckDienst, useValue: druck },
        { provide: DialogDienst, useValue: { bestaetigen: vi.fn().mockResolvedValue(true) } },
      ],
    });
    await einsaetze.legeEinsatzAn(einsatz);
  });

  async function oeffne(url: string) {
    const harness = await RouterTestingHarness.create();
    const komponente = await harness.navigateByUrl(url, AufbauEditor);
    await harness.fixture.whenStable();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { harness, komponente, element: harness.routeNativeElement as HTMLElement };
  }

  const knopf = (element: HTMLElement, text: string) =>
    [...element.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  it('bietet ohne Aufbau „leer beginnen“ an und legt ihn an', async () => {
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/aufbau`);
    expect(element.textContent).toContain('Noch kein Aufbau');
    knopf(element, 'Leer beginnen')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(await aufbauten.ladeAufbau(einsatz.id)).not.toBeNull();
    expect(element.textContent).toContain('Noch keine Fahrzeuge oder Wagen');
    expect(meldungen['erfolg']).toHaveBeenCalledWith('Aufbau angelegt.');
  });

  it('bietet eine Vorlage an und kopiert sie', async () => {
    await vorlagen.legeVorlageAn({
      id: testId(5),
      titel: 'Standard',
      inhalt: testAufbauInhalt([testEinheit({ name: 'Rollwagen 03' })]),
    });
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/aufbau`);
    knopf(element, 'Aus „Standard“')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(element.textContent).toContain('Rollwagen 03');
    expect((await aufbauten.ladeAufbau(einsatz.id))?.daten.vorlageId).toBe(testId(5));
  });

  it('zeigt Packliste, Zettel und Prüfung eines vorhandenen Aufbaus und speichert Änderungen', async () => {
    aufbauten._vorbelegen(
      einsatz.id,
      testAufbau(testAufbauInhalt([testEinheit({ name: 'Wagen 1' })])),
    );
    const { harness, komponente, element } = await oeffne(
      `/einsatzplanung/einsatz/${einsatz.id}/aufbau`,
    );
    expect(element.textContent).toContain('Stadtfest');
    expect(element.querySelector('app-aufbau-baum')).not.toBeNull();
    expect(element.querySelector('app-zettel-vorschau')?.textContent).toContain('Wagen 1');
    // Leere Einheit ohne Foto: zwei Hinweise in der Prüfung.
    expect(element.textContent).toContain('Wagen 1 ist leer.');
    expect(knopf(element, 'Speichern')!.disabled).toBe(true);

    const store = TestBed.inject(AufbauEditorStoreService);
    const eintrag = element.querySelector('app-einheit-detail');
    expect(eintrag).not.toBeNull();
    // Kiste aus den Stammdaten hinzufügen (Ausgabe des Detailbausteins).
    const einheitId = store.inhalt()!.einheiten[0]!.id;
    (komponente as unknown as { kisteHinzugefuegt(a: string, b: string): void }).kisteHinzugefuegt(
      einheitId,
      kiste.id,
    );
    harness.detectChanges();
    expect(store.geaendert()).toBe(true);
    expect(element.querySelector('app-zettel-vorschau')?.textContent).toContain('1× Verbandkiste');
    expect(komponente.hatUngespeichertes()).toBe(true);

    knopf(element, 'Speichern')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(store.geaendert()).toBe(false);
    const gespeichert = await aufbauten.ladeAufbau(einsatz.id);
    expect(gespeichert?.daten.inhalt.einheiten[0]?.inhalt).toHaveLength(1);
    expect(gespeichert?.version).toBe('"2"');
  });

  it('meldet eine fehlende Aufbau-Vorlage als nicht gefunden', async () => {
    const fehlt = await oeffne(`/einsatzplanung/aufbau-vorlagen/${testId(77)}`);
    expect(fehlt.element.textContent).toContain('Vorlage nicht gefunden');
  });

  it('legt eine neue Vorlage mit Titel an', async () => {
    const { harness, komponente, element } = await oeffne('/einsatzplanung/aufbau-vorlagen/neu');
    expect(element.querySelector('input[required]')).not.toBeNull();
    const store = TestBed.inject(AufbauEditorStoreService);
    store.titelSetzen('Sanitätsdienst Standard');
    harness.detectChanges();
    expect(komponente.hatUngespeichertes()).toBe(true);
    store.aendern({ anweisungen: 'Bitte zuerst Halle A', einheiten: [] });
    harness.detectChanges();
    knopf(element, 'Speichern')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(await vorlagen.ladeVorlagen()).toHaveLength(1);
  });

  it('meldet ungespeicherte Änderungen am VerlassenSchutz', async () => {
    aufbauten._vorbelegen(einsatz.id, testAufbau());
    const { komponente } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/aufbau`);
    const schutz = TestBed.inject(VerlassenSchutz);
    expect(schutz.hatUngesicherteAenderungen()).toBe(false);
    TestBed.inject(AufbauEditorStoreService).aendern({ anweisungen: 'x', einheiten: [] });
    expect(komponente.hatUngespeichertes()).toBe(true);
    expect(schutz.hatUngesicherteAenderungen()).toBe(true);
  });

  it('druckt mit Einsatz im Kopf und meldet Fehler des Drucks', async () => {
    aufbauten._vorbelegen(
      einsatz.id,
      testAufbau(testAufbauInhalt([testEinheit({ name: 'Wagen 1' })])),
    );
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/aufbau`);

    knopf(element, 'Drucken')!.click();
    await harness.fixture.whenStable();
    expect(druck.drucken).toHaveBeenCalledTimes(1);
    const [kopf, inhalt, daten] = druck.drucken.mock.calls[0]!;
    expect(kopf).toMatchObject({ titel: 'Stadtfest' });
    expect(inhalt.einheiten[0].name).toBe('Wagen 1');
    expect(daten.lager.map((l: { name: string }) => l.name)).toEqual(['Halle A']);

    druck.drucken.mockRejectedValueOnce(new Error('Kaputt'));
    knopf(element, 'Drucken')!.click();
    await harness.fixture.whenStable();
    expect(meldungen['fehler']).toHaveBeenCalledWith('Kaputt');
  });
});
