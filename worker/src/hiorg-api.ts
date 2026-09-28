import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istUmleitung, redigiere, ursachenText } from './diagnose';
import { istObjekt, istText, leseJsonBegrenzt, verwerfeInhalt } from './json-lesen';
import { leseZugangsdatum, type Zugangsdatum } from './zugangsdaten';

/**
 * HiOrg-Server-API (`api.hiorg-server.de`, OAuth2 Authorization Code) als
 * zweiter HiOrg-Weg neben EFS (`efs.ts`). EFS arbeitet mit einem
 * organisationsweiten API-Key; diese API verlangt dagegen ein Zugriffstoken,
 * das eine konkrete HiOrg-Person durch ihre eigene Anmeldung bei HiOrg
 * ausstellt. Die Daten entsprechen deshalb immer den HiOrg-Rechten genau der
 * Person, die die Verbindung hergestellt hat.
 *
 * Ablauf, vollständig im Worker:
 *
 * 1. `GET /hiorg/verbinden` (Seitenaufruf, hinter Access) setzt ein zufälliges
 *    `state` als `__Host-`-Cookie und leitet zur festen HiOrg-Anmeldeseite.
 * 2. HiOrg leitet auf `GET /hiorg/rueckruf` zurück. Der Worker vergleicht
 *    `state`, tauscht den Code mit Client-ID und Client-Secret gegen Token und
 *    legt diese AES-GCM-verschlüsselt in `hiorg_verbindungen` (BENUTZER_DB)
 *    unter der geprüften Access-E-Mail ab.
 * 3. `GET /api/hiorg/personal` ruft `/core/v1/personal` mit diesem Token ab,
 *    erneuert es bei Bedarf und gibt nur eine feste, kleine Feldauswahl weiter.
 *
 * Der Browser sieht weder Client-Secret noch Token noch eine Upstream-Adresse:
 * er navigiert ausschließlich auf die beiden festen Pfade derselben Origin.
 * Die einzige HiOrg-Adresse, die er zu sehen bekommt, ist die Anmeldeseite,
 * auf die der Worker ihn weiterleitet – das ist der Kern des OAuth-Ablaufs.
 *
 * Die Redirect-URI ist `<Origin>/hiorg/rueckruf` und muss genau so bei HiOrg
 * für den Client registriert sein (siehe docs/einrichtung.md). Eine auf
 * `…cloudflareaccess.com/cdn-cgi/access/callback` registrierte URI gehört zu
 * einer Access-Anmeldung über HiOrg und liefert dem Worker nie ein Token.
 */
export interface HiorgApiKonfiguration {
  HIORG_SERVER_CLIENTID?: Zugangsdatum;
  HIORG_SERVER_CLIENTSECRET?: Zugangsdatum;
  BENUTZER_DB?: D1Database;
}

export const HIORG_VERBINDEN_PFAD = '/hiorg/verbinden';
export const HIORG_RUECKRUF_PFAD = '/hiorg/rueckruf';
export const HIORG_VERBINDUNG_PFAD = '/api/hiorg/verbindung';
export const HIORG_PERSONAL_PFAD = '/api/hiorg/personal';

/** Feste Ziele aus der offiziellen OpenAPI-Beschreibung; nie aus Konfiguration abgeleitet. */
export const HIORG_AUTORISIERUNG_URL = 'https://api.hiorg-server.de/oauth/v1/authorize';
export const HIORG_TOKEN_URL = 'https://api.hiorg-server.de/oauth/v1/token';
/** Nur aktive Konten; `filter[status]` ist ein dokumentierter Parameter von `GET /personal`. */
export const HIORG_PERSONAL_URL =
  'https://api.hiorg-server.de/core/v1/personal?filter%5Bstatus%5D=aktiv';
/** Genau die für den Client freigegebenen Scopes. */
export const HIORG_SCOPE = 'openid personal:read';

