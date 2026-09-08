import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { fehlerAntwort } from './antwort';

export interface AccessKonfiguration {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export interface Benutzer {
  email: string;
}

const TEAM_DOMAIN_MUSTER =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;

const SCHLUESSELSAETZE = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const UNGUELTIGE_TOKEN_CODES = new Set([
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWS_INVALID',
  'ERR_JWT_INVALID',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JOSE_NOT_SUPPORTED',
]);

/** Jede Anfrage, auch eine statische Datei, benötigt ein verifiziertes Access-Anwendungstoken. */
export async function pruefeAnmeldung(
  anfrage: Request,
  konfiguration: AccessKonfiguration,
): Promise<Benutzer | Response> {
  const teamDomain = konfiguration.ACCESS_TEAM_DOMAIN;
  const audience = konfiguration.ACCESS_AUD;
  if (
    typeof teamDomain !== 'string' ||
    !TEAM_DOMAIN_MUSTER.test(teamDomain) ||
    typeof audience !== 'string' ||
    audience.length === 0 ||
    audience.trim() !== audience
  ) {
    return fehlerAntwort(
      'ACCESS_KONFIGURATION_FEHLT',
      'Die Anmeldung ist noch nicht vollständig eingerichtet.',
      503,
    );
  }

  const token = anfrage.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    return fehlerAntwort('ACCESS_TOKEN_FEHLT', 'Anmeldung erforderlich.', 401);
  }

  try {
    // Der erlaubte Host kommt ausschließlich aus der geprüften Laufzeitkonfiguration.
    // jose berücksichtigt wechselnde kid-Werte und begrenzt wiederholte JWKS-Abrufe.
    let schluessel = SCHLUESSELSAETZE.get(teamDomain);
    if (!schluessel) {
      schluessel = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`), {
        timeoutDuration: 5000,
        cooldownDuration: 30000,
        cacheMaxAge: 600000,
      });
      SCHLUESSELSAETZE.set(teamDomain, schluessel);
    }

    const { payload } = await jwtVerify(token, schluessel, {
      algorithms: ['RS256'],
      issuer: teamDomain,
      audience,
      requiredClaims: ['exp', 'iss', 'aud', 'sub', 'email'],
    });

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload['email'] !== 'string' ||
      payload['email'].trim().length === 0 ||
      (payload['type'] !== undefined && payload['type'] !== 'app')
    ) {
      return fehlerAntwort('ACCESS_TOKEN_UNGUELTIG', 'Anmeldung ungültig.', 401);
    }

    return { email: payload['email'] };
  } catch (ursache) {
    if (ursache instanceof errors.JWTExpired) {
      return fehlerAntwort('ACCESS_TOKEN_ABGELAUFEN', 'Die Anmeldung ist abgelaufen.', 401);
    }
    if (ursache instanceof errors.JOSEError && UNGUELTIGE_TOKEN_CODES.has(ursache.code)) {
      return fehlerAntwort('ACCESS_TOKEN_UNGUELTIG', 'Anmeldung ungültig.', 401);
    }
    return fehlerAntwort(
      'ACCESS_PRUEFUNG_NICHT_ERREICHBAR',
      'Die Anmeldung kann derzeit nicht geprüft werden. Bitte erneut versuchen.',
      503,
    );
  }
}
