import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../../kern/worker-client';
import { FuehrerscheinVorlageService } from './fuehrerschein-vorlage.service';

const DOCX_TYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function metadatenAntwort(inhalt: Record<string, unknown>, etag: string | null = null): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (etag) headers.set('ETag', etag);
  return new Response(JSON.stringify(inhalt), { status: 200, headers });
}

function aufbauen(anfragen: (pfad: string, optionen?: RequestInit) => Promise<Response>) {
  TestBed.configureTestingModule({
    providers: [{ provide: WorkerClient, useValue: { anfragen } }],
  });
  return TestBed.runInInjectionContext(() => new FuehrerscheinVorlageService());
}

describe('FuehrerscheinVorlageService', () => {
  it('liest Metadaten und merkt sich die Version', async () => {
    const anfragen = vi.fn(async () =>
      metadatenAntwort(
        {
          vorhanden: true,
          dateiname: 'fahrerlaubnis.docx',
          version: 3,
          geaendertAm: '2026-01-01T00:00:00.000Z',
          geaendertVon: 'a@example.test',
        },
        '"3"',
      ),
    );
    const dienst = aufbauen(anfragen);
    const metadaten = await dienst.metadatenLaden();
    expect(metadaten).toMatchObject({
      vorhanden: true,
      dateiname: 'fahrerlaubnis.docx',
      version: 3,
    });
  });

  it('lädt beim Hochladen ohne vorheriges Laden mit If-None-Match: *', async () => {
    const anfragen = vi.fn(async (_pfad: string, optionen?: RequestInit) => {
      const headers = new Headers(optionen?.headers);
      expect(headers.get('If-None-Match')).toBe('*');
      expect(headers.get('If-Match')).toBeNull();
      return metadatenAntwort(
        { vorhanden: true, dateiname: 'neu.docx', version: 1, geaendertAm: 'x', geaendertVon: 'y' },
        '"1"',
      );
    });
    const dienst = aufbauen(anfragen);
    await dienst.hochladen(new File([new Uint8Array([1])], 'neu.docx', { type: DOCX_TYP }));
    expect(anfragen).toHaveBeenCalledOnce();
  });

  it('lädt nach metadatenLaden() mit If-Match gegen die geladene Version hoch', async () => {
    const anfragen = vi.fn(async (pfad: string, optionen?: RequestInit) => {
      if (!optionen || optionen.method === undefined) {
        return metadatenAntwort(
          {
            vorhanden: true,
            dateiname: 'alt.docx',
            version: 2,
            geaendertAm: 'x',
            geaendertVon: 'y',
          },
          '"2"',
        );
      }
      const headers = new Headers(optionen.headers);
      expect(headers.get('If-Match')).toBe('"2"');
      expect(headers.get('X-Stationwizard-Dateiname')).toBe('neu.docx');
      return metadatenAntwort(
        { vorhanden: true, dateiname: 'neu.docx', version: 3, geaendertAm: 'x', geaendertVon: 'y' },
        '"3"',
      );
    });
    const dienst = aufbauen(anfragen);
    await dienst.metadatenLaden();
    const ergebnis = await dienst.hochladen(
      new File([new Uint8Array([1])], 'neu.docx', { type: DOCX_TYP }),
    );
    expect(ergebnis.version).toBe(3);
  });

  it('verwirft eine ungültig geformte Metadatenantwort', async () => {
    const anfragen = vi.fn(async () => metadatenAntwort({ vorhanden: 'ja' }));
    const dienst = aufbauen(anfragen);
    await expect(dienst.metadatenLaden()).rejects.toThrow();
  });
});
