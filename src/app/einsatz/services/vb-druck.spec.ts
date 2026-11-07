import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { MeldungsDienst } from '../../kern/zustand/meldungs-dienst';
import { testAbschnitt, testInhalt, testLaufzettel, testPosition } from '../testing/vb-testdaten';
import { VbDruckDienst, vbDateiname } from './vb-druck';

const KOPF = { titel: 'Markt', beginn: null, ende: null, ort: null };

describe('VbDruckDienst', () => {
  const warnung = vi.fn();
  const info = vi.fn();
  const getBuffer = vi.fn();
  const createPdf = vi.fn();
  let dienst: VbDruckDienst;
  let lade: MockInstance<VbDruckDienst['ladeBibliothek']>;
  let speichern: MockInstance<VbDruckDienst['speichern']>;
  let direktdrucken: MockInstance<VbDruckDienst['direktdrucken']>;

  beforeEach(() => {
    vi.clearAllMocks();
    getBuffer.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    createPdf.mockReturnValue({ getBuffer });
    TestBed.configureTestingModule({
      providers: [{ provide: MeldungsDienst, useValue: { warnung, info } }],
    });
    dienst = TestBed.inject(VbDruckDienst);
    lade = vi
      .spyOn(dienst, 'ladeBibliothek')
      .mockResolvedValue({ createPdf } as unknown as Awaited<
        ReturnType<typeof dienst.ladeBibliothek>
      >);
    speichern = vi.spyOn(dienst, 'speichern').mockImplementation(() => undefined);
    direktdrucken = vi.spyOn(dienst, 'direktdrucken').mockResolvedValue(undefined);
  });

  it('druckt direkt, ohne etwas herunterzuladen', async () => {
    await dienst.drucken(KOPF, testInhalt());
    expect(direktdrucken).toHaveBeenCalledOnce();
    expect(direktdrucken.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect(speichern).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('lädt das PDF herunter, wenn der Browser nicht direkt drucken kann, und sagt es', async () => {
    direktdrucken.mockRejectedValue(new Error('print blockiert'));
    await dienst.drucken(KOPF, testInhalt());
    expect(speichern).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
  });

  it('lädt pdfmake, baut die Definition und lädt „VB <Titel> <Datum>.pdf“ herunter', async () => {
    await dienst.herunterladen(KOPF, testInhalt());
    expect(direktdrucken).not.toHaveBeenCalled();
    expect(lade).toHaveBeenCalledOnce();
    const definition = createPdf.mock.calls[0][0];
    expect(definition.pageOrientation).toBe('landscape');
    expect(speichern).toHaveBeenCalledOnce();
    const [daten, name] = speichern.mock.calls[0];
    expect(daten).toBeInstanceOf(Uint8Array);
    expect(name).toMatch(/^VB Markt \d{4}-\d{2}-\d{2}\.pdf$/);
    expect(warnung).not.toHaveBeenCalled();
  });

  it('warnt, wenn Laufzettel mit Fortsetzungsstreifen gedruckt werden', async () => {
    const voll = testLaufzettel({
      positionen: Array.from({ length: 30 }, () => testPosition()),
    });
    await dienst.drucken(KOPF, testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [voll] })] }));
    expect(warnung).toHaveBeenCalledOnce();
    expect(warnung.mock.calls[0][0]).toContain('Fortsetzungsstreifen');
  });

  it('wirft Fehler des PDF-Aufbaus an den Aufrufer, ohne etwas herunterzuladen', async () => {
    getBuffer.mockRejectedValue(new Error('kaputt'));
    await expect(dienst.drucken(KOPF, testInhalt())).rejects.toThrow('kaputt');
    expect(speichern).not.toHaveBeenCalled();
    expect(direktdrucken).not.toHaveBeenCalled();
  });

  it('wirft, wenn die Bibliothek nicht geladen werden kann', async () => {
    lade.mockRejectedValue(new Error('Chunk fehlt'));
    await expect(dienst.drucken(KOPF, testInhalt())).rejects.toThrow('Chunk fehlt');
  });

  it('druckt nichts, wenn weder Anweisungen noch Laufzettel vorhanden sind', async () => {
    await expect(
      dienst.drucken(KOPF, testInhalt({ anweisungen: '', abschnitte: [] })),
    ).rejects.toThrow();
    expect(lade).not.toHaveBeenCalled();
  });
});

describe('vbDateiname', () => {
  it('bereinigt unzulässige Zeichen und leere Titel', () => {
    expect(vbDateiname('Markt: Ummeln/Nord?', '2026-12-05')).toBe(
      'VB Markt_ Ummeln_Nord_ 2026-12-05.pdf',
    );
    expect(vbDateiname('  ', '2026-12-05')).toBe('VB Vorbereitung 2026-12-05.pdf');
  });
});
