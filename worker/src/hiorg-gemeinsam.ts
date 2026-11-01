import { fehlerAntwort } from './antwort';
import { leseZugangsdatum, type Zugangsdatum } from './zugangsdaten';

/**
 * Gemeinsame Konfiguration, feste Ziele, Grenzen und Typen der HiOrg-Server-API sowie das
 * Lesen des Zugangs aus der Laufzeitkonfiguration. Der Ablauf steht in `hiorg-api.ts`
 * (Verteiler), `hiorg-oauth.ts` (Verbinden und Rückruf), `hiorg-upstream.ts` (Aufrufe an
 * HiOrg), `hiorg-tokenablage.ts` (verschlüsselte Ablage) und `hiorg-personal-felder.ts`
 * (feste Feldauswahl).
 */

export interface HiorgApiKonfiguration {
  HIORG_SERVER_CLIENTID?: Zugangsdatum;
  HIORG_SERVER_CLIENTSECRET?: Zugangsdatum;
  /** Optional; ohne Angabe gilt der Access-Callback der Team-Domain (manuell). */
  HIORG_SERVER_REDIRECT_URI?: string;
  ACCESS_TEAM_DOMAIN?: string;
  BENUTZER_DB?: D1Database;
}

export const HIORG_VERBINDEN_PFAD = '/hiorg/verbinden';
export const HIORG_RUECKRUF_PFAD = '/hiorg/rueckruf';
export const HIORG_VERBINDUNG_PFAD = '/api/hiorg/verbindung';
export const HIORG_CODE_PFAD = '/api/hiorg/verbindung/code';
export const HIORG_PERSONAL_PFAD = '/api/hiorg/personal';
/**
 * Anschrift, Geburtsdatum und Anrede genau einer Person, ausschließlich für das Ausfüllen des
 * Ehrungsantrags (Seite „Offene Ehrungen“). Die einzige Stelle, an der Anschrift und
 * Geburtsdatum den Worker verlassen – nie in der allgemeinen Personalliste.
 */
export const HIORG_ANTRAGSDATEN_MUSTER =
  /^\/api\/hiorg\/personal\/([A-Za-z0-9_-]{1,128})\/antragsdaten$/;

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

export const STATE_COOKIE = '__Host-stationwizard-hiorg-state';
export const STATE_GUELTIGKEIT_S = 600;
export const STATE_MUSTER = /^[A-Za-z0-9_-]{43}$/;
/** Ein Token gilt kurz vor seinem angekündigten Ablauf schon als abgelaufen. */
export const ABLAUF_PUFFER_MS = 60_000;
export const TOKEN_FORMAT = 'v1';
export const MAX_CODE_ANFRAGE_BYTES = 8 * 1024;
const TEAM_DOMAIN_MUSTER =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const ACCESS_CALLBACK_PFAD = '/cdn-cgi/access/callback';
/**
 * Feste Rückkehrziele nach der Anmeldung; `?ziel=` wählt nur aus dieser Liste,
 * damit der Rückruf nie auf eine frei gewählte Adresse weiterleitet.
 */
export const RUECKKEHR_ZIELE: Readonly<Record<string, string>> = {
  einsatz: '/#/einsatz',
  personal: '/#/personal',
};
export const STANDARD_ZIEL = 'einsatz';

/** Ergebnis eines Verbindungsversuchs, als `?hiorg=` an die Einsatzplanung zurückgegeben. */
export type HiorgVerbindungsergebnis =
  'verbunden' | 'abgebrochen' | 'nicht-eingerichtet' | 'ungueltig' | 'fehlgeschlagen';

export interface TokenDaten {
  zugang: string;
  erneuerung: string | null;
  /** Ablaufzeitpunkt in Millisekunden; `null`, wenn HiOrg keinen angekündigt hat. */
  ablaufMs: number | null;
}

export type TokenErgebnis =
  | { erfolg: true; token: TokenDaten }
  | {
      erfolg: false;
      ursache: 'abgelehnt' | 'zeitlimit' | 'nicht-erreichbar' | 'umleitung' | 'ungueltig';
    };

export type HiorgRueckrufModus = 'manuell' | 'automatisch';

export interface Zugang {
  clientId: string;
  clientSecret: string;
  db: D1Database;
  redirectUri: string;
  modus: HiorgRueckrufModus;
}

/**
 * Redirect-URI samt Modus; nur die beiden bekannten Formen sind zulässig.
 * Beide stammen aus Laufzeitkonfiguration, nie aus der Anfrage.
 */
function leseRueckruf(
  umgebung: HiorgApiKonfiguration,
  anfrage: Request,
): { redirectUri: string; modus: HiorgRueckrufModus } | undefined {
  const teamDomain = umgebung.ACCESS_TEAM_DOMAIN;
  const accessCallback =
    typeof teamDomain === 'string' && TEAM_DOMAIN_MUSTER.test(teamDomain)
      ? `${teamDomain}${ACCESS_CALLBACK_PFAD}`
      : undefined;
  const workerRueckruf = `${new URL(anfrage.url).origin}${HIORG_RUECKRUF_PFAD}`;
  const konfiguriert = umgebung.HIORG_SERVER_REDIRECT_URI?.trim() || accessCallback;
  if (!konfiguriert) return undefined;
  if (konfiguriert === accessCallback) return { redirectUri: konfiguriert, modus: 'manuell' };
  if (konfiguriert === workerRueckruf) return { redirectUri: konfiguriert, modus: 'automatisch' };
  return undefined;
}

export async function leseZugang(
  umgebung: HiorgApiKonfiguration,
  anfrage: Request,
): Promise<Zugang | undefined> {
  const [clientId, clientSecret] = await Promise.all([
    leseZugangsdatum(umgebung.HIORG_SERVER_CLIENTID),
    leseZugangsdatum(umgebung.HIORG_SERVER_CLIENTSECRET),
  ]);
  const rueckruf = leseRueckruf(umgebung, anfrage);
  if (!umgebung.BENUTZER_DB || !rueckruf || !istSauber(clientId) || !istSauber(clientSecret)) {
    return undefined;
  }
  return { clientId, clientSecret, db: umgebung.BENUTZER_DB, ...rueckruf };
}

/** Nur sichtbare ASCII-Zeichen; ein anderes Secret ist ein Konfigurationsfehler. */
export function istSauber(wert: unknown, hoechstlaenge = 512): wert is string {
  return typeof wert === 'string' && wert.length <= hoechstlaenge && /^[\x21-\x7e]+$/.test(wert);
}
export const NICHT_VERBUNDEN = (): Response =>
  fehlerAntwort(
    'HIORG_NICHT_VERBUNDEN',
    'Es besteht keine Verbindung zum HiOrg-Server. Bitte zuerst verbinden.',
    409,
  );

export const VERBINDUNG_ABGELAUFEN = (): Response =>
  fehlerAntwort(
    'HIORG_VERBINDUNG_ABGELAUFEN',
    'Die Verbindung zum HiOrg-Server ist abgelaufen. Bitte erneut verbinden.',
    409,
  );

export function transportFehler(
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

export function base64Url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function ausBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binaer = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}
