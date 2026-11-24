import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../kern/zustand/meldungs-dienst';
import { SystemkonfigurationStoreService } from '../../systemkonfiguration/services/systemkonfiguration-store.service';
import { testDarstellung, testStand } from '../testing/vorgang-testdaten';
import { SchadensmeldungPdfService } from './schadensmeldung-pdf.service';
import { VorgangStoreService } from './vorgang-store.service';
import { VorgangVersandService, alsBase64 } from './vorgang-versand.service';

describe('VorgangVersandService', () => {
  const dialog = { open: vi.fn() };
  const hinweise = { hinweis: vi.fn().mockResolvedValue(undefined) };
  const meldungen = { erfolg: vi.fn(), fehler: vi.fn(), warnung: vi.fn() };
  const pdf = { erzeuge: vi.fn() };
  const store = {
    aktuell: signal(testStand()),
    ungespeichert: signal(false),
    senden: vi.fn(),
    aktionFehler: signal('Fehlertext'),
  };
  const konfiguration = {
    laden: vi.fn().mockResolvedValue(undefined),
    gespeicherteEinstellungen: signal<{ vorgangEmpfaenger: string } | null>({
      vorgangEmpfaenger: 'a@example.test, b@example.test',
    }),
  };
  let dienst: VorgangVersandService;

  beforeEach(() => {
    vi.clearAllMocks();
    store.aktuell.set(testStand());
    store.ungespeichert.set(false);
    konfiguration.gespeicherteEinstellungen.set({
      vorgangEmpfaenger: 'a@example.test, b@example.test',
    });
    pdf.erzeuge.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    dialog.open.mockReturnValue({
      afterClosed: () => of({ empfaenger: ['a@example.test'], angebote: [], nachricht: '' }),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: VorgangStoreService, useValue: store },
        { provide: MatDialog, useValue: dialog },
        { provide: DialogDienst, useValue: hinweise },
        { provide: SystemkonfigurationStoreService, useValue: konfiguration },
        { provide: SchadensmeldungPdfService, useValue: pdf },
        { provide: MeldungsDienst, useValue: meldungen },
      ],
    });
    dienst = TestBed.inject(VorgangVersandService);
  });

  it('verlangt zuerst das Speichern ungesicherter Änderungen', async () => {
    store.ungespeichert.set(true);
    expect(await dienst.senden()).toBe(false);
    expect(meldungen.warnung).toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('weist ohne festgelegte Empfänger darauf hin und öffnet keinen Dialog', async () => {
    konfiguration.gespeicherteEinstellungen.set({ vorgangEmpfaenger: '' });
    expect(await dienst.senden()).toBe(false);
    expect(hinweise.hinweis).toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('reicht auf Stufe „Angebote eingeholt“ ein, sonst sendet es nur', async () => {
    const stufe1 = testDarstellung();
    stufe1.vorgang.stufe = 1;
    store.aktuell.set(testStand(stufe1));
    store.senden.mockResolvedValue(true);
    expect(await dienst.senden()).toBe(true);
    expect(store.senden).toHaveBeenCalledWith(
      expect.objectContaining({
        modus: 'einreichen',
        empfaenger: ['a@example.test'],
        pdf: btoa('%PDF'),
      }),
    );
    expect(meldungen.erfolg).toHaveBeenCalledWith('Eingereicht: Die Meldung wurde gesendet.');

    const stufe3 = testDarstellung();
    stufe3.vorgang.stufe = 3;
    store.aktuell.set(testStand(stufe3));
    await dienst.senden();
    expect(store.senden).toHaveBeenLastCalledWith(expect.objectContaining({ modus: 'senden' }));
  });

  it('bricht bei Abbrechen im Dialog ab, ohne ein PDF zu erzeugen', async () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(null) });
    expect(await dienst.senden()).toBe(false);
    expect(pdf.erzeuge).not.toHaveBeenCalled();
  });

  it('meldet einen PDF-Fehler und sendet nichts', async () => {
    pdf.erzeuge.mockRejectedValue(new Error('Es ist noch keine Vorlage hinterlegt.'));
    expect(await dienst.senden()).toBe(false);
    expect(meldungen.fehler).toHaveBeenCalledWith('Es ist noch keine Vorlage hinterlegt.');
    expect(store.senden).not.toHaveBeenCalled();
  });

  it('zeigt den Fehler des Servers, wenn der Versand scheitert', async () => {
    store.senden.mockResolvedValue(false);
    expect(await dienst.senden()).toBe(false);
    expect(meldungen.fehler).toHaveBeenCalledWith('Fehlertext');
  });
});

describe('alsBase64', () => {
  it('kodiert auch Daten über der Blockgröße', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 251);
    expect(atob(alsBase64(bytes))).toHaveLength(70_000);
    expect(alsBase64(new Uint8Array([72, 105]))).toBe('SGk=');
  });
});
