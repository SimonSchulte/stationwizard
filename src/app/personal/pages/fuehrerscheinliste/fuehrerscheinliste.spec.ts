import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipLesen, zipSchreiben } from '../../../kern/dateien/zip';
import { WorkerClient } from '../../../kern/worker-client';
import { Fuehrerscheinliste } from './fuehrerscheinliste';

const DOCX_TYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Formularfeldzelle wie in der echten Vorlage – siehe fuehrerschein-dokument.spec.ts. */
function formularfeldZelle(): string {
  return (
    '<w:tc><w:p>' +
    '<w:r w:rsidRPr="a"><w:fldChar w:fldCharType="begin">' +
    '<w:ffData><w:name w:val="Text2" /><w:enabled /><w:calcOnExit w:val="0" /><w:textInput /></w:ffData>' +
    '</w:fldChar></w:r>' +
    '<w:r w:rsidRPr="a"><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r>' +
    '<w:r w:rsidRPr="a"><w:fldChar w:fldCharType="separate" /></w:r>' +
    '<w:r w:rsidRPr="a"><w:t> </w:t></w:r>' +
    '<w:r w:rsidRPr="a"><w:fldChar w:fldCharType="end" /></w:r>' +
    '</w:p></w:tc>'
  );
}

function einfacheZelle(text = ''): string {
  return `<w:tc><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
}

async function vorlageDatei(): Promise<ArrayBuffer> {
  const kopf = [
    einfacheZelle('Name des Mitarbeitenden'),
    einfacheZelle(''),
    einfacheZelle('Datum d. Ausstellung'),
    einfacheZelle('Identifikations-Nr. der Fahrerlaubnis'),
  ].join('');
  const daten = [
    formularfeldZelle(),
    einfacheZelle(),
    formularfeldZelle(),
    formularfeldZelle(),
  ].join('');
  const xml =
    '<?xml version="1.0"?><w:document><w:body>' +
    `<w:tbl><w:tr>${kopf}</w:tr><w:tr>${daten}</w:tr></w:tbl>` +
    '</w:body></w:document>';
  const archiv = await zipSchreiben([
    { name: 'word/document.xml', daten: new TextEncoder().encode(xml) },
  ]);
  return archiv.buffer as ArrayBuffer;
}

function aufbauen(antworten: Record<string, unknown>, anfragen?: WorkerClient['anfragen']) {
  const json = vi.fn(async (pfad: string) => antworten[pfad]);
  TestBed.configureTestingModule({
    providers: [{ provide: WorkerClient, useValue: { json, anfragen } }],
  });
  const seite = TestBed.runInInjectionContext(() => new Fuehrerscheinliste());
  return { seite, json };
}

function vorlagenAntwort(
  metadaten: Record<string, unknown>,
  etag: string | null = '"1"',
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (etag) headers.set('ETag', etag);
  return new Response(JSON.stringify(metadaten), { status: 200, headers });
}

describe('Fuehrerscheinliste', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ruft ohne Verbindung kein Personal ab', async () => {
    const { seite, json } = aufbauen({
      '/api/hiorg/verbindung': { eingerichtet: true, verbunden: false, modus: 'manuell' },
    });
    await seite.laden();
    expect(seite.verbindung()).toBe('getrennt');
    expect(json).not.toHaveBeenCalledWith('/api/hiorg/personal');
  });

  it('filtert nach Name und Führerscheinklasse und zeigt das Datum deutsch', async () => {
    const { seite } = aufbauen({
      '/api/hiorg/verbindung': { eingerichtet: true, verbunden: true, modus: 'manuell' },
      '/api/hiorg/personal': {
        personen: [
          {
            id: 'a',
            vorname: 'Erika',
            nachname: 'Beispiel',
            gruppen: [],
            qualifikationen: [],
            fahrerlaubnis: {
              klassen: ['B', 'BE'],
              beschraenkung: null,
              fuehrerscheinnummer: '7B9205K0C65',
              fuehrerscheindatum: '1995-11-01',
            },
          },
          {
            id: 'b',
            vorname: 'Max',
            nachname: 'Muster',
            gruppen: [],
            qualifikationen: [],
            fahrerlaubnis: null,
          },
        ],
      },
    });
    await seite.laden();
    expect(seite.personen().length).toBe(2);
    seite.suche.set('be');
    expect(seite.gefiltert().map((p) => p.id)).toEqual(['a']);
    seite.suche.set('muster');
    expect(seite.gefiltert().map((p) => p.id)).toEqual(['b']);
    expect(seite.fuehrerscheindatum(seite.personen()[0])).toBe('01.11.1995');
    expect(seite.fuehrerscheindatum(seite.personen()[1])).toBe('');
    // '7B9205K0C65' hat keine korrekte Prüfziffer (erwartet wäre 'X', nicht '6').
    expect(seite.pruefziffer(seite.personen()[0])).toBe('ungueltig');
    expect(seite.pruefziffer(seite.personen()[1])).toBeNull();
  });

  it('nimmt in die Dokumentzeilen nur Personen mit erfasster Führerscheinnummer auf', async () => {
    const { seite } = aufbauen({
      '/api/hiorg/verbindung': { eingerichtet: true, verbunden: true, modus: 'manuell' },
      '/api/hiorg/personal': {
        personen: [
          {
            id: 'a',
            vorname: 'Erika',
            nachname: 'Beispiel',
            gruppen: [],
            qualifikationen: [],
            fahrerlaubnis: {
              klassen: ['B'],
              beschraenkung: null,
              fuehrerscheinnummer: 'B072RRE2I50',
              fuehrerscheindatum: '2020-06-15',
            },
          },
          { id: 'b', vorname: 'Max', nachname: 'Muster', gruppen: [], qualifikationen: [] },
        ],
      },
    });
    await seite.laden();
    expect(seite.dokumentZeilen()).toEqual([
      { name: 'Beispiel, Erika', datum: '15.06.2020', nummer: 'B072RRE2I50' },
    ]);
  });

  it('meldet den Vorlagenstatus', async () => {
    const anfragen = vi.fn(async () =>
      vorlagenAntwort({
        vorhanden: true,
        dateiname: 'fahrerlaubnis.docx',
        version: 1,
        geaendertAm: 'x',
        geaendertVon: 'y',
      }),
    );
    const { seite } = aufbauen({}, anfragen);
    await seite.vorlageLaden();
    expect(seite.vorlage()?.vorhanden).toBe(true);
  });

  it('lädt die Vorlage, füllt sie und stößt den Download an', async () => {
    const erzeugteUrl = 'blob:erfunden';
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(erzeugteUrl);
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const klickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const vorlage = await vorlageDatei();
    const anfragen = vi.fn(async (pfad: string) => {
      if (pfad === '/api/personal/fuehrerschein-vorlage/datei') {
        return new Response(vorlage, {
          status: 200,
          headers: { 'Content-Type': DOCX_TYP, ETag: '"1"' },
        });
      }
      throw new Error(`unerwarteter Pfad: ${pfad}`);
    });
    const { seite } = aufbauen(
      {
        '/api/hiorg/verbindung': { eingerichtet: true, verbunden: true, modus: 'manuell' },
        '/api/hiorg/personal': {
          personen: [
            {
              id: 'a',
              vorname: 'Erika',
              nachname: 'Beispiel',
              gruppen: [],
              qualifikationen: [],
              fahrerlaubnis: {
                klassen: ['B'],
                beschraenkung: null,
                fuehrerscheinnummer: 'B072RRE2I50',
                fuehrerscheindatum: '2020-06-15',
              },
            },
          ],
        },
      },
      anfragen,
    );
    await seite.laden();
    await seite.dokumentHerunterladen();

    expect(seite.dokumentFehler()).toBe('');
    expect(klickSpy).toHaveBeenCalledOnce();
    expect(createObjectUrlSpy).toHaveBeenCalledOnce();
    const geschriebeneDatei = createObjectUrlSpy.mock.calls[0]![0] as Blob;
    expect(geschriebeneDatei.type).toBe(DOCX_TYP);
    const xml = new TextDecoder().decode(
      (await zipLesen(await geschriebeneDatei.arrayBuffer())).find(
        (e) => e.name === 'word/document.xml',
      )!.daten,
    );
    expect(xml).toContain('Beispiel, Erika');
    expect(xml).toContain('B072RRE2I50');
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(erzeugteUrl);
  });
});
