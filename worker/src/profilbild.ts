import { fehlerAntwort, jsonAntwort } from './antwort';
import { hostname, istUmleitung, redigiere, ursachenText } from './diagnose';
import { istObjekt, leseJsonBegrenzt, verwerfeInhalt } from './json-lesen';

/**
 * Best-effort-Abruf des von Google über die Cloudflare-Access-Anmeldung
 * bereitgestellten Profilbilds. Das Access-App-JWT selbst (`anmeldung.ts`)
 * trägt nur die geprüften Pflichtangaben; ein Profilbild ist dort nicht Teil
 * des genutzten Claim-Umfangs. Cloudflare reicht IdP-Zusatzangaben stattdessen
 * über den `/cdn-cgi/access/get-identity`-Endpunkt durch, sofern die
 * Google-Anmeldung sie liefert – verschachtelt unter `oidc_fields.picture`.
 *
 * Entscheidend ist dabei die aufgerufene Domain: Ein Test gegen die
 * Team-Domain per Browser (mit deren eigenem, dort gesetzten Sitzungscookie)
 * lieferte `oidc_fields`; derselbe Aufruf serverseitig gegen die Team-Domain,
 * aber mit dem app-gebundenen Access-JWT als nachgebautem Cookie, lieferte es
 * nicht (siehe Betreiberlogs `PROFILBILD_FELD_FEHLT ... oidc_fields=kein
 * Objekt`). Der Endpunkt läuft deshalb gegen die eigene Anwendungs-Domain
 * (`new URL(anfrage.url).origin`, also z. B. `https://hiorg-wache.com`) statt
 * gegen die Team-Domain: Access fängt `/cdn-cgi/access/get-identity` dort
 * direkt an der Edge ab (reservierter Cloudflare-Pfad, erreicht den Worker
 * nie) und löst die Identität im selben Anwendungs-/Audience-Kontext auf, in
 * dem das JWT tatsächlich ausgestellt wurde.
 *
 * Dieses Modul kapselt genau diesen einen zusätzlichen "Gespräch mit
 * Google"-Aufruf, damit weder das Frontend noch `anmeldung.ts` den Umweg über
 * Access kennen müssen: Ein fehlendes, unerreichbares oder unerwartet
 * geformtes Bildfeld ist kein Anmeldefehler, sondern liefert schlicht kein
 * Bild – die Anmeldung selbst bleibt davon unberührt. Jeder "kein Bild"-Pfad
 * protokolliert eine Diagnose ausschließlich über Status und Feldnamen (nie
 * Feldwerte, da `get-identity` echte Personendaten wie Name und E-Mail
 * trägt) – damit sich ein unerwartetes Verhalten im echten Team ohne
 * erneutes Raten über `wrangler tail` nachvollziehen lässt.
 */

export const PROFILBILD_PFAD = '/api/benutzer/profilbild';
const IDENTITAET_PFAD = '/cdn-cgi/access/get-identity';
const ZEITLIMIT_MS = 5_000;
const MAX_ANTWORT_BYTES = 64 * 1024;

export async function verarbeiteProfilbild(anfrage: Request): Promise<Response> {
  if (anfrage.method !== 'GET') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'GET' });
  }

  // pruefeAnmeldung hat das Assertion-JWT für diese Anfrage bereits geprüft;
  // ein fehlender Wert hier bedeutet nur "kein Bild".
  const jwt = anfrage.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) {
    return jsonAntwort({ profilbildUrl: null });
  }

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), ZEITLIMIT_MS);
  try {
    let antwort: Response;
    try {
      antwort = await fetch(`${new URL(anfrage.url).origin}${IDENTITAET_PFAD}`, {
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
      // Nur Status und Ziel-Host der Weiterleitung – nie Cookie-/Token-Werte,
      // nie den (möglicherweise personenbezogenen) Antwortkörper.
      console.error(
        'PROFILBILD_ABRUF_FEHLGESCHLAGEN',
        antwort.status,
        istUmleitung(antwort) ? hostname(antwort.headers.get('Location') ?? '') : undefined,
      );
      await verwerfeInhalt(antwort);
      return jsonAntwort({ profilbildUrl: null });
    }

    const ergebnis = await leseJsonBegrenzt(antwort, MAX_ANTWORT_BYTES, abbruch.signal);
    if (!ergebnis.erfolg) {
      console.error('PROFILBILD_ANTWORT_UNLESBAR', ergebnis.ursache);
      return jsonAntwort({ profilbildUrl: null });
    }
    const profilbildUrl = leseProfilbildUrl(ergebnis.inhalt);
    if (profilbildUrl === null) {
      // Diagnose ausschließlich über Feldnamen, nie über Feldwerte: get-identity
      // trägt echte Personendaten (Name, E-Mail), die hier nie ins Log dürfen.
      console.error('PROFILBILD_FELD_FEHLT', struktur(ergebnis.inhalt));
    }
    return jsonAntwort({ profilbildUrl });
  } finally {
    clearTimeout(zeitlimit);
  }
}

/**
 * Nur Feldnamen für die Betreiberdiagnose, nie Werte: `get-identity` trägt
 * echte Personendaten (Name, E-Mail, IdP-Kennung), die nie ins Log dürfen.
 */
function struktur(identitaet: unknown): string {
  if (!istObjekt(identitaet)) return `kein Objekt (${typeof identitaet})`;
  const oidcFelder = identitaet['oidc_fields'];
  const oidcSchluessel = istObjekt(oidcFelder)
    ? Object.keys(oidcFelder).sort().join(',')
    : `kein Objekt (${typeof oidcFelder})`;
  return `felder=${Object.keys(identitaet).sort().join(',')} oidc_fields=${oidcSchluessel}`;
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
