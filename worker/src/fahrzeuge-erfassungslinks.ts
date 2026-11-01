import { fehlerAntwort, jsonAntwort } from './antwort';
import { erzeugeErfassungToken } from './erfassung-token';
import { type FahrzeugeKonfiguration, type GeprueftesBenutzerkonto } from './fahrzeuge-gemeinsam';
import { protokolliereAenderung } from './fahrzeuge-protokoll';
import { freigabeGruppen, leseRolle, pruefeFreigabeRecht } from './rollen';

/** Öffentliche Erfassungstoken: Geheimnisse, nur über diese Endpunkte lesbar. */

/**
 * Erfassungslinks aller Fahrzeuge, auf die eigenen Freigabegruppen begrenzt.
 * Grundlage des QR-Übersichtsbogens.
 *
 * Anders als die Einzelabfrage ist das eine Sammlung von Geheimnissen, deshalb
 * die serverseitige Rollenprüfung: Zugführung sieht alle Fahrzeuge, eine
 * Gruppenführung nur die ihrer Gruppe. Ohne passende Rolle ist die Liste leer
 * statt abgewiesen – der Übersichtsbogen soll für jeden aufrufbar und dann
 * ehrlich leer sein.
 */
export async function listeErfassungslinks(
  db: D1Database,
  umgebung: FahrzeugeKonfiguration,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const benutzerDb = umgebung.BENUTZER_DB;
  if (!benutzerDb) {
    return fehlerAntwort(
      'ROLLEN_KONFIGURATION_FEHLT',
      'Die Rollenverwaltung ist noch nicht eingerichtet.',
      503,
    );
  }
  const zuordnung = await leseRolle(benutzerDb, identitaet.email);
  const gruppen = freigabeGruppen(zuordnung?.rolle ?? null);
  if (gruppen.length === 0) {
    return jsonAntwort({ links: [] });
  }
  const platzhalter = gruppen.map(() => '?').join(', ');
  const ergebnis = await db
    .prepare(
      `SELECT id, bezeichnung, funkrufname, kennzeichen, gruppe, erfassung_token
         FROM fahrzeuge
        WHERE gruppe IN (${platzhalter})
        ORDER BY bezeichnung`,
    )
    .bind(...gruppen)
    .all<ErfassungslinkZeile>();
  return jsonAntwort({ links: ergebnis.results.map(zuErfassungslinkJson) });
}

interface ErfassungslinkZeile {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  gruppe: string;
  erfassung_token: string | null;
}

function zuErfassungslinkJson(zeile: ErfassungslinkZeile): Record<string, unknown> {
  return {
    fahrzeugId: zeile.id,
    bezeichnung: zeile.bezeichnung,
    funkrufname: zeile.funkrufname,
    kennzeichen: zeile.kennzeichen,
    gruppe: zeile.gruppe,
    token: zeile.erfassung_token,
  };
}

/**
 * Erfassungslink eines einzelnen Fahrzeugs. Steht jeder geprüften Identität
 * offen: wer das Fahrzeug ohnehin sehen und intern erfassen darf, darf auch
 * den Aufkleber dieses einen Fahrzeugs drucken.
 */
export async function leseErfassungslink(db: D1Database, fahrzeugId: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT erfassung_token FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ erfassung_token: string | null }>();
  if (!zeile) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  return jsonAntwort({ fahrzeugId, token: zeile.erfassung_token });
}

/**
 * Erzeugt ein neues Token und macht damit alle bereits gedruckten Aufkleber
 * dieses Fahrzeugs ungültig. Bewusst keine Übergangsfrist mit zwei gültigen
 * Token – das wäre ein zweites Geheimnis ohne Ablaufüberwachung.
 *
 * Der Protokolleintrag nennt das Token nicht.
 */
export async function erneuereErfassungslink(
  db: D1Database,
  umgebung: FahrzeugeKonfiguration,
  fahrzeugId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const zeile = await db
    .prepare('SELECT gruppe FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ gruppe: string }>();
  if (!zeile) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  const verweigert = await pruefeFreigabeRecht(umgebung, identitaet, zeile.gruppe);
  if (verweigert) return verweigert;

  const token = erzeugeErfassungToken();
  await db
    .prepare('UPDATE fahrzeuge SET erfassung_token = ?, erfassung_token_am = ? WHERE id = ?')
    .bind(token, new Date().toISOString(), fahrzeugId)
    .run();
  await protokolliereAenderung(
    db,
    fahrzeugId,
    identitaet.email,
    'Öffentlicher Erfassungs-QR-Code erneuert (bisher gedruckte Aufkleber sind ungültig)',
  );
  return jsonAntwort({ fahrzeugId, token });
}
