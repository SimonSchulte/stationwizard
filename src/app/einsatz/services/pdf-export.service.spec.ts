import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { Planung } from '../models/planung.model';
import { PdfExportService } from './pdf-export.service';

/** Ausschließlich synthetische Daten; keine reale Veranstaltung oder Einsatzkraft. */
function testPlanung(): Planung {
  return {
    id: 'pdf-test',
    name: 'Übungsplanung Musterstadt',
    start: '2026-07-15T12:30:00Z',
    end: '2026-07-15T18:00:00Z',
    beschreibung: 'Fiktive Ausbildung mit Ä, Ö, Ü und ß.',
    einsatzleiter: { id: 'person-a', name: 'Musterperson Alpha' },
    einsatzkraefte: [
      {
        id: 'person-a',
        name: 'Musterperson Alpha',
        tags: { taktisch: ['GF'], medizinisch: ['RS'], zusatz: ['Sprechfunk'] },
      },
    ],
    posten: [
      {
        id: 'posten-a',
        label: 'Fiktiver Sanitätsposten',
        fahrzeug: { seriennummer: null, hiorgId: null, funkruf: 'Übung 1' },
        positions: [
          {
            id: 'position-a',
            label: 'Postenführung',
            requirements: { taktisch: 'GF', medizinisch: 'RS' },
            assigned: { id: 'person-a', name: 'Musterperson Alpha' },
            isPostenfuehrer: true,
          },
          {
            id: 'position-b',
            label: 'Freie Position',
            requirements: { taktisch: null, medizinisch: null },
            assigned: null,
          },
        ],
      },
    ],
  };
}

describe('PdfExportService', () => {
  let dienst: PdfExportService;
  const hinweis = vi.fn<DialogDienst['hinweis']>().mockResolvedValue();

  beforeEach(() => {
    hinweis.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: DialogDienst, useValue: { hinweis } }],
    });
    dienst = TestBed.inject(PdfExportService);
  });

  it('erzeugt echte PDF-Bytes samt eingebetteten Schriften aus einem synthetischen Plan', async () => {
    const daten = await dienst.erzeugePdf(testPlanung(), new Date('2026-07-15T12:30:00Z'));
    const pdf = new TextDecoder('latin1').decode(daten);

    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/FontFile2');
    expect(pdf).toContain('/Type /Page');
    expect(daten.byteLength).toBeGreaterThan(5_000);
  });

  it('meldet einen fehlgeschlagenen Export verständlich, ohne Planungsdaten zu protokollieren', async () => {
    const planung = testPlanung();
    planung.start = 'kein gültiges Datum';

    await dienst.exportieren(planung);

    expect(hinweis).toHaveBeenCalledWith(
      expect.stringContaining('Datumsangaben'),
      'PDF-Export fehlgeschlagen',
    );
  });
});