export const HIORG_ZEITLIMIT_MS = 15_000;
export const MAX_HIORG_TOKEN_ANTWORT_BYTES = 64 * 1024;
export const MAX_HIORG_PERSONAL_ANTWORT_BYTES = 8 * 1024 * 1024;

const STATE_COOKIE = '__Host-stationwizard-hiorg-state';
const STATE_GUELTIGKEIT_S = 600;
const STATE_MUSTER = /^[A-Za-z0-9_-]{43}$/;
/** Ein Token gilt kurz vor seinem angekündigten Ablauf schon als abgelaufen. */
const ABLAUF_PUFFER_MS = 60_000;
const TOKEN_FORMAT = 'v1';
const RUECKKEHR_ZIEL = '/#/einsatz';

/** Ergebnis eines Verbindungsversuchs, als `?hiorg=` an die Einsatzplanung zurückgegeben. */
export type HiorgVerbindungsergebnis =
  'verbunden' | 'abgebrochen' | 'nicht-eingerichtet' | 'ungueltig' | 'fehlgeschlagen';

interface TokenDaten {
  zugang: string;
  erneuerung: string | null;
  /** Ablaufzeitpunkt in Millisekunden; `null`, wenn HiOrg keinen angekündigt hat. */
  ablaufMs: number | null;
}

type TokenErgebnis =
  | { erfolg: true; token: TokenDaten }
  | {
      erfolg: false;
      ursache: 'abgelehnt' | 'zeitlimit' | 'nicht-erreichbar' | 'umleitung' | 'ungueltig';
    };

interface Zugang {
  clientId: string;
  clientSecret: string;
  db: D1Database;
}

async function leseZugang(umgebung: HiorgApiKonfiguration): Promise<Zugang | undefined> {
  const [clientId, clientSecret] = await Promise.all([
    leseZugangsdatum(umgebung.HIORG_SERVER_CLIENTID),
    leseZugangsdatum(umgebung.HIORG_SERVER_CLIENTSECRET),
  ]);
  if (!umgebung.BENUTZER_DB || !istSauber(clientId) || !istSauber(clientSecret)) return undefined;
  return { clientId, clientSecret, db: umgebung.BENUTZER_DB };
}

/** Nur sichtbare ASCII-Zeichen; ein anderes Secret ist ein Konfigurationsfehler. */
function istSauber(wert: unknown, hoechstlaenge = 512): wert is string {
  return typeof wert === 'string' && wert.length <= hoechstlaenge && /^[\x21-\x7e]+$/.test(wert);
}

function rueckkehr(ergebnis: HiorgVerbindungsergebnis, cookie?: string): Response {
  const kopfzeilen = new Headers({
    Location: `${RUECKKEHR_ZIEL}?hiorg=${ergebnis}`,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  if (cookie) kopfzeilen.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers: kopfzeilen });
}

function stateCookie(wert: string, gueltigkeit: number): string {
  return `${STATE_COOKIE}=${wert}; Path=/; Max-Age=${gueltigkeit}; Secure; HttpOnly; SameSite=Lax`;
}

function base64Url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function ausBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binaer = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}

function redirectUri(anfrage: Request): string {
  return `${new URL(anfrage.url).origin}${HIORG_RUECKRUF_PFAD}`;
}

/** Schritt 1: Seitenaufruf, leitet mit frischem `state` zur HiOrg-Anmeldung. */
export async function verarbeiteHiorgVerbinden(
  anfrage: Request,
  umgebung: HiorgApiKonfiguration,
): Promise<Response> {
  if (anfrage.method !== 'GET') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'GET' });
  }
  const zugang = await leseZugang(umgebung);
  if (!zugang) return rueckkehr('nicht-eingerichtet');

  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const ziel = new URL(HIORG_AUTORISIERUNG_URL);
  ziel.search = new URLSearchParams({
    response_type: 'code',
    client_id: zugang.clientId,
    redirect_uri: redirectUri(anfrage),
    scope: HIORG_SCOPE,
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: ziel.href,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': stateCookie(state, STATE_GUELTIGKEIT_S),
    },
  });
}

