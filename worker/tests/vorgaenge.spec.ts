import { beforeEach, describe, expect, it } from 'vitest';
import { verarbeiteVorgaenge } from '../src/vorgaenge';
import { pruefeStufenwechsel } from '../src/vorgaenge-stufen';
import { fehlendePflichtangaben, pruefeSchadensmeldung } from '../src/vorgaenge-meldung-pruefung';
import { SqliteD1 } from './sqlite-d1';

const FAHRZEUG = '11111111-1111-4111-8111-111111111111';
const TIM = { email: 'tim.beispiel@example.test' };
const ZORA = { email: 'zora.muster@example.test' };
const MAX = { email: 'max.mustermann@example.test' };
const SCHRIFT = JSON.stringify({ art: 'schrift', text: 'Tim', font: 'Caveat' });

const MELDUNG = {
  art: 'schaden',
  datumFeststellung: '2026-11-12',
  einheit: 'BI EE 04',
  bezeichnung: 'GW SAN',
  kennzeichen: 'XX-HS 110',
  ort: '',
  sachverhalt: 'Das Stromaggregat springt nicht an.',
  stellungnahme: 'Der Sachverhalt wird wie oben beschrieben bestätigt.',
  empfehlung: '',
};

let fahrzeuge: SqliteD1;
let benutzer: SqliteD1;

function umgebung() {
  return { FAHRZEUGE_DB: fahrzeuge as never, BENUTZER_DB: benutzer as never };
}

