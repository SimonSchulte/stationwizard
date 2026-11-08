import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { VerlassenSchutz } from '../../../kern/verlassen-schutz';
import { ApiEinsatzStorage } from '../../storage/api-einsatz-storage';
import { ApiVbVorlagenStorage } from '../../storage/api-vb-vorlagen-storage';
import { ApiVorbereitungStorage } from '../../storage/api-vorbereitung-storage';
import {
  InMemoryEinsatzStorage,
  InMemoryVbVorlagenStorage,
  InMemoryVorbereitungStorage,
} from '../../testing/in-memory-einsatzplanung';
import {
  testAbschnitt,
  testEinsatz,
  testInhalt,
  testLaufzettel,
  testPosition,
  testVorlage,
} from '../../testing/vb-testdaten';
import { VbDruckDienst } from '../../services/vb-druck';
import { kopiereVorlage } from '../../services/vb-kopie';
import { VbEditorStoreService } from '../../services/vb-editor-store.service';
import { VbEditor } from './vb-editor';

describe('VbEditor', () => {
  let vorlagen: InMemoryVbVorlagenStorage;
  let vorbereitungen: InMemoryVorbereitungStorage;
  let einsaetze: InMemoryEinsatzStorage;
  let meldungen: {
    fehler: ReturnType<typeof vi.fn>;
    warnung: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    erfolg: ReturnType<typeof vi.fn>;
    zeige: ReturnType<typeof vi.fn>;
  };
  let druck: { drucken: ReturnType<typeof vi.fn> };
  let dialogOeffnen: ReturnType<typeof vi.fn>;

  const einsatz = testEinsatz({ titel: 'Weihnachtsmarkt Ummeln' });
  const vorlage = testVorlage({
    titel: 'Standardliste',
    inhalt: testInhalt({
      abschnitte: [
        testAbschnitt({
          titel: 'Betreuung',
          laufzettel: [
            testLaufzettel({ lagerort: 'Lager Nord' }),
            testLaufzettel({ lagerort: 'Halle' }),
          ],
        }),
      ],
    }),
  });

  beforeEach(async () => {
    vorlagen = new InMemoryVbVorlagenStorage();
    vorbereitungen = new InMemoryVorbereitungStorage();
    einsaetze = new InMemoryEinsatzStorage(vorbereitungen);
    const stumm = () => ({ schliessen: () => undefined });
    meldungen = {
      fehler: vi.fn(stumm),
      warnung: vi.fn(stumm),
      info: vi.fn(stumm),
      erfolg: vi.fn(stumm),
      zeige: vi.fn(stumm),
    };
    druck = { drucken: vi.fn().mockResolvedValue(undefined) };
    dialogOeffnen = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'einsatzplanung', pathMatch: 'full', children: [] },
          { path: 'einsatzplanung/vb-vorlagen', children: [] },
          {
            path: 'einsatzplanung/einsatz/:id/vb',
            component: VbEditor,
            data: { modus: 'vorbereitung' },
          },
          {
            path: 'einsatzplanung/vb-vorlagen/:id',
            component: VbEditor,
            data: { modus: 'vorlage' },
          },
        ]),
        { provide: ApiVbVorlagenStorage, useValue: vorlagen },
        { provide: ApiVorbereitungStorage, useValue: vorbereitungen },
        { provide: ApiEinsatzStorage, useValue: einsaetze },
        { provide: MeldungsDienst, useValue: meldungen },
        { provide: VbDruckDienst, useValue: druck },
        { provide: MatDialog, useValue: { open: dialogOeffnen } },
      ],
    });
    // Ein frischer Stand je Test: der Store ist ein Singleton im TestBed und wird hier neu gebaut.
    await einsaetze.legeEinsatzAn(einsatz);
    await vorlagen.legeVorlageAn(vorlage);
  });

  async function vorbereitungSeed(inhalt = vorlage.inhalt, vorlageVersion: number | null = 1) {
    const kopie = kopiereVorlage({ ...vorlage, inhalt }, vorlageVersion ?? 1);
    await vorbereitungen.legeVorbereitungAn(einsatz.id, {
      ...kopie,
      vorlageId: vorlageVersion === null ? null : vorlage.id,
      vorlageVersion,
    });
  }

  async function oeffne(url: string) {
    const harness = await RouterTestingHarness.create();
    const komponente = await harness.navigateByUrl(url, VbEditor);
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { harness, komponente, element: harness.routeNativeElement as HTMLElement };
  }

  function knopf(element: HTMLElement, text: string): HTMLButtonElement | null {
    return (
      [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(text),
      ) ?? null
    );
  }

  it('lädt im Modus Vorbereitung und zeigt Titel, Einsatz und Herkunft', async () => {
    await vorbereitungSeed();
    const { element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    expect(element.querySelector('h1')?.textContent).toBe('Vorbereitung');
    const untertitel = element.querySelector('.untertitel')?.textContent ?? '';
    expect(untertitel).toContain('Weihnachtsmarkt Ummeln');
    expect(untertitel).toContain('Kopie von Vorlage „Standardliste“ (Version 1)');
    expect(element.textContent).toContain('Laufzettel (2)');
    expect(element.querySelectorAll('app-laufzettel-karte').length).toBe(2);
    expect(element.querySelector('app-laufzettel-bearbeitung')).not.toBeNull();
    const zurueck = element.querySelector('a[aria-label="Zurück zur Einsatzübersicht"]');
    expect(zurueck?.getAttribute('href')).toBe('/einsatzplanung');
    expect(element.querySelector('.vorlagentitel')).toBeNull();
  });

  it('zeigt für einen Einsatz ohne Vorbereitung einen Leerzustand', async () => {
    const { element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    expect(element.querySelector('app-leerzustand')?.textContent).toContain(
      'Keine Vorbereitung vorhanden',
    );
    expect(element.querySelector('mat-tab-group')).toBeNull();
  });

  it('lädt im Modus Vorlage mit editierbarem Titel und Zurück zur Vorlagenliste', async () => {
    const { element } = await oeffne(`/einsatzplanung/vb-vorlagen/${vorlage.id}`);
    expect(element.querySelector('h1')?.textContent).toBe('Standardliste');
    const feld = element.querySelector<HTMLInputElement>('.vorlagentitel input')!;
    expect(feld.value).toBe('Standardliste');
    feld.value = 'Neuer Titel';
    feld.dispatchEvent(new Event('input'));
    expect(TestBed.inject(VbEditorStoreService).titel()).toBe('Neuer Titel');
    const zurueck = element.querySelector('a[aria-label="Zurück zu den VB-Vorlagen"]');
    expect(zurueck?.getAttribute('href')).toBe('/einsatzplanung/vb-vorlagen');
  });

  it('beginnt unter „neu“ eine Vorlage und wechselt nach dem Speichern ohne Neuladen auf ihre Id', async () => {
    const { harness, element } = await oeffne('/einsatzplanung/vb-vorlagen/neu');
    const store = TestBed.inject(VbEditorStoreService);
    expect(store.istNeu()).toBe(true);
    expect(element.querySelector('h1')?.textContent).toBe('Neue Vorlage');
    store.abschnittHinzufuegen();
    const vorlageId = store.vorlageId()!;

    knopf(element, 'Speichern')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(await vorlagen.ladeVorlage(vorlageId)).not.toBeNull();
    expect(TestBed.inject(VerlassenSchutz).hatUngesicherteAenderungen()).toBe(false);
    expect(store.istNeu()).toBe(false);
    expect(store.vorlageId()).toBe(vorlageId);
  });

  it('schaltet Speichern erst bei einer Änderung frei und speichert sie', async () => {
    await vorbereitungSeed();
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    const speichern = () => knopf(element, 'Speichern')!;
    expect(speichern().disabled).toBe(true);

    const store = TestBed.inject(VbEditorStoreService);
    store.anweisungenAendern('Treffpunkt 7 Uhr');
    harness.detectChanges();
    expect(speichern().disabled).toBe(false);

    speichern().click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(speichern().disabled).toBe(true);
    expect((await vorbereitungen.ladeVorbereitung(einsatz.id))?.daten.inhalt.anweisungen).toBe(
      'Treffpunkt 7 Uhr',
    );
    expect(meldungen.erfolg).toHaveBeenCalled();
  });

  it('verschiebt einen Laufzettel in den Abschnitt, dessen Titel dem Wert „Auf / In“ entspricht', async () => {
    await vorbereitungSeed({
      anweisungen: '',
      abschnitte: [
        testAbschnitt({ titel: 'Betreuung', laufzettel: [testLaufzettel()] }),
        testAbschnitt({ titel: 'Rollwagen', laufzettel: [] }),
      ],
    });
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    element.querySelector<HTMLElement>('app-laufzettel-karte')!.click();
    harness.detectChanges();
    const feld = [
      ...element.querySelectorAll<HTMLInputElement>('app-laufzettel-bearbeitung input'),
    ].find((i) => i.closest('mat-form-field')?.textContent?.includes('Auf / In'))!;
    feld.value = ' rollwagen ';
    feld.dispatchEvent(new Event('input'));
    harness.detectChanges();
    const abschnitte = TestBed.inject(VbEditorStoreService).inhalt()!.abschnitte;
    expect(abschnitte[0].laufzettel).toHaveLength(0);
    expect(abschnitte[1].laufzettel).toHaveLength(1);
  });

  it('übernimmt eine Eingabe im Reiter „Allgemeine Anweisungen“ mit Zeichenzähler', async () => {
    await vorbereitungSeed();
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    const reiter = [...element.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
      t.textContent?.includes('Allgemeine Anweisungen'),
    )!;
    reiter.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const text = element.querySelector<HTMLTextAreaElement>('textarea')!;
    text.value = 'Hallo';
    text.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(TestBed.inject(VbEditorStoreService).inhalt()?.anweisungen).toBe('Hallo');
    expect(element.textContent).toContain('5 / 6000');
    expect(element.textContent).toContain('eigenes Blatt A4 quer');
  });

  it('filtert die Liste nach der Suche und schaltet dabei das Ziehen ab', async () => {
    await vorbereitungSeed();
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    const suche = element.querySelector<HTMLInputElement>('app-suchfeld input')!;
    suche.value = 'lager nord';
    suche.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(element.querySelectorAll('app-laufzettel-karte').length).toBe(1);
    expect(element.textContent).toContain('Umsortieren per Ziehen ausgeschaltet');
    expect(element.querySelector('.abschnitt.cdk-drag-disabled')).not.toBeNull();

    suche.value = 'gibt es nicht';
    suche.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(element.textContent).toContain('Keine Treffer');
  });

  describe('Abschnitte ein- und ausklappen', () => {
    function karten(element: HTMLElement): number {
      return element.querySelectorAll('app-laufzettel-karte').length;
    }

    it('klappt einen Abschnitt über seinen Kopf ein und wieder auf', async () => {
      await vorbereitungSeed();
      const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
      const umschalter = element.querySelector<HTMLButtonElement>('.abschnitt-kopf .umschalter')!;
      expect(umschalter.getAttribute('aria-expanded')).toBe('true');
      expect(karten(element)).toBe(2);

      umschalter.click();
      harness.detectChanges();
      expect(karten(element)).toBe(0);
      expect(umschalter.getAttribute('aria-expanded')).toBe('false');

      umschalter.click();
      harness.detectChanges();
      expect(karten(element)).toBe(2);
    });

    it('klappt alle Abschnitte gemeinsam ein und auf', async () => {
      await vorbereitungSeed();
      const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
      element
        .querySelector<HTMLButtonElement>('button[aria-label="Alle Abschnitte einklappen"]')!
        .click();
      harness.detectChanges();
      expect(karten(element)).toBe(0);

      element
        .querySelector<HTMLButtonElement>('button[aria-label="Alle Abschnitte aufklappen"]')!
        .click();
      harness.detectChanges();
      expect(karten(element)).toBe(2);
    });

    it('zeigt beim Suchen auch Treffer aus eingeklappten Abschnitten', async () => {
      await vorbereitungSeed();
      const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
      element.querySelector<HTMLButtonElement>('.abschnitt-kopf .umschalter')!.click();
      harness.detectChanges();
      expect(karten(element)).toBe(0);

      const suche = element.querySelector<HTMLInputElement>('app-suchfeld input')!;
      suche.value = 'lager nord';
      suche.dispatchEvent(new Event('input'));
      harness.detectChanges();
      expect(karten(element)).toBe(1);
    });

    it('klappt einen Abschnitt auf, wenn darin ein Laufzettel angelegt wird', async () => {
      await vorbereitungSeed();
      const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
      element.querySelector<HTMLButtonElement>('.abschnitt-kopf .umschalter')!.click();
      harness.detectChanges();
      element.querySelector<HTMLButtonElement>('.abschnitt-kopf .abschnitt-plus')!.click();
      harness.detectChanges();
      expect(karten(element)).toBe(3);
    });
  });

  it('wählt einen Laufzettel und schreibt Feldänderungen in den Store', async () => {
    await vorbereitungSeed();
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    const karten = element.querySelectorAll<HTMLElement>('app-laufzettel-karte .karte');
    karten[1].click();
    harness.detectChanges();
    expect(karten[1].getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('app-laufzettel-bearbeitung .nummer')?.textContent).toBe('2');

    const store = TestBed.inject(VbEditorStoreService);
    const lagerort = [
      ...element.querySelectorAll<HTMLInputElement>('app-laufzettel-bearbeitung input'),
    ].find((i) => i.value === 'Halle')!;
    lagerort.value = 'Halle 3';
    lagerort.dispatchEvent(new Event('input'));
    expect(store.inhalt()?.abschnitte[0].laufzettel[1].lagerort).toBe('Halle 3');
  });

  it('druckt auch mit zu vollen Laufzetteln (die Warnung kommt aus dem Druckdienst)', async () => {
    const voll = testLaufzettel({
      positionen: Array.from({ length: 25 }, () => testPosition({ material: 'Kabel' })),
    });
    await vorbereitungSeed(testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [voll] })] }));
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);

    knopf(element, 'Drucken')!.click();
    await harness.fixture.whenStable();

    expect(meldungen.warnung).not.toHaveBeenCalled();
    expect(druck.drucken).toHaveBeenCalledTimes(1);
    expect(druck.drucken.mock.calls[0][0]).toMatchObject({
      titel: 'Weihnachtsmarkt Ummeln',
      ort: 'Ummeln',
    });
  });

  it('warnt beim Drucken ohne volle Laufzettel nicht', async () => {
    await vorbereitungSeed();
    const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    knopf(element, 'Drucken')!.click();
    await harness.fixture.whenStable();
    expect(meldungen.warnung).not.toHaveBeenCalled();
    expect(druck.drucken).toHaveBeenCalledTimes(1);
  });

  describe('Abgleich mit der Vorlage', () => {
    it('zeigt die Abweichungen und wendet die im Dialog gewählten Schlüssel an', async () => {
      await vorbereitungSeed();
      const { harness, element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
      const store = TestBed.inject(VbEditorStoreService);
      await store.abgleichVorlageLaden();
      store.laufzettelAendern(store.inhalt()!.abschnitte[0].laufzettel[0].id, { lagerort: 'Neu' });
      store.laufzettelAendern(store.inhalt()!.abschnitte[0].laufzettel[1].id, { lagerort: 'Auch' });
      harness.detectChanges();

      expect(element.querySelector('.abgleich-hinweis')?.textContent).toContain(
        '2 Abweichungen von der Vorlage',
      );
      expect(element.querySelectorAll('.marke').length).toBe(2);

      const wahl = [store.abweichungen()[0].schluessel];
      dialogOeffnen.mockReturnValue({ afterClosed: () => of(wahl) });
      knopf(element, 'Auf Vorlage anwenden')!.click();
      await harness.fixture.whenStable();

      const daten = dialogOeffnen.mock.calls[0][1].data;
      expect(daten.vorlageTitel).toBe('Standardliste');
      expect(daten.aenderungen).toHaveLength(2);
      const gespeichert = await vorlagen.ladeVorlage(vorlage.id);
      const lagerorte = gespeichert!.daten.inhalt.abschnitte[0].laufzettel.map((l) => l.lagerort);
      expect(lagerorte).toContain('Neu');
      expect(lagerorte).not.toContain('Auch');
      expect(meldungen.erfolg).toHaveBeenCalledWith('1 Änderung auf die Vorlage übertragen.');
    });

    it('zeigt ohne Abweichungen keinen Hinweis', async () => {
      await vorbereitungSeed();
      const { element } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
      await TestBed.inject(VbEditorStoreService).abgleichVorlageLaden();
      expect(element.querySelector('.abgleich-hinweis')).toBeNull();
    });
  });

  it('löscht die Vorbereitung erst nach Bestätigung', async () => {
    await vorbereitungSeed();
    const { harness, komponente } = await oeffne(`/einsatzplanung/einsatz/${einsatz.id}/vb`);
    const bestaetigen = vi
      .spyOn(TestBed.inject(DialogDienst), 'bestaetigen')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const lauf = komponente as unknown as { loeschen(): Promise<void> };
    await lauf.loeschen();
    expect(await vorbereitungen.ladeVorbereitung(einsatz.id)).not.toBeNull();
    await lauf.loeschen();
    expect(bestaetigen).toHaveBeenCalledTimes(2);
    expect(await vorbereitungen.ladeVorbereitung(einsatz.id)).toBeNull();
    expect(harness.fixture).toBeTruthy();
  });
});