function leseStateCookie(anfrage: Request): string | undefined {
  for (const teil of (anfrage.headers.get('Cookie') ?? '').split(';')) {
    const [name, ...rest] = teil.trim().split('=');
    if (name === STATE_COOKIE) return rest.join('=');
  }
  return undefined;
}

function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/** Schritt 2: Rückruf von HiOrg, tauscht den Code und speichert das Token verschlüsselt. */
export async function verarbeiteHiorgRueckruf(
  anfrage: Request,
  umgebung: HiorgApiKonfiguration,
  benutzer: Benutzer,
): Promise<Response> {
  if (anfrage.method !== 'GET') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'GET' });
  }
  // Das state-Cookie ist einmalig: es wird bei jedem Ausgang des Rückrufs gelöscht.
  const loeschen = stateCookie('', 0);
  const parameter = new URL(anfrage.url).searchParams;
  const erwartet = leseStateCookie(anfrage);
  const erhalten = parameter.get('state');
  if (
    !erwartet ||
    !erhalten ||
    !STATE_MUSTER.test(erwartet) ||
    !STATE_MUSTER.test(erhalten) ||
    !gleich(erwartet, erhalten)
  ) {
    return rueckkehr('ungueltig', loeschen);
  }
  if (parameter.has('error')) return rueckkehr('abgebrochen', loeschen);
  const code = parameter.get('code');
  if (!code || !/^[\x21-\x7e]{1,2048}$/.test(code)) return rueckkehr('ungueltig', loeschen);

  const zugang = await leseZugang(umgebung);
  if (!zugang) return rueckkehr('nicht-eingerichtet', loeschen);

  const ergebnis = await tokenAnfordern(zugang, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(anfrage),
  });
  if (!ergebnis.erfolg) {
    console.error('HIORG_TOKEN_TAUSCH_FEHLGESCHLAGEN', ergebnis.ursache);
    return rueckkehr('fehlgeschlagen', loeschen);
  }
  try {
    const jetzt = new Date().toISOString();
    await zugang.db
      .prepare(
        `INSERT INTO hiorg_verbindungen (email, token_daten, verbunden_am, aktualisiert_am)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET token_daten = excluded.token_daten,
           verbunden_am = excluded.verbunden_am, aktualisiert_am = excluded.aktualisiert_am`,
      )
      .bind(
        benutzer.email,
        await verschluesseln(ergebnis.token, zugang.clientSecret, benutzer.email),
        jetzt,
        jetzt,
      )
      .run();
  } catch (ursache) {
    console.error('HIORG_VERBINDUNG_SPEICHERN_FEHLGESCHLAGEN', ursachenText(ursache));
    return rueckkehr('fehlgeschlagen', loeschen);
  }
  return rueckkehr('verbunden', loeschen);
}

