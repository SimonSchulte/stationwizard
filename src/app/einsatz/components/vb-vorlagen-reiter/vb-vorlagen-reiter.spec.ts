import * as XLSX from '@e965/xlsx';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
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
import { VbVorlagenReiter } from './vb-vorlagen-reiter';

/** Erfundene Packliste in der Struktur der echten, Daten eine Spalte rechts der Kopfzeile. */
function excelDatei(name: string, zeilen: unknown[][]) {
  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, XLSX.utils.aoa_to_sheet(zeilen), 'Blatt1');
  const daten = XLSX.write(mappe, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return { name, text: async () => '', arrayBuffer: async () => daten };
}

const KOPF = [
  'LdfNr',
  'Anzahl',
  'erl.',
  'Material',
  'Lagerort',
  'Transport mit',
  'Ansprechpartner',
];
const PACKLISTE: unknown[][] = [
  KOPF,
  ['', 1, 2, '', 'Propanflaschen', 'Lager Nord', 'Rollwagen', 'GF Betreuung'],
  ['', 2, '', '', 'Suppe', 'Lager Nord', 'Rollwagen', 'GF Betreuung'],
  ['', 3, 4, '', 'Tische', 'Garage', 'Gitterwagen', 'GF TeSi'],
];

describe('VbVorlagenReiter', () => {
  let storage: InMemoryVbVorlagenStorage;
  let fixture: ComponentFixture<VbVorlagenReiter>;
  const bestaetigen = vi.fn();
  const eingabe = vi.fn();
  const drucken = vi.fn();
  const dialogOeffnen = vi.fn();
  const meldungen = { fehler: vi.fn(), erfolg: vi.fn(), warnung: vi.fn(), info: vi.fn() };

  const vorlage = testVorlage({
    titel: 'Weihnachtsmarkt',
    inhalt: testInhalt({
      anweisungen: 'Treffpunkt 8 Uhr',
      abschnitte: [
        testAbschnitt({
          titel: 'Rollwagen',
          laufzettel: [
            testLaufzettel({
              lagerort: 'Lager Nord',
              positionen: [testPosition({ anzahl: '2', material: 'Propanflaschen' })],
            }),
            testLaufzettel({ lagerort: 'Keller' }),
          ],
        }),
      ],
    }),
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  async function erzeuge(): Promise<void> {
    fixture = TestBed.createComponent(VbVorlagenReiter);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function waehleErste(): Promise<void> {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.vorlage')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    dialogOeffnen.mockReturnValue({ afterClosed: () => of('Packliste Markt') });
    storage = new InMemoryVbVorlagenStorage();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiVbVorlagenStorage, useValue: storage },
        { provide: DialogDienst, useValue: { bestaetigen, eingabe } },
        { provide: MatDialog, useValue: { open: dialogOeffnen } },
        { provide: VbDruckDienst, useValue: { drucken } },
        { provide: MeldungsDienst, useValue: meldungen },
      ],
    });
  });

  it('zeigt ohne Vorlagen einen Leerzustand und die Aktionen', async () => {
    await erzeuge();
    expect(text()).toContain('Noch keine VB-Vorlage');
    expect(text()).toContain('Vorlage auswählen');
    expect(text()).toContain('Hochladen');
    const neu = (fixture.nativeElement as HTMLElement).querySelector('a[href$="/vb-vorlagen/neu"]');
    expect(neu?.textContent).toContain('Neue Vorlage');
  });

  it('listet Vorlagen mit Kennzahlen und lädt die Ansicht erst beim Auswählen', async () => {
    await storage.legeVorlageAn(vorlage);
    const laden = vi.spyOn(storage, 'ladeVorlage');
    await erzeuge();
    expect(text()).toContain('Weihnachtsmarkt');
    expect(text()).toContain('2 Laufzettel · 2 Positionen · Version 1');
    expect(laden).not.toHaveBeenCalled();

    await waehleErste();
    expect(laden).toHaveBeenCalledOnce();
    expect(text()).toContain('2× Propanflaschen');
    expect(text()).toContain('Keller');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(`a[href$="/vb-vorlagen/${vorlage.id}"]`),
    ).not.toBeNull();
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

  describe('Umbenennen', () => {
    it('speichert mit der geladenen Version und übernimmt den Titel', async () => {
      eingabe.mockResolvedValue('Neuer Name');
      await storage.legeVorlageAn(vorlage);
      const speichern = vi.spyOn(storage, 'speichereVorlage');
      await erzeuge();
      await waehleErste();
      await fixture.componentInstance.umbenennen();
      expect(speichern).toHaveBeenCalledWith({ ...vorlage, titel: 'Neuer Name' }, '"1"');
      expect(fixture.componentInstance.stand()?.version).toBe('"2"');
      expect(meldungen.erfolg).toHaveBeenCalledOnce();
      fixture.detectChanges();
      expect(text()).toContain('Neuer Name');
    });

    it('schreibt nichts bei Abbrechen', async () => {
      eingabe.mockResolvedValue(null);
      await storage.legeVorlageAn(vorlage);
      const speichern = vi.spyOn(storage, 'speichereVorlage');
      await erzeuge();
      await waehleErste();
      await fixture.componentInstance.umbenennen();
      expect(speichern).not.toHaveBeenCalled();
    });

    it('meldet einen Versionskonflikt und lädt den aktuellen Stand', async () => {
      eingabe.mockResolvedValue('Neuer Name');
      await storage.legeVorlageAn(vorlage);
      await erzeuge();
      await waehleErste();
      await storage.speichereVorlage({ ...vorlage, titel: 'Von anderer Hand' }, '"1"');
      await fixture.componentInstance.umbenennen();
      expect(meldungen.erfolg).not.toHaveBeenCalled();
      expect(meldungen.fehler).toHaveBeenCalledOnce();
      expect(fixture.componentInstance.stand()?.daten.titel).toBe('Von anderer Hand');
    });
  });

  describe('Löschen', () => {
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
      await storage.speichereVorlage({ ...vorlage, titel: 'Geändert' }, '"1"');
      await fixture.componentInstance.loeschen();
      expect(meldungen.erfolg).not.toHaveBeenCalled();
      expect(meldungen.fehler).toHaveBeenCalledOnce();
      expect(fixture.componentInstance.stand()?.daten.titel).toBe('Geändert');
    });
  });

  describe('Hochladen', () => {
    it('liest die Excel-Datei, zeigt die Vorschau und legt die Vorlage an', async () => {
      await erzeuge();
      const anlegen = vi.spyOn(storage, 'legeVorlageAn');
      await fixture.componentInstance.hochladen(excelDatei('Packliste_Markt.xlsx', PACKLISTE));
      const daten = dialogOeffnen.mock.calls[0][1].data;
      expect(daten.titel).toBe('Packliste Markt');
      expect(daten.ergebnis.zeilen).toBe(3);
      expect(anlegen).toHaveBeenCalledOnce();
      const angelegt = anlegen.mock.calls[0][0];
      expect(angelegt.titel).toBe('Packliste Markt');
      expect(angelegt.inhalt.abschnitte.map((a) => a.titel)).toEqual(['Rollwagen', 'Gitterwagen']);
      expect(meldungen.erfolg).toHaveBeenCalledOnce();
      expect(fixture.componentInstance.gewaehlteId()).toBe(angelegt.id);
    });

    it('speichert nichts, wenn der Dialog abgebrochen wird', async () => {
      dialogOeffnen.mockReturnValue({ afterClosed: () => of(null) });
      await erzeuge();
      const anlegen = vi.spyOn(storage, 'legeVorlageAn');
      await fixture.componentInstance.hochladen(excelDatei('x.xlsx', PACKLISTE));
      expect(anlegen).not.toHaveBeenCalled();
    });

    it('speichert nichts, wenn die Vorabprüfung Probleme meldet', async () => {
      await erzeuge();
      const anlegen = vi.spyOn(storage, 'legeVorlageAn');
      const zuLang = 'x'.repeat(250);
      await fixture.componentInstance.hochladen(
        excelDatei('x.xlsx', [KOPF, ['', 1, 1, '', zuLang, 'Lager', 'Wagen', 'GF TeSi']]),
      );
      expect(anlegen).not.toHaveBeenCalled();
    });

    it('meldet eine Datei ohne Kopfzeile und speichert nichts', async () => {
      await erzeuge();
      const anlegen = vi.spyOn(storage, 'legeVorlageAn');
      await fixture.componentInstance.hochladen(
        excelDatei('x.xlsx', [
          ['a', 'b'],
          [1, 2],
        ]),
      );
      expect(meldungen.fehler).toHaveBeenCalledOnce();
      expect(dialogOeffnen).not.toHaveBeenCalled();
      expect(anlegen).not.toHaveBeenCalled();
    });

    it('meldet eine unlesbare Datei', async () => {
      await erzeuge();
      await fixture.componentInstance.hochladen({
        name: 'kaputt.xlsx',
        text: async () => '',
        arrayBuffer: async () => new TextEncoder().encode('kein excel').buffer as ArrayBuffer,
      });
      expect(meldungen.fehler).toHaveBeenCalledOnce();
      expect(dialogOeffnen).not.toHaveBeenCalled();
    });

    it('meldet einen Speicherfehler', async () => {
      await erzeuge();
      vi.spyOn(storage, 'legeVorlageAn').mockRejectedValue(new Error('Server nicht erreichbar'));
      await fixture.componentInstance.hochladen(excelDatei('x.xlsx', PACKLISTE));
      expect(meldungen.fehler).toHaveBeenCalledWith('Server nicht erreichbar');
      expect(meldungen.erfolg).not.toHaveBeenCalled();
    });
  });
});
