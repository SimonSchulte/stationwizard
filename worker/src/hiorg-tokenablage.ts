import { ursachenText } from './diagnose';
import { ausBase64Url, base64Url, TOKEN_FORMAT, type TokenDaten } from './hiorg-gemeinsam';
import { istObjekt, istText } from './json-lesen';

/** Token-Ablage in `hiorg_verbindungen`: nur AES-GCM-verschlüsselt, je Access-Identität. */

export function enthaeltGeheimnis(daten: unknown, geheim: (string | null)[]): boolean {
  const text = JSON.stringify(daten);
  return geheim.some((wert) => !!wert && text.includes(wert));
}

export async function verbindungLesen(db: D1Database, email: string): Promise<string | null> {
  const zeile = await db
    .prepare('SELECT token_daten FROM hiorg_verbindungen WHERE email = ?')
    .bind(email)
    .first<{ token_daten: string }>();
  return zeile?.token_daten ?? null;
}

export async function verbindungLoeschen(db: D1Database, email: string): Promise<void> {
  await db.prepare('DELETE FROM hiorg_verbindungen WHERE email = ?').bind(email).run();
}

export async function verbindungLoeschenStill(db: D1Database, email: string): Promise<void> {
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

export async function verschluesseln(
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

export async function entschluesseln(
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