/** Schritt 3 und Verbindungsverwaltung unter `/api/hiorg/`. */
export async function verarbeiteHiorgApi(
  anfrage: Request,
  umgebung: HiorgApiKonfiguration,
  benutzer: Benutzer,
): Promise<Response> {
  const pfad = new URL(anfrage.url).pathname;
  if (pfad === HIORG_VERBINDUNG_PFAD) {
    if (anfrage.method !== 'GET' && anfrage.method !== 'DELETE') {
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, DELETE',
      });
    }
    const zugang = await leseZugang(umgebung);
    if (!zugang) return jsonAntwort({ eingerichtet: false, verbunden: false });
    try {
      if (anfrage.method === 'DELETE') {
        // HiOrg dokumentiert keinen Widerrufsendpunkt; das Token wird hier
        // nur verworfen und läuft bei HiOrg von selbst ab.
        await verbindungLoeschen(zugang.db, benutzer.email);
        return jsonAntwort({ eingerichtet: true, verbunden: false });
      }
      const zeile = await verbindungLesen(zugang.db, benutzer.email);
      return jsonAntwort({ eingerichtet: true, verbunden: zeile !== null });
    } catch (ursache) {
      console.error('HIORG_VERBINDUNG_DB_FEHLER', ursachenText(ursache));
      return fehlerAntwort(
        'HIORG_SPEICHER_FEHLER',
        'Die HiOrg-Verbindung konnte nicht gelesen werden.',
        500,
      );
    }
  }

  if (pfad === HIORG_PERSONAL_PFAD) {
    if (anfrage.method !== 'GET') {
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }
    if (new URL(anfrage.url).search !== '') {
      return fehlerAntwort('HIORG_ANFRAGE_UNGUELTIG', 'Keine URL-Parameter erlaubt.', 400);
    }
    const zugang = await leseZugang(umgebung);
    if (!zugang) {
      return fehlerAntwort(
        'HIORG_API_KONFIGURATION_FEHLT',
        'Die HiOrg-Server-API ist noch nicht eingerichtet.',
        503,
      );
    }
    return personalAbrufen(zugang, benutzer.email);
  }

  return fehlerAntwort('API_NICHT_GEFUNDEN', 'API-Endpunkt nicht gefunden.', 404);
}

const NICHT_VERBUNDEN = (): Response =>
  fehlerAntwort(
    'HIORG_NICHT_VERBUNDEN',
    'Es besteht keine Verbindung zum HiOrg-Server. Bitte zuerst verbinden.',
    409,
  );

const VERBINDUNG_ABGELAUFEN = (): Response =>
  fehlerAntwort(
    'HIORG_VERBINDUNG_ABGELAUFEN',
    'Die Verbindung zum HiOrg-Server ist abgelaufen. Bitte erneut verbinden.',
    409,
  );

function transportFehler(
  ursache: Exclude<Extract<TokenErgebnis, { erfolg: false }>['ursache'], 'abgelehnt'>,
): Response {
  switch (ursache) {
    case 'zeitlimit':
      return fehlerAntwort('HIORG_API_ZEITLIMIT', 'HiOrg antwortet nicht rechtzeitig.', 504);
    case 'nicht-erreichbar':
      return fehlerAntwort(
        'HIORG_API_NICHT_ERREICHBAR',
        'HiOrg ist derzeit nicht erreichbar.',
        502,
      );
    case 'umleitung':
      return fehlerAntwort(
        'HIORG_API_UMLEITUNG',
        'HiOrg beantwortet die Anfrage mit einer Weiterleitung.',
        502,
      );
    case 'ungueltig':
      return fehlerAntwort(
        'HIORG_API_ANTWORT_UNGUELTIG',
        'HiOrg hat keine gültigen Daten geliefert.',
        502,
      );
  }
}

