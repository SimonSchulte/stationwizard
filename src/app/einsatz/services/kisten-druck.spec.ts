import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { PdfAusgabe } from '../../kern/pdf/pdf-ausgabe';
import { erzeugeTestKiste } from '../testing/stammdaten-testdaten';
import { KistenDruckDienst, kistenDateiname } from './kisten-druck';

const DATEN = { artikel: new Map(), lager: new Map() };

describe('KistenDruckDienst', () => {
  const drucken = vi.fn().mockResolvedValue(undefined);
  const getBuffer = vi.fn();
  const createPdf = vi.fn();
  let dienst: KistenDruckDienst;
  let lade: MockInstance<KistenDruckDienst['ladeBibliothek']>;

  beforeEach(() => {
    vi.clearAllMocks();
    getBuffer.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    createPdf.mockReturnValue({ getBuffer });
    TestBed.configureTestingModule({ providers: [{ provide: PdfAusgabe, useValue: { drucken } }] });
    dienst = TestBed.inject(KistenDruckDienst);
    lade = vi
      .spyOn(dienst, 'ladeBibliothek')
      .mockResolvedValue({ createPdf } as unknown as Awaited<
        ReturnType<typeof dienst.ladeBibliothek>
      >);
  });

  it('druckt das Kistenschild über die gemeinsame PDF-Ausgabe', async () => {
    await dienst.schildDrucken([erzeugeTestKiste({ name: 'Gewürzkiste' })], DATEN);
    expect(createPdf.mock.calls[0][0].pageOrientation).toBe('portrait');
    const [daten, name] = drucken.mock.calls[0];
    expect(daten).toBeInstanceOf(Uint8Array);
    expect(name).toMatch(/^Kiste Schild Gewürzkiste \d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('druckt den Kistenzettel auf A4 quer', async () => {
    await dienst.zettelDrucken([erzeugeTestKiste({ name: 'Gewürzkiste' })], DATEN);
    expect(createPdf.mock.calls[0][0].pageOrientation).toBe('landscape');
    expect(drucken.mock.calls[0][1]).toMatch(/^Kiste Zettel Gewürzkiste /);
  });

  it('tut ohne Kisten nichts und lädt die Bibliothek nicht', async () => {
    await dienst.schildDrucken([], DATEN);
    await dienst.zettelDrucken([], DATEN);
    expect(lade).not.toHaveBeenCalled();
    expect(drucken).not.toHaveBeenCalled();
  });

  it('reicht Fehler der PDF-Erzeugung an den Aufrufer weiter', async () => {
    getBuffer.mockRejectedValue(new Error('kaputt'));
    await expect(dienst.schildDrucken([erzeugeTestKiste()], DATEN)).rejects.toThrow('kaputt');
    expect(drucken).not.toHaveBeenCalled();
  });
});

describe('kistenDateiname', () => {
  it('nennt eine Kiste mit Namen, mehrere mit Anzahl und bereinigt verbotene Zeichen', () => {
    expect(kistenDateiname('Schild', [erzeugeTestKiste({ name: 'A/B: C' })], '2026-11-09')).toBe(
      'Kiste Schild A_B_ C 2026-11-09.pdf',
    );
    expect(kistenDateiname('Zettel', [erzeugeTestKiste(), erzeugeTestKiste()], '2026-11-09')).toBe(
      'Kiste Zettel 2 Kisten 2026-11-09.pdf',
    );
  });
});
