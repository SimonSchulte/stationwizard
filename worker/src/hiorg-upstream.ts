import { istUmleitung, redigiere, ursachenText } from './diagnose';
import {
  HIORG_PERSONAL_URL,
  HIORG_TOKEN_URL,
  HIORG_ZEITLIMIT_MS,
  istSauber,
  MAX_HIORG_PERSONAL_ANTWORT_BYTES,
  MAX_HIORG_TOKEN_ANTWORT_BYTES,
  type TokenDaten,
  type TokenErgebnis,
  transportFehler,
  VERBINDUNG_ABGELAUFEN,
  type Zugang,
} from './hiorg-gemeinsam';
import {
  entschluesseln,
  verbindungLesen,
  verbindungLoeschenStill,
  verschluesseln,
} from './hiorg-tokenablage';
import { istObjekt, istText, leseJsonBegrenzt, verwerfeInhalt } from './json-lesen';

/**
 * Ausgehende Aufrufe an HiOrg: Token anfordern und erneuern, Personal abrufen. Feste Ziele,
 * eigenes Zeitlimit, keine Weiterleitung, keine Upstream-Antwort im Fehlertext.
 */

/**
 * Erneuert das Token mit dem Refresh-Token. Lehnt HiOrg ab, kann eine
 * parallele Anfrage das Refresh-Token bereits verbraucht und ein neues
 * gespeichert haben – dann gilt dieses, statt die Verbindung zu verwerfen.
 */
export async function erneuern(
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

export async function tokenAnfordern(
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

export async function personalAnfordern(zugangstoken: string): Promise<PersonalAbruf> {
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