async function personalAbrufen(zugang: Zugang, email: string): Promise<Response> {
  let gespeichert: string | null;
  try {
    gespeichert = await verbindungLesen(zugang.db, email);
  } catch (ursache) {
    console.error('HIORG_VERBINDUNG_DB_FEHLER', ursachenText(ursache));
    return fehlerAntwort(
      'HIORG_SPEICHER_FEHLER',
      'Die HiOrg-Verbindung konnte nicht gelesen werden.',
      500,
    );
  }
  if (gespeichert === null) return NICHT_VERBUNDEN();
  let token = await entschluesseln(gespeichert, zugang.clientSecret, email);
  if (!token) {
    // Etwa nach einem neuen Client-Secret: der alte Stand ist nicht mehr lesbar.
    await verbindungLoeschenStill(zugang.db, email);
    return VERBINDUNG_ABGELAUFEN();
  }

  let erneuert = false;
  if (token.ablaufMs !== null && Date.now() >= token.ablaufMs - ABLAUF_PUFFER_MS) {
    const neu = await erneuern(zugang, email, gespeichert, token);
    if (neu instanceof Response) return neu;
    token = neu;
    erneuert = true;
  }

  let abruf = await personalAnfordern(token.zugang);
  if (abruf.art === 'nicht-autorisiert' && !erneuert && token.erneuerung) {
    // Ein vorzeitig ungültiges Token: einmal erneuern und den Lesezugriff wiederholen.
    const neu = await erneuern(zugang, email, gespeichert, token);
    if (neu instanceof Response) return neu;
    token = neu;
    abruf = await personalAnfordern(token.zugang);
  }

  switch (abruf.art) {
    case 'erfolg': {
      const personen = filterePersonal(abruf.inhalt);
      // Auch ein fremder Server darf ein Token nicht in einem erlaubten Textfeld spiegeln.
      if (
        !personen ||
        enthaeltGeheimnis(personen, [token.zugang, token.erneuerung, zugang.clientSecret])
      ) {
        return transportFehler('ungueltig');
      }
      return jsonAntwort({ personen });
    }
    case 'nicht-autorisiert':
      await verbindungLoeschenStill(zugang.db, email);
      return VERBINDUNG_ABGELAUFEN();
    case 'verboten':
      return fehlerAntwort(
        'HIORG_API_BERECHTIGUNG_FEHLT',
        'Das verbundene HiOrg-Konto darf die Personaldaten nicht abrufen.',
        403,
      );
    case 'gesperrt':
      return fehlerAntwort(
        'HIORG_API_FUNKTION_GESPERRT',
        'Die Personal-API ist in der HiOrg-Lizenz nicht freigeschaltet.',
        502,
      );
    case 'abgelehnt':
      return fehlerAntwort('HIORG_API_ABRUF_FEHLGESCHLAGEN', 'HiOrg hat den Abruf abgelehnt.', 502);
    case 'zu-gross':
      return fehlerAntwort('HIORG_API_ANTWORT_ZU_GROSS', 'Die HiOrg-Antwort ist zu groß.', 502);
    default:
      return transportFehler(abruf.art);
  }
}

/**
 * Erneuert das Token mit dem Refresh-Token. Lehnt HiOrg ab, kann eine
 * parallele Anfrage das Refresh-Token bereits verbraucht und ein neues
 * gespeichert haben – dann gilt dieses, statt die Verbindung zu verwerfen.
 */
async function erneuern(
  zugang: Zugang,
  email: string,
  gespeichert: string,
  token: TokenDaten,
): Promise<TokenDaten | Response> {
  if (!token.erneuerung) {
    await verbindungLoeschenStill(zugang.db, email);
    return VERBINDUNG_ABGELAUFEN();
  }
  const ergebnis = await tokenAnfordern(zugang, {
    grant_type: 'refresh_token',
    refresh_token: token.erneuerung,
  });
  if (ergebnis.erfolg) {
    const neu: TokenDaten = {
      ...ergebnis.token,
      // Ohne neues Refresh-Token bleibt das bisherige gültig.
      erneuerung: ergebnis.token.erneuerung ?? token.erneuerung,
    };
    try {
      await zugang.db
        .prepare(
          `UPDATE hiorg_verbindungen SET token_daten = ?, aktualisiert_am = ?
           WHERE email = ? AND token_daten = ?`,
        )
        .bind(
          await verschluesseln(neu, zugang.clientSecret, email),
          new Date().toISOString(),
          email,
          gespeichert,
        )
        .run();
    } catch (ursache) {
      // Das neue Token gilt für diese Anfrage trotzdem; beim nächsten Mal wird erneut erneuert.
      console.error('HIORG_VERBINDUNG_SPEICHERN_FEHLGESCHLAGEN', ursachenText(ursache));
    }
    return neu;
  }
  if (ergebnis.ursache !== 'abgelehnt') return transportFehler(ergebnis.ursache);

  try {
    const aktuell = await verbindungLesen(zugang.db, email);
    if (aktuell !== null && aktuell !== gespeichert) {
      const parallel = await entschluesseln(aktuell, zugang.clientSecret, email);
      if (parallel) return parallel;
    }
  } catch (ursache) {
    console.error('HIORG_VERBINDUNG_DB_FEHLER', ursachenText(ursache));
  }
  await verbindungLoeschenStill(zugang.db, email);
  return VERBINDUNG_ABGELAUFEN();
}

