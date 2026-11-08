import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { MeldungsDienst } from '../zustand/meldungs-dienst';
import { PdfAusgabe } from './pdf-ausgabe';

const DATEN = new Uint8Array([37, 80, 68, 70]);

describe('PdfAusgabe', () => {
  const info = vi.fn();
  let dienst: PdfAusgabe;
  let speichern: MockInstance<PdfAusgabe['speichern']>;
  let direktdrucken: MockInstance<PdfAusgabe['direktdrucken']>;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: MeldungsDienst, useValue: { info } }],
    });
    dienst = TestBed.inject(PdfAusgabe);
    speichern = vi.spyOn(dienst, 'speichern').mockImplementation(() => undefined);
    direktdrucken = vi.spyOn(dienst, 'direktdrucken').mockResolvedValue(undefined);
  });

  it('druckt standardmäßig direkt und lädt nichts herunter', async () => {
    await dienst.ausgeben(DATEN, 'a.pdf');
    expect(direktdrucken).toHaveBeenCalledWith(DATEN);
    expect(speichern).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('lädt auf Wunsch herunter, ohne zu drucken', async () => {
    await dienst.ausgeben(DATEN, 'a.pdf', 'herunterladen');
    expect(speichern).toHaveBeenCalledWith(DATEN, 'a.pdf');
    expect(direktdrucken).not.toHaveBeenCalled();
  });

  it('fällt auf den Download zurück, wenn der Browser den Druck verweigert, und sagt es', async () => {
    direktdrucken.mockRejectedValue(new Error('print blockiert'));
    await dienst.drucken(DATEN, 'a.pdf');
    expect(speichern).toHaveBeenCalledWith(DATEN, 'a.pdf');
    expect(info).toHaveBeenCalledOnce();
  });
});

describe('PdfAusgabe.direktdrucken', () => {
  let dienst: PdfAusgabe;
  const print = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: MeldungsDienst, useValue: { info: vi.fn() } }],
    });
    dienst = TestBed.inject(PdfAusgabe);
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => document.querySelectorAll('iframe').forEach((r) => r.remove()));

  function rahmen(): HTMLIFrameElement {
    return document.querySelector('iframe') as HTMLIFrameElement;
  }

  it('hängt einen unsichtbaren Rahmen an, druckt nach dem Laden und räumt nach dem Druck auf', async () => {
    const ergebnis = dienst.direktdrucken(DATEN);
    const r = rahmen();
    expect(r.getAttribute('aria-hidden')).toBe('true');
    expect(r.style.visibility).toBe('hidden');
    const fenster = { addEventListener: vi.fn(), focus: vi.fn(), print };
    Object.defineProperty(r, 'contentWindow', { value: fenster });
    r.onload?.(new Event('load'));
    await ergebnis;
    expect(print).toHaveBeenCalledOnce();
    const nachDruck = fenster.addEventListener.mock.calls[0][1] as () => void;
    nachDruck();
    expect(document.querySelector('iframe')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('lehnt ab und räumt auf, wenn print() fehlschlägt', async () => {
    const ergebnis = dienst.direktdrucken(DATEN);
    const r = rahmen();
    Object.defineProperty(r, 'contentWindow', {
      value: {
        addEventListener: vi.fn(),
        focus: vi.fn(),
        print: () => {
          throw new Error('blockiert');
        },
      },
    });
    r.onload?.(new Event('load'));
    await expect(ergebnis).rejects.toThrow('blockiert');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('lehnt ab, wenn der Rahmen nicht lädt', async () => {
    const ergebnis = dienst.direktdrucken(DATEN);
    rahmen().onerror?.(new Event('error'));
    await expect(ergebnis).rejects.toThrow();
    expect(document.querySelector('iframe')).toBeNull();
  });
});
