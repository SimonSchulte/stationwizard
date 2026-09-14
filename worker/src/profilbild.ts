import type { AccessKonfiguration } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istUmleitung, redigiere, ursachenText } from './diagnose';
import { istObjekt, leseJsonBegrenzt, verwerfeInhalt } from './json-lesen';

/**
 * Best-effort-Abruf des von Google über die Cloudflare-Access-Anmeldung
 * bereitgestellten Profilbilds. Das Access-App-JWT selbst (`anmeldung.ts`)
 * trägt nur die geprüften Pflichtangaben; ein Profilbild ist dort nicht Teil
 * des genutzten Claim-Umfangs. Cloudflare reicht IdP-Zusatzangaben stattdessen
 * über den `/cdn-cgi/access/get-identity`-Endpunkt der eigenen Team-Domain
 * durch, sofern die Google-Anmeldung sie liefert – dort verschachtelt unter
 * `oidc_fields.picture` (per Cloudflare-Zero-Trust-IdP-Testfunktion gegen die
 * echte Team-Domain geprüft, nicht nur aus der offiziellen Dokumentation
 * abgeleitet). Dieses Modul kapselt genau diesen einen zusätzlichen
 * "Gespräch mit Google"-Aufruf, damit weder das Frontend noch `anmeldung.ts`
 * den Umweg über Access kennen müssen: Ein fehlendes, unerreichbares oder
 * unerwartet geformtes Bildfeld ist kein Anmeldefehler, sondern liefert
 * schlicht kein Bild – die Anmeldung selbst bleibt davon unberührt.
 */

export const PROFILBILD_PFAD = '/api/benutzer/profilbild';
const IDENTITAET_PFAD = '/cdn-cgi/access/get-identity';
const ZEITLIMIT_MS = 5_000;
const MAX_ANTWORT_BYTES = 64 * 1024;

export async function verarbeiteProfilbild(
  anfrage: Request,
  umgebung: AccessKonfiguration,
): Promise<Response> {
  if (anfrage.method !== 'GET') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'GET' });
  }

  // pruefeAnmeldung hat Team-Domain und das Assertion-JWT für diese Anfrage
  // bereits geprüft; ein fehlender Wert hier bedeutet nur "kein Bild".
  const teamDomain = umgebung.ACCESS_TEAM_DOMAIN;
  const jwt = anfrage.headers.get('Cf-Access-Jwt-Assertion');
  if (!teamDomain || !jwt) {
    return jsonAntwort({ profilbildUrl: null });
  }

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), ZEITLIMIT_MS);
  try {
    let antwort: Response;
    try {
      antwort = await fetch(`${teamDomain}${IDENTITAET_PFAD}`, {
        method: 'GET',
        // get-identity liest dieselbe Anmeldung wie im Browser über das Cookie.
        headers: { Accept: 'application/json', Cookie: `CF_Authorization=${jwt}` },
        redirect: 'manual',
        signal: abbruch.signal,
      });
    } catch (fehler) {
      console.error('PROFILBILD_NICHT_ERREICHBAR', redigiere(ursachenText(fehler), [jwt]));
      return jsonAntwort({ profilbildUrl: null });
    }

    if (istUmleitung(antwort) || !antwort.ok) {
      await verwerfeInhalt(antwort);
      return jsonAntwort({ profilbildUrl: null });
    }

    const ergebnis = await leseJsonBegrenzt(antwort, MAX_ANTWORT_BYTES, abbruch.signal);
    if (!ergebnis.erfolg) {
      return jsonAntwort({ profilbildUrl: null });
    }
    return jsonAntwort({ profilbildUrl: leseProfilbildUrl(ergebnis.inhalt) });
  } finally {
    clearTimeout(zeitlimit);
  }
}

/**
 * `oidc_fields.picture` ist bei Cloudflare Access kein von Cloudflare selbst
 * dokumentiert fester Vertrag, sondern eine unter `oidc_fields` gebündelte,
 * von Google durchgereichte IdP-Zusatzangabe. Nur eine plausible https-Bild-
 * URL wird übernommen; alles andere liefert `null`, statt eine ungeprüfte
 * fremde URL in die Anwendung zu lassen.
 */
function leseProfilbildUrl(identitaet: unknown): string | null {
  if (!istObjekt(identitaet)) return null;
  const oidcFelder = identitaet['oidc_fields'];
  if (!istObjekt(oidcFelder)) return null;
  const wert = oidcFelder['picture'];
  if (typeof wert !== 'string' || wert.trim() !== wert || wert === '') return null;
  try {
    return new URL(wert).protocol === 'https:' ? wert : null;
  } catch {
    return null;
  }
}