async function tokenAnfordern(
  zugang: Zugang,
  parameter: Record<string, string>,
): Promise<TokenErgebnis> {
  // client_secret_post: Client-ID und Secret als Formularfelder. Eine
  // Basic-Authentifizierung müsste beide nach RFC 6749 zusätzlich
  // formularkodieren, was nicht jeder Server gleich auslegt.
  const formular = new URLSearchParams({
    ...parameter,
    client_id: zugang.clientId,
    client_secret: zugang.clientSecret,
  });
  const geheim = [zugang.clientSecret, parameter['code'], parameter['refresh_token']];
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), HIORG_ZEITLIMIT_MS);
  try {
    let antwort: Response;
    try {
      antwort = await fetch(HIORG_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: formular.toString(),
        redirect: 'manual',
        signal: abbruch.signal,
      });
    } catch (fehler) {
      if (abbruch.signal.aborted) return { erfolg: false, ursache: 'zeitlimit' };
      console.error('HIORG_TOKEN_NICHT_ERREICHBAR', redigiere(ursachenText(fehler), geheim));
      return { erfolg: false, ursache: 'nicht-erreichbar' };
    }
    if (istUmleitung(antwort)) {
      await verwerfeInhalt(antwort);
      return { erfolg: false, ursache: 'umleitung' };
    }
    if (antwort.status === 400 || antwort.status === 401) {
      // invalid_grant, invalid_client o. Ä.: der Antworttext bleibt unveröffentlicht.
      console.error('HIORG_TOKEN_ABGELEHNT', antwort.status);
      await verwerfeInhalt(antwort);
      return { erfolg: false, ursache: 'abgelehnt' };
    }
    if (!antwort.ok) {
      console.error('HIORG_TOKEN_FEHLER', antwort.status);
      await verwerfeInhalt(antwort);
      return { erfolg: false, ursache: 'nicht-erreichbar' };
    }
    const gelesen = await leseJsonBegrenzt(antwort, MAX_HIORG_TOKEN_ANTWORT_BYTES, abbruch.signal);
    if (abbruch.signal.aborted) return { erfolg: false, ursache: 'zeitlimit' };
    const token = gelesen.erfolg ? leseTokenAntwort(gelesen.inhalt) : undefined;
    return token ? { erfolg: true, token } : { erfolg: false, ursache: 'ungueltig' };
  } finally {
    clearTimeout(zeitlimit);
  }
}

function leseTokenAntwort(inhalt: unknown): TokenDaten | undefined {
  if (!istObjekt(inhalt)) return undefined;
  const zugang = inhalt['access_token'];
  const typ = inhalt['token_type'];
  const erneuerung = inhalt['refresh_token'];
  const laufzeit = inhalt['expires_in'];
  if (!istSauber(zugang, 8192)) return undefined;
  if (typ !== undefined && (!istText(typ) || typ.toLowerCase() !== 'bearer')) return undefined;
  if (erneuerung !== undefined && erneuerung !== null && !istSauber(erneuerung, 8192)) {
    return undefined;
  }
  if (
    laufzeit !== undefined &&
    (typeof laufzeit !== 'number' || !Number.isFinite(laufzeit) || laufzeit <= 0)
  ) {
    return undefined;
  }
  return {
    zugang,
    erneuerung: typeof erneuerung === 'string' ? erneuerung : null,
    ablaufMs: typeof laufzeit === 'number' ? Date.now() + laufzeit * 1000 : null,
  };
}