async function rufe(
  identitaet: { email: string },
  methode: string,
  pfad: string,
  optionen: { koerper?: unknown; ifMatch?: string; ifNoneMatch?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (optionen.koerper !== undefined) headers['Content-Type'] = 'application/json';
  if (optionen.ifMatch) headers['If-Match'] = optionen.ifMatch;
  if (optionen.ifNoneMatch) headers['If-None-Match'] = optionen.ifNoneMatch;
  const antwort = await verarbeiteVorgaenge(
    new Request(`https://stationwizard.example.test${pfad}`, {
      method: methode,
      headers,
      body: optionen.koerper === undefined ? undefined : JSON.stringify(optionen.koerper),
    }),
    umgebung(),
    identitaet,
  );
  const text = await antwort.text();
  return {
    status: antwort.status,
    etag: antwort.headers.get('ETag'),
    diagnose: antwort.headers.get('X-Stationwizard-Diagnose'),
    json: text ? (JSON.parse(text) as Record<string, any>) : null,
  };
}

async function lege(identitaet = TIM, meldung: unknown = MELDUNG) {
  const antwort = await rufe(identitaet, 'POST', '/api/vorgaenge', {
    koerper: { fahrzeugId: FAHRZEUG, titel: 'Stromaggregat defekt', meldung },
    ifNoneMatch: '*',
  });
  expect(antwort.status).toBe(201);
  return antwort.json as Record<string, any>;
}

const meldungPfad = (id: string) => `/api/vorgaenge/${id}/meldung`;
const slotPfad = (id: string, slot: string) =>
  `/api/vorgaenge/${id}/meldung/unterschriften/${slot}`;

function person(email: string, rolle: string | null = null) {
  benutzer.db
    .prepare(
      "INSERT INTO benutzer (email, rolle, sonderrollen, erster_zugriff_am, letzter_zugriff_am) VALUES (?, ?, '[]', '2026-01-01', '2026-01-01')",
    )
    .run(email, rolle);
}

function hinterlegeUnterschrift(email: string) {
  benutzer.db
    .prepare(
      'INSERT INTO benutzer_unterschriften (email, art, daten, geaendert_am) VALUES (?, ?, ?, ?)',
    )
    .run(email, 'schrift', SCHRIFT, '2026-01-01');
}

beforeEach(() => {
  fahrzeuge = new SqliteD1(['fahrzeuge']);
  benutzer = new SqliteD1(['benutzer']);
  fahrzeuge.db
    .prepare(
      `INSERT INTO fahrzeuge (id, bezeichnung, funkrufname, kennzeichen, eigentuemer, bemerkung,
         wartungstermine, geaendert_am, geaendert_von)
       VALUES (?, 'GW SAN', 'Florian 1', 'XX-HS 110', 'organisation', '', '[]', '2026-01-01', 'x')`,
    )
    .run(FAHRZEUG);
  person(TIM.email);
  person(ZORA.email, 'zugfuehrung');
  person(MAX.email);
});

describe('Schadensmeldung prüfen', () => {
  it('nimmt eine vollständige Meldung an und meldet fehlende Pflichtangaben', () => {
    const inhalt = pruefeSchadensmeldung(MELDUNG);
    expect(inhalt).not.toBeNull();
    expect(fehlendePflichtangaben(inhalt!)).toEqual([]);
    expect(
      fehlendePflichtangaben(pruefeSchadensmeldung({ ...MELDUNG, einheit: '', sachverhalt: '' })!),
    ).toEqual(['Einheit', 'Sachverhalt']);
  });

  it.each([
    ['unbekanntes Feld', { ...MELDUNG, extra: 'x' }],
    ['fehlendes Feld', { ...MELDUNG, ort: undefined }],
    ['unbekannte Art', { ...MELDUNG, art: 'sonstiges' }],
    ['ungültiges Datum', { ...MELDUNG, datumFeststellung: '2026-02-30' }],
    ['zu lange Einheit', { ...MELDUNG, einheit: 'x'.repeat(41) }],
    ['zu langer Sachverhalt', { ...MELDUNG, sachverhalt: 'x'.repeat(4001) }],
    ['Zeilenumbruch im Kennzeichen', { ...MELDUNG, kennzeichen: 'XX\nHS' }],
    ['Steuerzeichen im Sachverhalt', { ...MELDUNG, sachverhalt: 'a\u0000b' }],
  ])('lehnt %s ab', (_name, wert) => {
    expect(pruefeSchadensmeldung(wert)).toBeNull();
  });

  it('erlaubt Zeilenumbrüche im Sachverhalt', () => {
    expect(pruefeSchadensmeldung({ ...MELDUNG, sachverhalt: 'a\nb' })?.sachverhalt).toBe('a\nb');
  });
});

describe('Vorgang anlegen und lesen', () => {
  it('legt einen Vorgang mit vollständiger Meldung auf Stufe 0 an', async () => {
    const vorgang = await lege();
    expect(vorgang['vorgang'].stufe).toBe(0);
    expect(vorgang['meldung'].vollstaendig).toBe(true);
    expect(vorgang['unterschriften']).toHaveLength(3);
    expect(vorgang['ereignisse'][0].beschreibung).toBe('Vorgang angelegt.');
  });

  it('legt eine unvollständige Meldung auf Stufe -1 an', async () => {
    const vorgang = await lege(TIM, { ...MELDUNG, sachverhalt: '' });
    expect(vorgang['vorgang'].stufe).toBe(-1);
    expect(vorgang['meldung'].vollstaendig).toBe(false);
  });

  it('verlangt If-None-Match, kennt das Fahrzeug und prüft den Körper', async () => {
    const ohne = await rufe(TIM, 'POST', '/api/vorgaenge', {
      koerper: { fahrzeugId: FAHRZEUG, titel: 'x', meldung: MELDUNG },
    });
    expect(ohne.status).toBe(400);
    const fremd = await rufe(TIM, 'POST', '/api/vorgaenge', {
      koerper: { fahrzeugId: '22222222-2222-4222-8222-222222222222', titel: 'x', meldung: MELDUNG },
      ifNoneMatch: '*',
    });
    expect(fremd.status).toBe(404);
    expect(fremd.diagnose).toBe('VORGANG_FAHRZEUG_UNBEKANNT');
    const schlecht = await rufe(TIM, 'POST', '/api/vorgaenge', {
      koerper: { fahrzeugId: FAHRZEUG, titel: '  ', meldung: MELDUNG },
      ifNoneMatch: '*',
    });
    expect(schlecht.status).toBe(400);
  });

  it('liefert die Liste mit Kennzahlen in einem Aufruf', async () => {
    await lege();
    const liste = await rufe(TIM, 'GET', '/api/vorgaenge');
    expect(liste.json?.['vorgaenge']).toHaveLength(1);
    expect(liste.json?.['vorgaenge'][0]).toMatchObject({
      fahrzeugBezeichnung: 'GW SAN',
      stufe: 0,
      meldungVollstaendig: true,
      pflichtUnterschriften: 0,
      angebote: 0,
    });
  });

  it('antwortet 404 für einen unbekannten Vorgang und 405 für falsche Methoden', async () => {
    expect(
      (await rufe(TIM, 'GET', '/api/vorgaenge/33333333-3333-4333-8333-333333333333')).status,
    ).toBe(404);
    expect((await rufe(TIM, 'DELETE', '/api/vorgaenge')).status).toBe(405);
  });
});

describe('Meldung speichern', () => {
  it('verlangt die Version, lehnt veraltete ab und hebt die Stufe bei Vollständigkeit', async () => {
    const vorgang = await lege(TIM, { ...MELDUNG, sachverhalt: '' });
    const id = vorgang['vorgang'].id;
    const version = String(vorgang['meldung'].version);

    expect((await rufe(TIM, 'PUT', meldungPfad(id), { koerper: MELDUNG })).status).toBe(428);
    expect(
      (await rufe(TIM, 'PUT', meldungPfad(id), { koerper: MELDUNG, ifMatch: '"99"' })).status,
    ).toBe(412);

    const ok = await rufe(TIM, 'PUT', meldungPfad(id), {
      koerper: MELDUNG,
      ifMatch: `"${version}"`,
    });
    expect(ok.status).toBe(200);
    expect(ok.json?.['vorgang'].stufe).toBe(0);
    expect(ok.json?.['meldung'].version).toBe(2);
    // Dieselbe Version noch einmal ist jetzt veraltet.
    expect(
      (await rufe(TIM, 'PUT', meldungPfad(id), { koerper: MELDUNG, ifMatch: `"${version}"` }))
        .status,
    ).toBe(412);
  });

  it('setzt die Stufe zurück, wenn die Meldung wieder unvollständig wird', async () => {
    const vorgang = await lege();
    const antwort = await rufe(TIM, 'PUT', meldungPfad(vorgang['vorgang'].id), {
      koerper: { ...MELDUNG, kennzeichen: '' },
      ifMatch: '"1"',
    });
    expect(antwort.json?.['vorgang'].stufe).toBe(-1);
  });
});

describe('Unterschriften', () => {
  it('verlangt eine hinterlegte Unterschrift und sperrt danach die Meldung', async () => {
    const vorgang = await lege();
    const id = vorgang['vorgang'].id;
    const ohne = await rufe(TIM, 'PUT', slotPfad(id, 'fest'), {
      koerper: { aktion: 'unterschreiben' },
    });
    expect(ohne.status).toBe(409);
    expect(ohne.diagnose).toBe('VORGANG_UNTERSCHRIFT_FEHLT');

    hinterlegeUnterschrift(TIM.email);
    const ok = await rufe(TIM, 'PUT', slotPfad(id, 'fest'), {
      koerper: { aktion: 'unterschreiben' },
    });
    expect(ok.status).toBe(200);
    const fest = ok.json?.['unterschriften'].find((u: any) => u.slot === 'fest');
    expect(fest).toMatchObject({ status: 'unterschrieben', name: 'Tim Beispiel' });
    // Die Momentaufnahme stammt aus dem Konto, nicht aus dem Anfragekörper.
    expect(fest.signatur).toEqual(JSON.parse(SCHRIFT));
    expect(ok.json?.['meldung'].gesperrt).toBe(true);

    const gesperrt = await rufe(TIM, 'PUT', meldungPfad(id), {
      koerper: { ...MELDUNG, ort: 'neu' },
      ifMatch: '"1"',
    });
    expect(gesperrt.status).toBe(409);
    expect(gesperrt.diagnose).toBe('VORGANG_MELDUNG_GESPERRT');
    const doppelt = await rufe(TIM, 'PUT', slotPfad(id, 'fest'), {
      koerper: { aktion: 'unterschreiben' },
    });
    expect(doppelt.diagnose).toBe('VORGANG_UNTERSCHRIFT_VORHANDEN');
  });

  it('verlangt eine vollständige Meldung', async () => {
    hinterlegeUnterschrift(TIM.email);
    const vorgang = await lege(TIM, { ...MELDUNG, sachverhalt: '' });
    const antwort = await rufe(TIM, 'PUT', slotPfad(vorgang['vorgang'].id, 'fest'), {
      koerper: { aktion: 'unterschreiben' },
    });
    expect(antwort.diagnose).toBe('VORGANG_MELDUNG_UNVOLLSTAENDIG');
  });

  it('fordert eine Unterschrift an, zeigt sie als Aufgabe und lässt nur die angefragte Person zu', async () => {
    const vorgang = await lege();
    const id = vorgang['vorgang'].id;
    hinterlegeUnterschrift(MAX.email);

    const unbekannt = await rufe(TIM, 'PUT', slotPfad(id, 'verantw'), {
      koerper: { aktion: 'anfordern', an: 'niemand@example.test' },
    });
    expect(unbekannt.status).toBe(404);

    const angefragt = await rufe(TIM, 'PUT', slotPfad(id, 'verantw'), {
      koerper: { aktion: 'anfordern', an: ZORA.email },
    });
    expect(angefragt.status).toBe(200);

    const aufgaben = await rufe(ZORA, 'GET', '/api/vorgaenge/aufgaben');
    expect(aufgaben.json?.['unterschriften']).toEqual([
      expect.objectContaining({ vorgangId: id, slot: 'verantw', angefragtVon: TIM.email }),
    ]);
    expect((await rufe(MAX, 'GET', '/api/vorgaenge/aufgaben')).json?.['unterschriften']).toEqual(
      [],
    );

    const fremd = await rufe(MAX, 'PUT', slotPfad(id, 'verantw'), {
      koerper: { aktion: 'unterschreiben' },
    });
    expect(fremd.diagnose).toBe('VORGANG_UNTERSCHRIFT_ANGEFRAGT');

    hinterlegeUnterschrift(ZORA.email);
    const unterschrieben = await rufe(ZORA, 'PUT', slotPfad(id, 'verantw'), {
      koerper: { aktion: 'unterschreiben' },
    });
    expect(unterschrieben.status).toBe(200);
    expect((await rufe(ZORA, 'GET', '/api/vorgaenge/aufgaben')).json?.['unterschriften']).toEqual(
      [],
    );
  });

  it('zieht eine Anfrage zurück; eine fremde Unterschrift entfernt nur die Zugführung', async () => {
    const vorgang = await lege();
    const id = vorgang['vorgang'].id;
    await rufe(TIM, 'PUT', slotPfad(id, 'leitung'), {
      koerper: { aktion: 'anfordern', an: MAX.email },
    });
    const zurueck = await rufe(TIM, 'DELETE', slotPfad(id, 'leitung'));
    expect(zurueck.status).toBe(200);
    expect(zurueck.json?.['unterschriften'].find((u: any) => u.slot === 'leitung').status).toBe(
      'offen',
    );

    hinterlegeUnterschrift(MAX.email);
    await rufe(MAX, 'PUT', slotPfad(id, 'fest'), { koerper: { aktion: 'unterschreiben' } });
    const verweigert = await rufe(TIM, 'DELETE', slotPfad(id, 'fest'));
    expect(verweigert.status).toBe(403);
    expect((await rufe(MAX, 'DELETE', slotPfad(id, 'fest'))).status).toBe(200);

    await rufe(MAX, 'PUT', slotPfad(id, 'fest'), { koerper: { aktion: 'unterschreiben' } });
    const durchZugfuehrung = await rufe(ZORA, 'DELETE', slotPfad(id, 'fest'));
    expect(durchZugfuehrung.status).toBe(200);
    // Ohne Unterschrift ist die Meldung wieder bearbeitbar.
    expect(durchZugfuehrung.json?.['meldung'].gesperrt).toBe(false);
  });

  it('entfernt alle Unterschriften auf einmal', async () => {
    const vorgang = await lege();
    const id = vorgang['vorgang'].id;
    hinterlegeUnterschrift(TIM.email);
    await rufe(TIM, 'PUT', slotPfad(id, 'fest'), { koerper: { aktion: 'unterschreiben' } });
    const antwort = await rufe(TIM, 'DELETE', `/api/vorgaenge/${id}/meldung/unterschriften`);
    expect(antwort.json?.['meldung'].gesperrt).toBe(false);
    expect(antwort.json?.['unterschriften'].every((u: any) => u.status === 'offen')).toBe(true);
  });

  it('lehnt einen unbekannten Platz ab', async () => {
    const vorgang = await lege();
    const antwort = await rufe(TIM, 'PUT', slotPfad(vorgang['vorgang'].id, 'chef'), {
      koerper: { aktion: 'unterschreiben' },
    });
    expect(antwort.status).toBe(404);
  });
});

describe('Stufen', () => {
  function angebotAnlegen(vorgangId: string) {
    fahrzeuge.db
      .prepare(
        `INSERT INTO vorgang_angebote (id, vorgang_id, dateiname, groesse, r2_schluessel, quelle, hochgeladen_am, hochgeladen_von)
         VALUES (?, ?, 'a.pdf', 1, 'k', 'upload', '2026-01-01', 'x')`,
      )
      .run(crypto.randomUUID(), vorgangId);
  }

  const stufe = (id: string, nach: number, version: number, wer = TIM) =>
    rufe(wer, 'POST', `/api/vorgaenge/${id}/stufe`, { koerper: { nach }, ifMatch: `"${version}"` });

  it('verlangt für „Angebote eingeholt“ mindestens ein Angebot', async () => {
    const vorgang = await lege();
    const id = vorgang['vorgang'].id;
    const ohne = await stufe(id, 1, 1);
    expect(ohne.diagnose).toBe('VORGANG_ANGEBOT_FEHLT');
    angebotAnlegen(id);
    const mit = await stufe(id, 1, 1);
    expect(mit.status).toBe(200);
    expect(mit.json?.['vorgang'].stufe).toBe(1);
  });

  it('erlaubt „Eingereicht“ nur über Einreichen und „Genehmigt“ nur der Zugführung', async () => {
    const vorgang = await lege();
    const id = vorgang['vorgang'].id;
    angebotAnlegen(id);
    await stufe(id, 1, 1);
    expect((await stufe(id, 2, 2)).diagnose).toBe('VORGANG_NUR_UEBER_EINREICHEN');

    fahrzeuge.db.prepare('UPDATE vorgaenge SET stufe = 2, version = 3 WHERE id = ?').run(id);
    const keine = await stufe(id, 3, 3, TIM);
    expect(keine.status).toBe(403);
    const ok = await stufe(id, 4 - 1, 3, ZORA);
    expect(ok.status).toBe(200);
    expect(ok.json?.['vorgang'].stufe).toBe(3);
  });

  it('lässt Stufen nicht überspringen und prüft die Version', async () => {
    const vorgang = await lege();
    const id = vorgang['vorgang'].id;
    expect((await stufe(id, 4, 1)).diagnose).toBe('VORGANG_STUFE_UEBERSPRUNGEN');
    expect((await stufe(id, 1, 7)).status).toBe(412);
    expect(
      (await rufe(TIM, 'POST', `/api/vorgaenge/${id}/stufe`, { koerper: { nach: 1 } })).status,
    ).toBe(428);
    expect((await stufe(id, 9, 1)).status).toBe(400);
  });
});

describe('pruefeStufenwechsel', () => {
  it('lässt ab „Eingereicht“ nur die Zugführung zurückgehen', () => {
    expect(pruefeStufenwechsel({ stufe: 2, angebote: 1 }, 1, false)?.code).toBe(
      'VORGANG_ZURUECK_NICHT_ERLAUBT',
    );
    expect(pruefeStufenwechsel({ stufe: 2, angebote: 1 }, 1, true)).toBeNull();
    expect(pruefeStufenwechsel({ stufe: 1, angebote: 1 }, 0, false)).toBeNull();
  });

  it('verlangt vor der ersten Stufe eine vollständige Meldung', () => {
    expect(pruefeStufenwechsel({ stufe: -1, angebote: 0 }, 0, true)?.code).toBe(
      'VORGANG_MELDUNG_UNVOLLSTAENDIG',
    );
  });
});

describe('ohne Konfiguration', () => {
  it('sperrt ohne Datenbank mit festem Code', async () => {
    const antwort = await verarbeiteVorgaenge(
      new Request('https://stationwizard.example.test/api/vorgaenge'),
      {},
      TIM,
    );
    expect(antwort.status).toBe(503);
  });
});
