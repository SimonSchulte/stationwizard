import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { ursachenText } from './diagnose';
import {
  base64Url,
  HIORG_AUTORISIERUNG_URL,
  HIORG_SCOPE,
  type HiorgApiKonfiguration,
  type HiorgVerbindungsergebnis,
  leseZugang,
  MAX_CODE_ANFRAGE_BYTES,
  RUECKKEHR_ZIELE,
  STANDARD_ZIEL,
  STATE_COOKIE,
  STATE_GUELTIGKEIT_S,
  STATE_MUSTER,
  type TokenErgebnis,
  transportFehler,
  type Zugang,
} from './hiorg-gemeinsam';
import { verschluesseln } from './hiorg-tokenablage';
import { tokenAnfordern } from './hiorg-upstream';
import { istObjekt, istText, leseJsonBegrenzt } from './json-lesen';

/** OAuth-Schritte 1 und 2: Verbinden, automatischer Rückruf und manuelles Einlösen des Codes. */

function rueckkehr(ergebnis: HiorgVerbindungsergebnis, ziel: string, cookie?: string): Response {
  const kopfzeilen = new Headers({
    Location: `${RUECKKEHR_ZIELE[ziel] ?? RUECKKEHR_ZIELE[STANDARD_ZIEL]}?hiorg=${ergebnis}`,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  if (cookie) kopfzeilen.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers: kopfzeilen });
}

function stateCookie(wert: string, gueltigkeit: number): string {
  return `${STATE_COOKIE}=${wert}; Path=/; Max-Age=${gueltigkeit}; Secure; HttpOnly; SameSite=Lax`;
}

/** Schritt 1: Seitenaufruf, leitet mit frischem `state` zur HiOrg-Anmeldung. */
export async function verarbeiteHiorgVerbinden(
  anfrage: Request,
  umgebung: HiorgApiKonfiguration,
): Promise<Response> {
  if (anfrage.method !== 'GET') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'GET' });
  }
  const zielParameter = new URL(anfrage.url).searchParams.get('ziel') ?? STANDARD_ZIEL;
  const rueckkehrZiel = Object.hasOwn(RUECKKEHR_ZIELE, zielParameter)
    ? zielParameter
    : STANDARD_ZIEL;
  const zugang = await leseZugang(umgebung, anfrage);
  if (!zugang) return rueckkehr('nicht-eingerichtet', rueckkehrZiel);

  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const ziel = new URL(HIORG_AUTORISIERUNG_URL);
  ziel.search = new URLSearchParams({
    response_type: 'code',
    client_id: zugang.clientId,
    redirect_uri: zugang.redirectUri,
    scope: HIORG_SCOPE,
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: ziel.href,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      // Das Rückkehrziel reist im selben HttpOnly-Cookie mit, nie über HiOrg.
      'Set-Cookie': stateCookie(`${state}.${rueckkehrZiel}`, STATE_GUELTIGKEIT_S),
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
  const [erwartet, cookieZiel] = (leseStateCookie(anfrage) ?? '').split('.');
  const ziel =
    cookieZiel && Object.hasOwn(RUECKKEHR_ZIELE, cookieZiel) ? cookieZiel : STANDARD_ZIEL;
  const erhalten = parameter.get('state');
  if (!stateGueltig(erwartet, erhalten)) {
    return rueckkehr('ungueltig', ziel, loeschen);
  }
  if (parameter.has('error')) return rueckkehr('abgebrochen', ziel, loeschen);
  const code = parameter.get('code');
  if (!code || !/^[\x21-\x7e]{1,2048}$/.test(code)) return rueckkehr('ungueltig', ziel, loeschen);

  const zugang = await leseZugang(umgebung, anfrage);
  // Nur im automatischen Modus ist dieser Pfad die registrierte Redirect-URI.
  if (!zugang || zugang.modus !== 'automatisch') {
    return rueckkehr('nicht-eingerichtet', ziel, loeschen);
  }

  const ergebnis = await codeEinloesen(zugang, code, benutzer.email);
  return rueckkehr(ergebnis === 'verbunden' ? 'verbunden' : 'fehlgeschlagen', ziel, loeschen);
}

/** Tauscht den Code gegen Token und speichert sie verschlüsselt. */
async function codeEinloesen(
  zugang: Zugang,
  code: string,
  email: string,
): Promise<'verbunden' | Extract<TokenErgebnis, { erfolg: false }>['ursache'] | 'speicher'> {
  const ergebnis = await tokenAnfordern(zugang, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: zugang.redirectUri,
  });
  if (!ergebnis.erfolg) {
    console.error('HIORG_TOKEN_TAUSCH_FEHLGESCHLAGEN', ergebnis.ursache);
    return ergebnis.ursache;
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
      .bind(email, await verschluesseln(ergebnis.token, zugang.clientSecret, email), jetzt, jetzt)
      .run();
  } catch (ursache) {
    console.error('HIORG_VERBINDUNG_SPEICHERN_FEHLGESCHLAGEN', ursachenText(ursache));
    return 'speicher';
  }
  return 'verbunden';
}

