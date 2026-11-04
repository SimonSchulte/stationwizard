import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { VbDruckDienst } from '../../services/vb-druck';
import { ApiVbVorlagenStorage } from '../../storage/api-vb-vorlagen-storage';
import { InMemoryVbVorlagenStorage } from '../../testing/in-memory-einsatzplanung';
import {
  testAbschnitt,
  testInhalt,
  testLaufzettel,
  testPosition,
  testVorlage,
} from '../../testing/vb-testdaten';
import { VbVorlagen, materialKurztext } from './vb-vorlagen';

describe('materialKurztext', () => {
  it('verbindet Anzahl und Material, leere Anzahl bleibt ohne „×“', () => {
    expect(
      materialKurztext([
        testPosition({ anzahl: '2', material: 'Propanflaschen' }),
        testPosition({ anzahl: '', material: 'Suppe' }),
        testPosition({ anzahl: ' 5 ', material: 'Servietten' }),
      ]),
    ).toBe('2× Propanflaschen, Suppe, 5× Servietten');
  });
});

describe('VbVorlagen', () => {
  let storage: InMemoryVbVorlagenStorage;
  let fixture: ComponentFixture<VbVorlagen>;
  const bestaetigen = vi.fn();
  const drucken = vi.fn();
  const meldungen = { fehler: vi.fn(), erfolg: vi.fn(), warnung: vi.fn(), info: vi.fn() };

  const vorlage = testVorlage({
    titel: 'Weihnachtsmarkt',
    inhalt: testInhalt({
      anweisungen: 'Treffpunkt 8 Uhr',
      abschnitte: [
        testAbschnitt({
          titel: 'GF Betreuung',
          laufzettel: [
            testLaufzettel({
              lagerort: 'Lager Nord',
              positionen: [testPosition({ anzahl: '2', material: 'Propanflaschen' })],
            }),
            testLaufzettel({ lagerort: 'Keller' }),
          ],
        }),
        testAbschnitt({
          titel: 'GF TeSi',
          farbe: 'abschnitt-2',
          fachgruppe: 'tesi',
          laufzettel: [testLaufzettel({ lagerort: 'Garage' })],
        }),
      ],
    }),
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  async function erzeuge(): Promise<void> {
    fixture = TestBed.createComponent(VbVorlagen);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function waehleErste(): Promise<void> {
    const knopf = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.vorlage');
    knopf?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new InMemoryVbVorlagenStorage();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiVbVorlagenStorage, useValue: storage },
        { provide: DialogDienst, useValue: { bestaetigen } },
        { provide: VbDruckDienst, useValue: { drucken } },
        { provide: MeldungsDienst, useValue: meldungen },
      ],
    });
  });

  it('zeigt ohne Vorlagen einen Leerzustand', async () => {
    await erzeuge();
    expect(text()).toContain('Noch keine VB-Vorlage');
    expect(text()).toContain('Vorlage auswählen');
  });

  it('listet Vorlagen mit Kennzahlen und lädt die Ansicht erst beim Auswählen', async () => {
    await storage.legeVorlageAn(vorlage);
    const laden = vi.spyOn(storage, 'ladeVorlage');
    await erzeuge();
    expect(text()).toContain('Weihnachtsmarkt');
    expect(text()).toContain('3 Laufzettel · 3 Positionen · Version 1');
    expect(laden).not.toHaveBeenCalled();

    await waehleErste();
    expect(laden).toHaveBeenCalledOnce();
    expect(text()).toContain('GF Betreuung');
    expect(text()).toContain('GF TeSi');
    expect(text()).toContain('2× Propanflaschen');
    expect(text()).toContain('Lager Nord');
    expect(text()).toContain('Garage');
  });

  it('nummeriert die Laufzettel fortlaufend über die Abschnitte', async () => {
    await storage.legeVorlageAn(vorlage);
    await erzeuge();
    await waehleErste();
    const nummern = [...(fixture.nativeElement as HTMLElement).querySelectorAll('td.nr')].map((e) =>
      e.textContent?.trim(),
    );
    expect(nummern).toEqual(['1', '2', '3']);
  });

  it('zeigt die Anweisungen nur als Panel, wenn welche vorhanden sind', async () => {
    await storage.legeVorlageAn(vorlage);
    await storage.legeVorlageAn(
      testVorlage({ titel: 'Ohne Text', inhalt: testInhalt({ anweisungen: '' }) }),
    );
    await erzeuge();
    const knoepfe = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '.vorlage',
    );
    // alphabetisch: „Ohne Text“ vor „Weihnachtsmarkt“
    knoepfe[0].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).not.toContain('Allgemeine Anweisungen');
    knoepfe[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('Allgemeine Anweisungen');
  });

  it('druckt mit dem Vorlagentitel und ohne Zeitangaben', async () => {
    await storage.legeVorlageAn(vorlage);
    await erzeuge();
    await waehleErste();
    await fixture.componentInstance.drucken();
    expect(drucken).toHaveBeenCalledWith(
      { titel: 'Weihnachtsmarkt', beginn: null, ende: null, ort: null },
      vorlage.inhalt,
    );
  });

  it('meldet einen fehlgeschlagenen Druck', async () => {
    drucken.mockRejectedValue(new Error('x'));
    await storage.legeVorlageAn(vorlage);
    await erzeuge();
    await waehleErste();
    await fixture.componentInstance.drucken();
    expect(meldungen.fehler).toHaveBeenCalledOnce();
  });

  it('löscht nach Bestätigung mit der geladenen Version', async () => {
    bestaetigen.mockResolvedValue(true);
    await storage.legeVorlageAn(vorlage);
    const loeschen = vi.spyOn(storage, 'loescheVorlage');
    await erzeuge();
    await waehleErste();
    await fixture.componentInstance.loeschen();
    expect(loeschen).toHaveBeenCalledWith(vorlage.id, '"1"');
    expect(meldungen.erfolg).toHaveBeenCalledOnce();
    fixture.detectChanges();
    expect(text()).toContain('Noch keine VB-Vorlage');
    expect(fixture.componentInstance.stand()).toBeNull();
  });

  it('löscht ohne Bestätigung nichts', async () => {
    bestaetigen.mockResolvedValue(false);
    await storage.legeVorlageAn(vorlage);
    const loeschen = vi.spyOn(storage, 'loescheVorlage');
    await erzeuge();
    await waehleErste();
    await fixture.componentInstance.loeschen();
    expect(loeschen).not.toHaveBeenCalled();
  });

  it('meldet einen Versionskonflikt beim Löschen und lädt den aktuellen Stand', async () => {
    bestaetigen.mockResolvedValue(true);
    await storage.legeVorlageAn(vorlage);
    await erzeuge();
    await waehleErste();
    // Jemand anderes speichert zwischenzeitlich.
    await storage.speichereVorlage({ ...vorlage, titel: 'Geändert' }, '"1"');
    await fixture.componentInstance.loeschen();
    expect(meldungen.erfolg).not.toHaveBeenCalled();
    expect(meldungen.fehler).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.stand()?.daten.titel).toBe('Geändert');
  });

  it('bewahrt die neuere Auswahl, wenn eine ältere Antwort später eintrifft', async () => {
    const zweite = testVorlage({ titel: 'Zweite' });
    await storage.legeVorlageAn(vorlage);
    await storage.legeVorlageAn(zweite);
    await erzeuge();
    const komponente = fixture.componentInstance;
    const erste = komponente.waehlen(vorlage.id);
    await komponente.waehlen(zweite.id);
    await erste;
    expect(komponente.gewaehlteId()).toBe(zweite.id);
    expect(komponente.stand()?.daten.titel).toBe('Zweite');
  });
});
