import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { WorkerClient } from '../../../kern/worker-client';
import { FuehrerscheinVorlageVerwaltung } from './fuehrerschein-vorlage-verwaltung';

const DOCX_TYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function metadatenAntwort(inhalt: Record<string, unknown>, etag = '"1"'): Response {
  return new Response(JSON.stringify(inhalt), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ETag: etag },
  });
}

function aufbauen(
  anfragen: WorkerClient['anfragen'],
  bestaetigen = vi.fn().mockResolvedValue(true),
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkerClient, useValue: { anfragen } },
      { provide: DialogDienst, useValue: { bestaetigen } },
    ],
  });
  const seite = TestBed.runInInjectionContext(() => new FuehrerscheinVorlageVerwaltung());
  return { seite, bestaetigen };
}

function eingabeEreignis(datei: File | undefined): Event {
  const eingabe = { files: datei ? [datei] : [], value: '' };
  return { target: eingabe } as unknown as Event;
}

describe('FuehrerscheinVorlageVerwaltung', () => {
  it('lädt und zeigt den Status ohne hinterlegte Vorlage', async () => {
    const anfragen = vi.fn(async () =>
      metadatenAntwort(
        { vorhanden: false, dateiname: null, version: null, geaendertAm: null, geaendertVon: null },
        '',
      ),
    );
    const { seite } = aufbauen(anfragen);
    await seite.laden();
    expect(seite.vorlage()?.vorhanden).toBe(false);
  });

  it('lehnt eine gewählte Datei ohne .docx-Endung ab', () => {
    const { seite } = aufbauen(vi.fn());
    seite.dateiGewaehlt(eingabeEreignis(new File([new Uint8Array([1])], 'liste.csv')));
    expect(seite.gewaehlteDatei()).toBeNull();
    expect(seite.hochladeFehler()).toContain('.docx');
  });

  it('lädt ohne bestehende Vorlage ohne Rückfrage hoch', async () => {
    const anfragen = vi.fn(async (pfad: string, optionen?: RequestInit) => {
      if (!optionen?.method) {
        return metadatenAntwort({
          vorhanden: false,
          dateiname: null,
          version: null,
          geaendertAm: null,
          geaendertVon: null,
        });
      }
      return metadatenAntwort({
        vorhanden: true,
        dateiname: 'neu.docx',
        version: 1,
        geaendertAm: 'x',
        geaendertVon: 'y',
      });
    });
    const { seite, bestaetigen } = aufbauen(anfragen);
    await seite.laden();
    seite.dateiGewaehlt(
      eingabeEreignis(new File([new Uint8Array([1])], 'neu.docx', { type: DOCX_TYP })),
    );
    await seite.hochladen();
    expect(bestaetigen).not.toHaveBeenCalled();
    expect(seite.vorlage()?.dateiname).toBe('neu.docx');
    expect(seite.erfolg()).toContain('gespeichert');
    expect(seite.gewaehlteDatei()).toBeNull();
  });

  it('fragt vor dem Ersetzen einer bestehenden Vorlage nach und bricht bei Ablehnung ab', async () => {
    const anfragen = vi.fn(async (pfad: string, optionen?: RequestInit) => {
      if (!optionen?.method) {
        return metadatenAntwort({
          vorhanden: true,
          dateiname: 'alt.docx',
          version: 2,
          geaendertAm: 'x',
          geaendertVon: 'y',
        });
      }
      throw new Error('sollte ohne Bestätigung nicht aufgerufen werden');
    });
    const bestaetigen = vi.fn().mockResolvedValue(false);
    const { seite } = aufbauen(anfragen, bestaetigen);
    await seite.laden();
    seite.dateiGewaehlt(
      eingabeEreignis(new File([new Uint8Array([1])], 'neu.docx', { type: DOCX_TYP })),
    );
    await seite.hochladen();
    expect(bestaetigen).toHaveBeenCalledOnce();
    expect(seite.vorlage()?.dateiname).toBe('alt.docx');
  });
});
