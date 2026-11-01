import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { erzeugeErfassungToken } from './erfassung-token';
import { type MaterialKonfiguration } from './material-gemeinsam';
import { freigabeGruppen, leseRolle, pruefeFreigabeRecht } from './rollen';

/** Prüfcodes des öffentlichen QR-Wegs; das Token ist ein Geheimnis und nur hier lesbar. */

interface PruefcodeZeile {
  id: string;
  bezeichnung: string;
  check_token: string | null;
  check_token_am: string | null;
  fahrzeug_bezeichnung: string;
  fahrzeug_funkrufname: string;
  fahrzeug_gruppe: string;
}

/**
 * Das Prüftoken verlässt den Worker **nur** hier. Gefiltert wird auf die
 * Gruppen, für die die aufrufende Rolle freigeben darf – wer keine Freigabe
 * erteilen kann, braucht auch keine Aufkleber zu drucken. Ohne Rolle eine leere
 * Liste statt 403, damit die Oberfläche ehrlich leer bleibt (wie bei den
 * Kilometer-Erfassungslinks).
 */
export async function listePruefcodes(
  db: D1Database,
  umgebung: MaterialKonfiguration,
  identitaet: Benutzer,
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
  if (gruppen.length === 0) return jsonAntwort({ pruefcodes: [] });

  const platzhalter = gruppen.map(() => '?').join(', ');
  const ergebnis = await db
    .prepare(
      `SELECT b.id, b.bezeichnung, b.check_token, b.check_token_am,
              f.bezeichnung AS fahrzeug_bezeichnung, f.funkrufname AS fahrzeug_funkrufname,
              f.gruppe AS fahrzeug_gruppe
         FROM behaelter b
         JOIN fahrzeuge f ON f.id = b.fahrzeug_id
        WHERE f.gruppe IN (${platzhalter})
        ORDER BY f.bezeichnung, b.bezeichnung`,
    )
    .bind(...gruppen)
    .all<PruefcodeZeile>();

  return jsonAntwort({
    pruefcodes: ergebnis.results.map((zeile) => ({
      behaelterId: zeile.id,
      bezeichnung: zeile.bezeichnung,
      fahrzeugBezeichnung: zeile.fahrzeug_bezeichnung,
      fahrzeugFunkrufname: zeile.fahrzeug_funkrufname,
      token: zeile.check_token,
      tokenAm: zeile.check_token_am,
    })),
  });
}

async function ladeBehaelterGruppe(
  db: D1Database,
  behaelterId: string,
): Promise<{ gruppe: string; token: string | null; tokenAm: string | null } | null> {
  const zeile = await db
    .prepare(
      `SELECT b.check_token, b.check_token_am, f.gruppe
         FROM behaelter b JOIN fahrzeuge f ON f.id = b.fahrzeug_id
        WHERE b.id = ?`,
    )
    .bind(behaelterId)
    .first<{ check_token: string | null; check_token_am: string | null; gruppe: string }>();
  return zeile
    ? { gruppe: zeile.gruppe, token: zeile.check_token, tokenAm: zeile.check_token_am }
    : null;
}

export async function lesePruefcode(
  db: D1Database,
  umgebung: MaterialKonfiguration,
  behaelterId: string,
  identitaet: Benutzer,
): Promise<Response> {
  const zeile = await ladeBehaelterGruppe(db, behaelterId);
  if (!zeile) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  const verweigert = await pruefeFreigabeRecht(umgebung, identitaet, zeile.gruppe);
  if (verweigert) return verweigert;
  return jsonAntwort({ behaelterId, token: zeile.token, tokenAm: zeile.tokenAm });
}

/**
 * Erneuert das Token. Es gibt bewusst keine Übergangsfrist mit zwei gültigen
 * Token: gedruckte Aufkleber dieses Behälters sind damit sofort ungültig, und
 * genau das ist der Zweck – ein abhandengekommener Aufkleber soll nicht
 * weiterlaufen.
 */
export async function erneuerePruefcode(
  db: D1Database,
  umgebung: MaterialKonfiguration,
  behaelterId: string,
  identitaet: Benutzer,
): Promise<Response> {
  const zeile = await ladeBehaelterGruppe(db, behaelterId);
  if (!zeile) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  const verweigert = await pruefeFreigabeRecht(umgebung, identitaet, zeile.gruppe);
  if (verweigert) return verweigert;

  const token = erzeugeErfassungToken();
  const jetzt = new Date().toISOString();
  await db
    .prepare('UPDATE behaelter SET check_token = ?, check_token_am = ? WHERE id = ?')
    .bind(token, jetzt, behaelterId)
    .run();
  return jsonAntwort({ behaelterId, token, tokenAm: jetzt });
}