type PersonalAbruf =
  | { art: 'erfolg'; inhalt: unknown }
  | {
      art:
        | 'nicht-autorisiert'
        | 'verboten'
        | 'gesperrt'
        | 'abgelehnt'
        | 'zu-gross'
        | 'zeitlimit'
        | 'nicht-erreichbar'
        | 'umleitung'
        | 'ungueltig';
    };

async function personalAnfordern(zugangstoken: string): Promise<PersonalAbruf> {
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), HIORG_ZEITLIMIT_MS);
  try {
    let antwort: Response;
    try {
      antwort = await fetch(HIORG_PERSONAL_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${zugangstoken}`,
          Accept: 'application/vnd.api+json',
        },
        redirect: 'manual',
        signal: abbruch.signal,
      });
    } catch (fehler) {
      if (abbruch.signal.aborted) return { art: 'zeitlimit' };
      console.error('HIORG_API_NICHT_ERREICHBAR', redigiere(ursachenText(fehler), [zugangstoken]));
      return { art: 'nicht-erreichbar' };
    }
    if (istUmleitung(antwort)) {
      await verwerfeInhalt(antwort);
      return { art: 'umleitung' };
    }
    if (!antwort.ok) {
      console.error('HIORG_API_ABRUF_FEHLGESCHLAGEN', antwort.status);
      await verwerfeInhalt(antwort);
      if (antwort.status === 401) return { art: 'nicht-autorisiert' };
      if (antwort.status === 403) return { art: 'verboten' };
      if (antwort.status === 423) return { art: 'gesperrt' };
      return { art: 'abgelehnt' };
    }
    const gelesen = await leseJsonBegrenzt(
      antwort,
      MAX_HIORG_PERSONAL_ANTWORT_BYTES,
      abbruch.signal,
    );
    if (abbruch.signal.aborted) return { art: 'zeitlimit' };
    if (!gelesen.erfolg) return { art: gelesen.ursache === 'zu-gross' ? 'zu-gross' : 'ungueltig' };
    return { art: 'erfolg', inhalt: gelesen.inhalt };
  } finally {
    clearTimeout(zeitlimit);
  }
}

export interface HiorgPersonAusgabe {
  id: string;
  vorname: string;
  nachname: string;
  gruppen: string[];
  qualifikationen: { liste: string | null; name: string | null; kurz: string | null }[];
  telefon?: string;
}

function optionalerText(wert: unknown): string | null | undefined {
  if (wert === undefined || wert === null) return null;
  return typeof wert === 'string' ? wert : undefined;
}

/**
 * Feste Feldauswahl aus `user_get`: Name, Gruppen, Qualifikationen und Handy
 * (wie `tel_mobil` bei EFS). Anschrift, Geburtsdaten, Bankverbindung,
 * Ernährung, Allergien, Führerscheindaten, Bemerkungen, Rechte und
 * benutzerdefinierte Felder verlassen den Worker nie. Eine unerwartete Form
 * verwirft die gesamte Antwort statt sie teilweise durchzulassen.
 */
export function filterePersonal(inhalt: unknown): HiorgPersonAusgabe[] | undefined {
  if (!istObjekt(inhalt) || !Array.isArray(inhalt['data'])) return undefined;
  const personen: HiorgPersonAusgabe[] = [];
  for (const eintrag of inhalt['data']) {
    if (!istObjekt(eintrag) || !istObjekt(eintrag['attributes'])) return undefined;
    const id = eintrag['id'];
    const attribute = eintrag['attributes'];
    const vorname = attribute['vorname'];
    const nachname = attribute['nachname'];
    if (!istText(id) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return undefined;
    if (!istText(vorname) || !istText(nachname)) return undefined;

    const gruppenRoh = attribute['gruppen_namen'] ?? [];
    if (!Array.isArray(gruppenRoh) || !gruppenRoh.every(istText)) return undefined;

    const qualifikationenRoh = attribute['qualifikationen'] ?? [];
    if (!Array.isArray(qualifikationenRoh)) return undefined;
    const qualifikationen: HiorgPersonAusgabe['qualifikationen'] = [];
    for (const qualifikation of qualifikationenRoh) {
      if (!istObjekt(qualifikation)) return undefined;
      const liste = optionalerText(qualifikation['liste']);
      const name = optionalerText(qualifikation['name']);
      const kurz = optionalerText(qualifikation['name_kurz']);
      if (liste === undefined || name === undefined || kurz === undefined) return undefined;
      if (name === null && kurz === null) continue;
      qualifikationen.push({ liste, name, kurz });
    }

    const handy = optionalerText(attribute['handy']);
    if (handy === undefined) return undefined;

    personen.push({
      id,
      vorname,
      nachname,
      gruppen: gruppenRoh,
      qualifikationen,
      ...(handy ? { telefon: handy } : {}),
    });
  }
  return personen;
}

function enthaeltGeheimnis(daten: unknown, geheim: (string | null)[]): boolean {
  const text = JSON.stringify(daten);
  return geheim.some((wert) => !!wert && text.includes(wert));
}

async function verbindungLesen(db: D1Database, email: string): Promise<string | null> {
  const zeile = await db
    .prepare('SELECT token_daten FROM hiorg_verbindungen WHERE email = ?')
    .bind(email)
    .first<{ token_daten: string }>();
  return zeile?.token_daten ?? null;
}

async function verbindungLoeschen(db: D1Database, email: string): Promise<void> {
  await db.prepare('DELETE FROM hiorg_verbindungen WHERE email = ?').bind(email).run();
}

async function verbindungLoeschenStill(db: D1Database, email: string): Promise<void> {
  try {
    await verbindungLoeschen(db, email);
  } catch (ursache) {
    console.error('HIORG_VERBINDUNG_DB_FEHLER', ursachenText(ursache));
  }
}

/**
 * AES-GCM mit einem per HKDF aus dem Client-Secret abgeleiteten Schlüssel;
 * die E-Mail ist zusätzliche authentifizierte Angabe, damit ein Datensatz nicht
 * unter einer anderen Identität gültig wird. Ein neues Client-Secret macht alle
 * gespeicherten Verbindungen unlesbar – sie werden dann neu hergestellt.
 */
async function tokenSchluessel(clientSecret: string): Promise<CryptoKey> {
  const kodierer = new TextEncoder();
  const basis = await crypto.subtle.importKey('raw', kodierer.encode(clientSecret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: kodierer.encode('stationwizard-hiorg-token'),
      info: kodierer.encode(TOKEN_FORMAT),
    },
    basis,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function verschluesseln(
  token: TokenDaten,
  clientSecret: string,
  email: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const inhalt = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(email) },
    await tokenSchluessel(clientSecret),
    new TextEncoder().encode(JSON.stringify(token)),
  );
  return `${TOKEN_FORMAT}.${base64Url(iv)}.${base64Url(new Uint8Array(inhalt))}`;
}

async function entschluesseln(
  gespeichert: string,
  clientSecret: string,
  email: string,
): Promise<TokenDaten | undefined> {
  const [format, iv, inhalt, ...rest] = gespeichert.split('.');
  if (format !== TOKEN_FORMAT || !iv || !inhalt || rest.length > 0) return undefined;
  try {
    const klartext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ausBase64Url(iv), additionalData: new TextEncoder().encode(email) },
      await tokenSchluessel(clientSecret),
      ausBase64Url(inhalt),
    );
    const daten: unknown = JSON.parse(new TextDecoder().decode(klartext));
    if (
      !istObjekt(daten) ||
      !istText(daten['zugang']) ||
      (daten['erneuerung'] !== null && !istText(daten['erneuerung'])) ||
      (daten['ablaufMs'] !== null && typeof daten['ablaufMs'] !== 'number')
    ) {
      return undefined;
    }
    return {
      zugang: daten['zugang'],
      erneuerung: daten['erneuerung'],
      ablaufMs: daten['ablaufMs'],
    };
  } catch {
    return undefined;
  }
}
