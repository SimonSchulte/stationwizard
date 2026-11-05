import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { serialisierePepDatei } from '../../services/pep-datei';
import { erzeugeTestplanung } from '../../services/testing/pep-testdaten';
import { ApiPepVorlagenStorage } from '../../storage/api-pep-vorlagen-storage';
import { InMemoryPepVorlagenStorage } from '../../testing/in-memory-einsatzplanung';
import { testPepVorlage } from '../../testing/pep-testdaten';
import { PepVorlagenReiter } from './pep-vorlagen-reiter';

function datei(name: string, text: string) {
  return { name, text: async () => text, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe('PepVorlagenReiter', () => {
  let storage: InMemoryPepVorlagenStorage;
  let fixture: ComponentFixture<PepVorlagenReiter>;
  const bestaetigen = vi.fn();
  const eingabe = vi.fn();
  const dialogOeffnen = vi.fn();
  const meldungen = { fehler: vi.fn(), erfolg: vi.fn(), warnung: vi.fn(), info: vi.fn() };
  const vorlage = testPepVorlage({ titel: 'Sanitätsdienst klein' });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  async function erzeuge(): Promise<void> {
    fixture = TestBed.createComponent(PepVorlagenReiter);
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
    dialogOeffnen.mockReturnValue({ afterClosed: () => of('Gewählter Titel') });
    storage = new InMemoryPepVorlagenStorage();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiPepVorlagenStorage, useValue: storage },
        { provide: DialogDienst, useValue: { bestaetigen, eingabe } },
        { provide: MatDialog, useValue: { open: dialogOeffnen } },
        { provide: MeldungsDienst, useValue: meldungen },
      ],
    });
  });

  it('zeigt ohne Vorlagen einen Leerzustand und die Aktionen', async () => {
    await erzeuge();
    expect(text()).toContain('Noch keine PEP-Vorlage');
    expect(text()).toContain('Hochladen');
    const neu = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href$="/pep-vorlagen/neu"]',
    );
    expect(neu?.textContent).toContain('Neue Vorlage');
  });

  it('listet Vorlagen mit Kennzahlen und lädt die Ansicht erst beim Auswählen', async () => {
    await storage.legeVorlageAn(vorlage);
    const laden = vi.spyOn(storage, 'ladeVorlage');
    await erzeuge();
    expect(text()).toContain('Sanitätsdienst klein');
    expect(text()).toContain('1 Posten · 2 Positionen · Version 1');
    expect(laden).not.toHaveBeenCalled();

    await waehleErste();
    expect(laden).toHaveBeenCalledOnce();
    expect(text()).toContain('Sanitätsstation');
    expect(text()).toContain('Florian Test 1');
    const bearbeiten = (fixture.nativeElement as HTMLElement).querySelector(
      `a[href$="/pep-vorlagen/${vorlage.id}"]`,
    );
    expect(bearbeiten).not.toBeNull();
  });

  it('bewahrt die neuere Auswahl, wenn eine ältere Antwort später eintrifft', async () => {
    const zweite = testPepVorlage({ titel: 'Zweite' });
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

  describe('Umbenennen', () => {
    it('speichert mit der geladenen Version und übernimmt den Titel', async () => {
      eingabe.mockResolvedValue('Neuer Name');
      await storage.legeVorlageAn(vorlage);
      const speichern = vi.spyOn(storage, 'speichereVorlage');
      await erzeuge();
      await waehleErste();
      await fixture.componentInstance.umbenennen();
      expect(speichern).toHaveBeenCalledWith({ ...vorlage, titel: 'Neuer Name' }, '"1"');
      expect(fixture.componentInstance.stand()?.daten.titel).toBe('Neuer Name');
      expect(fixture.componentInstance.stand()?.version).toBe('"2"');
      expect(meldungen.erfolg).toHaveBeenCalledOnce();
      fixture.detectChanges();
      expect(text()).toContain('Neuer Name');
    });

    it('schreibt nichts bei Abbrechen oder unverändertem Titel', async () => {
      await storage.legeVorlageAn(vorlage);
      const speichern = vi.spyOn(storage, 'speichereVorlage');
      await erzeuge();
      await waehleErste();
      eingabe.mockResolvedValueOnce(null);
      await fixture.componentInstance.umbenennen();
      eingabe.mockResolvedValueOnce(vorlage.titel);
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
      expect(text()).toContain('Noch keine PEP-Vorlage');
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

    it('meldet einen Versionskonflikt beim Löschen', async () => {
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
    const planung = erzeugeTestplanung();

    it('zeigt die Vorschau mit den Zahlen der Datei und legt die Vorlage an', async () => {
      await erzeuge();
      const anlegen = vi.spyOn(storage, 'legeVorlageAn');
      await fixture.componentInstance.hochladen(
        datei('plan.pep.json', serialisierePepDatei(planung)),
      );
      const daten = dialogOeffnen.mock.calls[0][1].data;
      expect(daten).toEqual({
        titel: 'Synthetischer Übungsplan',
        posten: 1,
        positionen: 1,
        einsatzkraefte: 1,
      });
      expect(anlegen).toHaveBeenCalledOnce();
      const angelegt = anlegen.mock.calls[0][0];
      expect(angelegt.titel).toBe('Gewählter Titel');
      // Keine Besetzung, keine Einsatzkräfte in der Vorlage.
      expect(angelegt.inhalt.posten[0].positionen[0].einsatzkraftId).toBeNull();
      expect(JSON.stringify(angelegt)).not.toContain('Testperson Nord');
      expect(meldungen.erfolg).toHaveBeenCalledOnce();
      expect(fixture.componentInstance.gewaehlteId()).toBe(angelegt.id);
      expect(fixture.componentInstance.vorlagen()).toHaveLength(1);
    });

    it('speichert nichts, wenn der Dialog abgebrochen wird', async () => {
      dialogOeffnen.mockReturnValue({ afterClosed: () => of(null) });
      await erzeuge();
      const anlegen = vi.spyOn(storage, 'legeVorlageAn');
      await fixture.componentInstance.hochladen(
        datei('plan.pep.json', serialisierePepDatei(planung)),
      );
      expect(anlegen).not.toHaveBeenCalled();
    });

    it('meldet eine ungültige Datei und speichert nichts', async () => {
      await erzeuge();
      const anlegen = vi.spyOn(storage, 'legeVorlageAn');
      await fixture.componentInstance.hochladen(datei('kaputt.json', '{"nichts": true}'));
      await fixture.componentInstance.hochladen(datei('kein.json', 'kein json'));
      expect(meldungen.fehler).toHaveBeenCalledTimes(2);
      expect(dialogOeffnen).not.toHaveBeenCalled();
      expect(anlegen).not.toHaveBeenCalled();
    });

    it('warnt bei abweichender Dateiversion, zeigt aber die Vorschau', async () => {
      await erzeuge();
      const text = serialisierePepDatei(planung).replace('"version": "1.0"', '"version": "9.9"');
      const roh = text.includes('9.9')
        ? text
        : text.replace(/"version":\s*"1\.0"/, '"version":"9.9"');
      await fixture.componentInstance.hochladen(datei('alt.pep.json', roh));
      expect(meldungen.warnung).toHaveBeenCalledOnce();
      expect(dialogOeffnen).toHaveBeenCalledOnce();
    });

    it('meldet einen Speicherfehler', async () => {
      await erzeuge();
      vi.spyOn(storage, 'legeVorlageAn').mockRejectedValue(new Error('Server nicht erreichbar'));
      await fixture.componentInstance.hochladen(
        datei('plan.pep.json', serialisierePepDatei(planung)),
      );
      expect(meldungen.fehler).toHaveBeenCalledWith('Server nicht erreichbar');
      expect(meldungen.erfolg).not.toHaveBeenCalled();
    });
  });
});