function stateGueltig(erwartet: string | undefined, erhalten: string | null): boolean {
  return (
    !!erwartet &&
    !!erhalten &&
    STATE_MUSTER.test(erwartet) &&
    STATE_MUSTER.test(erhalten) &&
    gleich(erwartet, erhalten)
  );
}

/**
 * Manueller Rückruf: die Person fügt die Adresse aus der Adresszeile der
 * Access-Fehlerseite ein. Angenommen wird ausschließlich genau die
 * konfigurierte Redirect-URI mit `state` und `code` beziehungsweise `error`.
 * Das state-Cookie wird erst verbraucht, wenn `state` passt – ein
 * Tippfehler in der eingefügten Adresse erzwingt keine neue Anmeldung.
 */
export async function codeAusAdresse(
  anfrage: Request,
  umgebung: HiorgApiKonfiguration,
  benutzer: Benutzer,
): Promise<Response> {
  if (anfrage.method !== 'POST') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'POST' });
  }
  if (
    anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    return fehlerAntwort('HIORG_INHALTSTYP_UNGUELTIG', 'JSON als Anfrageformat erforderlich.', 415);
  }
  const zugang = await leseZugang(umgebung, anfrage);
  if (!zugang) {
    return fehlerAntwort(
      'HIORG_API_KONFIGURATION_FEHLT',
      'Die HiOrg-Server-API ist noch nicht eingerichtet.',
      503,
    );
  }
  const gelesen = await leseJsonBegrenzt(anfrage, MAX_CODE_ANFRAGE_BYTES);
  const adresseRoh =
    gelesen.erfolg && istObjekt(gelesen.inhalt) && Object.keys(gelesen.inhalt).length === 1
      ? gelesen.inhalt['adresse']
      : undefined;
  let adresse: URL | undefined;
  try {
    adresse = istText(adresseRoh) ? new URL(adresseRoh.trim()) : undefined;
  } catch {
    adresse = undefined;
  }
  if (!adresse || `${adresse.origin}${adresse.pathname}` !== zugang.redirectUri) {
    return fehlerAntwort(
      'HIORG_ADRESSE_UNGUELTIG',
      'Die eingefügte Adresse ist nicht die Rückmeldung der HiOrg-Anmeldung.',
      400,
    );
  }

  const [erwartet] = (leseStateCookie(anfrage) ?? '').split('.');
  if (!stateGueltig(erwartet, adresse.searchParams.get('state'))) {
    return fehlerAntwort(
      'HIORG_ANMELDUNG_VERALTET',
      'Die Rückmeldung gehört nicht zur zuletzt geöffneten HiOrg-Anmeldung. Bitte die Anmeldung erneut öffnen.',
      400,
    );
  }
  const verbraucht = { 'Set-Cookie': stateCookie('', 0) };
  if (adresse.searchParams.has('error')) {
    return fehlerAntwort(
      'HIORG_ANMELDUNG_ABGEBROCHEN',
      'Die Anmeldung beim HiOrg-Server wurde abgebrochen.',
      400,
      verbraucht,
    );
  }
  const code = adresse.searchParams.get('code');
  if (!code || !/^[\x21-\x7e]{1,2048}$/.test(code)) {
    return fehlerAntwort(
      'HIORG_ADRESSE_UNGUELTIG',
      'Die eingefügte Adresse enthält keinen Anmeldecode.',
      400,
      verbraucht,
    );
  }

  const ergebnis = await codeEinloesen(zugang, code, benutzer.email);
  switch (ergebnis) {
    case 'verbunden':
      return jsonAntwort(
        { eingerichtet: true, verbunden: true, modus: zugang.modus },
        200,
        verbraucht,
      );
    case 'abgelehnt':
      return fehlerAntwort(
        'HIORG_CODE_ABGELEHNT',
        'HiOrg hat den Anmeldecode abgelehnt, meist weil er abgelaufen ist. Bitte die Anmeldung erneut öffnen.',
        400,
        verbraucht,
      );
    case 'speicher':
      return fehlerAntwort(
        'HIORG_SPEICHER_FEHLER',
        'Die HiOrg-Verbindung konnte nicht gespeichert werden.',
        500,
        verbraucht,
      );
    default: {
      const fehler = transportFehler(ergebnis);
      fehler.headers.append('Set-Cookie', verbraucht['Set-Cookie']);
      return fehler;
    }
  }
}
