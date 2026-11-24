import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerFehler } from '../../kern/worker-client';
import { ApiVorgangStorage } from '../storage/api-vorgang-storage';
import { testDarstellung, testStand, testUnterschriften } from '../testing/vorgang-testdaten';
import { VorgangStoreService, vorgangFehlertext } from './vorgang-store.service';

describe('VorgangStoreService', () => {
  const storage = {
    liste: vi.fn(),
    lade: vi.fn(),
    lege: vi.fn(),
    speichereMeldung: vi.fn(),
    unterschreibe: vi.fn(),
    fordereAn: vi.fn(),
    entferneUnterschrift: vi.fn(),
    entferneAlleUnterschriften: vi.fn(),
    wechsleStufe: vi.fn(),
    sende: vi.fn(),
    angebotHochladen: vi.fn(),
    angebotEntfernen: vi.fn(),
    angebotDatei: vi.fn(),
  };
  let store: VorgangStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    storage.liste.mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [{ provide: ApiVorgangStorage, useValue: storage }],
    });
    store = TestBed.inject(VorgangStoreService);
  });

  async function geladen(stand = testStand()) {
    storage.lade.mockResolvedValue(stand);
    await store.laden('v-1');
  }

  it('lädt einen Vorgang und legt den Entwurf der Meldung an', async () => {
    await geladen();
    expect(store.aktuell()?.daten.vorgang.id).toBe('v-1');
    expect(store.entwurf()?.bezeichnung).toBe('GW SAN');
    expect(store.ungespeichert()).toBe(false);
  });

  it('meldet einen Ladefehler und räumt den Zustand', async () => {
    storage.lade.mockRejectedValue(new WorkerFehler('Server nicht erreichbar.', 0));
    await store.laden('v-1');
    expect(store.ladeFehler()).toBe('Server nicht erreichbar.');
    expect(store.aktuell()).toBeNull();
  });

  it('erkennt ungespeicherte Änderungen und verwirft sie wieder', async () => {
    await geladen();
    store.entwurfAendern({ ort: 'Fahrzeughalle' });
    expect(store.ungespeichert()).toBe(true);
    expect(store.hatUngesicherteAenderungen()).toBe(true);
    store.verwerfen();
    expect(store.ungespeichert()).toBe(false);
    expect(store.entwurf()?.ort).toBe('');
  });

  it('begrenzt jedes Textfeld auf seine Grenze', async () => {
    await geladen();
    store.entwurfAendern({ einheit: 'x'.repeat(100), sachverhalt: 'y'.repeat(5000) });
    expect(store.entwurf()?.einheit).toHaveLength(40);
    expect(store.entwurf()?.sachverhalt).toHaveLength(4000);
  });

  it('ändert eine gesperrte Meldung nicht', async () => {
    const daten = testDarstellung();
    daten.meldung!.gesperrt = true;
    await geladen(testStand(daten));
    store.entwurfAendern({ ort: 'neu' });
    expect(store.ungespeichert()).toBe(false);
  });

  it('speichert mit der Version der Meldung und übernimmt den neuen Stand', async () => {
    await geladen();
    store.entwurfAendern({ ort: 'Halle' });
    const neu = testDarstellung({}, { ort: 'Halle' });
    neu.meldung!.version = 2;
    storage.speichereMeldung.mockResolvedValue(testStand(neu, '"2"'));
    expect(await store.meldungSpeichern()).toBe(true);
    expect(storage.speichereMeldung).toHaveBeenCalledWith(
      'v-1',
      expect.objectContaining({ ort: 'Halle' }),
      1,
    );
    expect(store.ungespeichert()).toBe(false);
    expect(store.meldung()?.version).toBe(2);
  });

  it('bewahrt den Entwurf bei einem Versionskonflikt', async () => {
    await geladen();
    store.entwurfAendern({ ort: 'Halle' });
    storage.speichereMeldung.mockRejectedValue(new WorkerFehler('412', 412));
    expect(await store.meldungSpeichern()).toBe(false);
    expect(store.konflikt()).toBe(true);
    expect(store.entwurf()?.ort).toBe('Halle');
  });

  it('behält ungespeicherte Änderungen, wenn eine Unterschrift angefragt wird', async () => {
    await geladen();
    store.entwurfAendern({ ort: 'Halle' });
    const mit = testDarstellung({
      unterschriften: testUnterschriften({ verantw: { status: 'angefragt' } }),
    });
    storage.fordereAn.mockResolvedValue(testStand(mit));
    expect(await store.anfordern('verantw', 'zora.muster@example.test')).toBe(true);
    expect(store.entwurf()?.ort).toBe('Halle');
    expect(store.unterschriften()[2].status).toBe('angefragt');
  });

  it('übersetzt bekannte Diagnosecodes in verständliche Texte', async () => {
    await geladen();
    storage.unterschreibe.mockRejectedValue(
      new WorkerFehler('x', 409, 'VORGANG_UNTERSCHRIFT_FEHLT'),
    );
    expect(await store.unterschreiben('fest')).toBe(false);
    expect(store.aktionFehler()).toBe('Zuerst im Benutzermenü eine Unterschrift hinterlegen.');
    expect(vorgangFehlertext(new Error('x'))).toBe('Die Aktion konnte nicht ausgeführt werden.');
  });

  it('wechselt die Stufe mit der Version des Vorgangs', async () => {
    await geladen();
    storage.wechsleStufe.mockResolvedValue(testStand(testDarstellung(), '"2"'));
    expect(await store.stufeWechseln(1)).toBe(true);
    expect(storage.wechsleStufe).toHaveBeenCalledWith('v-1', 1, '"1"');
  });

  it('sendet mit der Version des Vorgangs und übernimmt den neuen Stand', async () => {
    await geladen();
    const neu = testDarstellung();
    neu.vorgang.stufe = 2;
    storage.sende.mockResolvedValue(testStand(neu, '"6"'));
    const eingabe = {
      modus: 'einreichen' as const,
      pdf: 'JVBERg==',
      empfaenger: ['a@example.test'],
      angebote: [],
      nachricht: '',
    };
    expect(await store.senden(eingabe)).toBe(true);
    expect(storage.sende).toHaveBeenCalledWith('v-1', '"1"', eingabe);
    expect(store.aktuell()?.daten.vorgang.stufe).toBe(2);
  });

  it('nennt bei einem unklaren Versand, dass nicht erneut gesendet werden soll', async () => {
    await geladen();
    storage.sende.mockRejectedValue(new WorkerFehler('x', 504, 'MAIL_VERSAND_ZEITLIMIT'));
    const eingabe = {
      modus: 'senden' as const,
      pdf: 'x',
      empfaenger: [],
      angebote: [],
      nachricht: '',
    };
    expect(await store.senden(eingabe)).toBe(false);
    expect(store.aktionFehler()).toContain('nicht erneut senden');
  });

  it('legt mehrere Angebote nacheinander ab und zeigt nach jedem den neuen Stand', async () => {
    await geladen();
    const mitEinem = testDarstellung();
    mitEinem.angebote = [
      {
        id: 'a1',
        dateiname: 'a.pdf',
        groesse: 1,
        quelle: 'upload',
        mailBetreff: null,
        mailAbsender: null,
        mailDatum: null,
        mailText: null,
        hochgeladenAm: '2026-11-13',
        hochgeladenVon: 'x',
      },
    ];
    const mitZwei = testDarstellung();
    mitZwei.angebote = [
      ...mitEinem.angebote,
      { ...mitEinem.angebote[0], id: 'a2', dateiname: 'b.pdf' },
    ];
    storage.angebotHochladen
      .mockResolvedValueOnce(testStand(mitEinem, '"2"'))
      .mockResolvedValueOnce(testStand(mitZwei, '"3"'));
    expect(
      await store.angeboteHochladen([
        { datei: new Blob(['a']), name: 'a.pdf' },
        { datei: new Blob(['b']), name: 'b.pdf' },
      ]),
    ).toBe(true);
    expect(storage.angebotHochladen).toHaveBeenCalledTimes(2);
    expect(store.aktuell()?.daten.angebote).toHaveLength(2);
  });

  it('meldet einen Uploadfehler mit verständlichem Text', async () => {
    await geladen();
    storage.angebotHochladen.mockRejectedValue(
      new WorkerFehler('x', 415, 'VORGANG_ANGEBOT_TYP_UNGUELTIG'),
    );
    expect(await store.angeboteHochladen([{ datei: new Blob(['a']), name: 'a.txt' }])).toBe(false);
    expect(store.aktionFehler()).toContain('PDF, PNG oder JPEG');
  });

  it('entfernt ein Angebot', async () => {
    await geladen();
    storage.angebotEntfernen.mockResolvedValue(testStand(testDarstellung(), '"4"'));
    expect(await store.angebotEntfernen('a1')).toBe(true);
    expect(storage.angebotEntfernen).toHaveBeenCalledWith('v-1', 'a1');
  });

  it('lädt die Liste über alle Fahrzeuge in einem Aufruf', async () => {
    await store.listeLaden();
    expect(storage.liste).toHaveBeenCalledTimes(1);
  });
});
