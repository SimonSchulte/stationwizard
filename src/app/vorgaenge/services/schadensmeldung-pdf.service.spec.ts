import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { WorkerFehler } from '../../kern/worker-client';
import { testMeldung, testUnterschriften } from '../testing/vorgang-testdaten';
import { SchadensmeldungPdfService, unterschriftenFuerPdf } from './schadensmeldung-pdf.service';
import { SchadensmeldungVorlageService } from './schadensmeldung-vorlage.service';

describe('SchadensmeldungPdfService', () => {
  const vorlage = { datenLaden: vi.fn() };
  let dienst: SchadensmeldungPdfService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: SchadensmeldungVorlageService, useValue: vorlage }],
    });
    dienst = TestBed.inject(SchadensmeldungPdfService);
  });

  it('nennt eine fehlende Vorlage verständlich', async () => {
    vorlage.datenLaden.mockRejectedValue(new WorkerFehler('nicht gefunden', 404));
    await expect(dienst.erzeuge(testMeldung(), testUnterschriften())).rejects.toThrow(
      'Es ist noch keine Vorlage hinterlegt',
    );
  });

  it('reicht andere Fehler der Vorlagenablage unverändert weiter', async () => {
    vorlage.datenLaden.mockRejectedValue(new WorkerFehler('Server nicht erreichbar.', 0));
    await expect(dienst.erzeuge(testMeldung(), testUnterschriften())).rejects.toThrow(
      'Server nicht erreichbar.',
    );
  });

  it('weist eine Vorlage zurück, die nicht zum Formular passt', async () => {
    const leer = await PDFDocument.create();
    leer.addPage();
    vorlage.datenLaden.mockResolvedValue((await leer.save()).slice().buffer);
    await expect(dienst.erzeuge(testMeldung(), testUnterschriften())).rejects.toThrow(
      /passt nicht zum erwarteten Formular/,
    );
  });

  it('bildet einen Dateinamen ohne Sonderzeichen', () => {
    expect(
      dienst.dateiname(testMeldung({ kennzeichen: 'XX-HS 110', datumFeststellung: '2026-11-12' })),
    ).toBe('schadensmeldung-xx-hs-110-2026-11-12.pdf');
    expect(dienst.dateiname(testMeldung({ kennzeichen: 'Ü/Ä!', datumFeststellung: '' }))).toBe(
      'schadensmeldung-u-a-ohne-datum.pdf',
    );
  });

  describe('unterschriftenFuerPdf', () => {
    const gesetzt = () =>
      testUnterschriften().map((u) => ({
        ...u,
        status: 'unterschrieben' as const,
        anEmail: 'anna@example.test',
        name: 'Anna Alt',
        unterschriebenAm: '2026-11-12T10:00:00.000Z',
        signatur: { art: 'zeichnung' as const, striche: [] },
      }));

    it('setzt den aktuellen Anzeigename der unterschreibenden Person ein', () => {
      const ergebnis = unterschriftenFuerPdf(gesetzt(), (email) =>
        email === 'anna@example.test' ? 'Anna Neu' : null,
      );
      expect(ergebnis.length).toBeGreaterThan(0);
      expect(ergebnis.every((u) => u.name === 'Anna Neu')).toBe(true);
    });

    it('behält den festgehaltenen Namen, wenn kein Anzeigename gesetzt ist', () => {
      const ergebnis = unterschriftenFuerPdf(gesetzt(), () => null);
      expect(ergebnis.every((u) => u.name === 'Anna Alt')).toBe(true);
    });

    it('lässt nicht unterschriebene Felder aus', () => {
      const offen = testUnterschriften().map((u) => ({ ...u, status: 'offen' as const }));
      expect(unterschriftenFuerPdf(offen, () => 'X')).toEqual([]);
    });
  });
});
