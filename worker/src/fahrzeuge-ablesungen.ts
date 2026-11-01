import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  ABLESUNG_KOERPER_GRENZE,
  type GeprueftesBenutzerkonto,
  lesePruefeKoerper,
} from './fahrzeuge-gemeinsam';
import { protokolliereAenderung } from './fahrzeuge-protokoll';
import { pruefeAblesungEingabe } from './fahrzeuge-pruefung';
import {
  type AblesungZeile,
  type AenderungZeile,
  zuAblesungJson,
  zuAenderungJson,
} from './fahrzeuge-zeilen';

/** Kilometerablesungen und Änderungsprotokoll je Fahrzeug: lesen, anhängen, löschen. */

export async function listeAblesungen(db: D1Database, fahrzeugId: string): Promise<Response> {
  const fahrzeug = await db
    .prepare('SELECT id FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ id: string }>();
  if (!fahrzeug) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  const ergebnis = await db
    .prepare('SELECT * FROM ablesungen WHERE fahrzeug_id = ? ORDER BY abgelesen_am ASC')
    .bind(fahrzeugId)
    .all<AblesungZeile>();
  return jsonAntwort({ ablesungen: ergebnis.results.map(zuAblesungJson) });
}

export async function listeAenderungen(db: D1Database, fahrzeugId: string): Promise<Response> {
  const fahrzeug = await db
    .prepare('SELECT id FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ id: string }>();
  if (!fahrzeug) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  const ergebnis = await db
    .prepare('SELECT * FROM fahrzeug_aenderungen WHERE fahrzeug_id = ? ORDER BY zeitpunkt DESC')
    .bind(fahrzeugId)
    .all<AenderungZeile>();
  return jsonAntwort({ aenderungen: ergebnis.results.map(zuAenderungJson) });
}

export async function ergaenzeAblesung(
  anfrage: Request,
  db: D1Database,
  fahrzeugId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const koerper = await lesePruefeKoerper(anfrage, ABLESUNG_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAblesungEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('FAHRZEUGE_DATEI_UNGUELTIG', 'Ungültige Ablesungsdaten.', 400);
  }
  const fahrzeug = await db
    .prepare('SELECT id FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ id: string }>();
  if (!fahrzeug) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  if (eingabe.korrigiert !== null) {
    const korrigierte = await db
      .prepare('SELECT id FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')
      .bind(eingabe.korrigiert, fahrzeugId)
      .first<{ id: string }>();
    if (!korrigierte) {
      return fehlerAntwort(
        'FAHRZEUGE_DATEI_UNGUELTIG',
        'Die zu korrigierende Ablesung existiert nicht für dieses Fahrzeug.',
        400,
      );
    }
  }
  const id = crypto.randomUUID();
  const erfasstAm = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO ablesungen
         (id, fahrzeug_id, abgelesen_am, stand, erfasst_am, erfasst_von, quelle, korrigiert, bemerkung)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      fahrzeugId,
      eingabe.abgelesenAm,
      eingabe.stand,
      erfasstAm,
      identitaet.email,
      eingabe.quelle,
      eingabe.korrigiert,
      eingabe.bemerkung,
    )
    .run();
  await protokolliereAenderung(
    db,
    fahrzeugId,
    identitaet.email,
    eingabe.korrigiert !== null
      ? `Kilometerstand korrigiert: ${eingabe.stand} km am ${eingabe.abgelesenAm}`
      : `Kilometerstand erfasst: ${eingabe.stand} km am ${eingabe.abgelesenAm}`,
  );
  // Über `zuAblesungJson()` statt einer eigenen Objektform, damit die Antwort
  // dieselben Felder trägt wie die Liste – ein fehlendes Feld lässt die
  // Clientprüfung eine erfolgreich gespeicherte Ablesung verwerfen.
  return jsonAntwort(
    zuAblesungJson({
      id,
      fahrzeug_id: fahrzeugId,
      abgelesen_am: eingabe.abgelesenAm,
      stand: eingabe.stand,
      erfasst_am: erfasstAm,
      erfasst_von: identitaet.email,
      quelle: eingabe.quelle,
      korrigiert: eingabe.korrigiert,
      bemerkung: eingabe.bemerkung,
      gemeldet_von_name: null,
    }),
    201,
  );
}

/**
 * Löscht eine Ablesung unwiderruflich. Abweichend vom ursprünglichen Konzept
 * (`docs/konzept-fahrzeuge.md`, Abschnitt 8: „Kilometerstände sind
 * unveränderlich") jetzt auf ausdrücklichen fachlichen Wunsch möglich –
 * vorerst für jede geprüfte Identität, weil dem Modul noch keine Rollen
 * zugrunde liegen (siehe Konzept: „Rechte vorerst alle, Rollen später").
 * Eine spätere Rollenprüfung soll dies auf eine Admin-Rolle einschränken.
 * Eine Ablesung, auf die eine andere Ablesung per `korrigiert` verweist,
 * bleibt gesperrt, damit keine Korrektur ins Leere zeigt – die Korrektur
 * muss zuerst gelöscht werden.
 */
export async function loescheAblesung(
  db: D1Database,
  fahrzeugId: string,
  ablesungId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const ablesung = await db
    .prepare('SELECT * FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')
    .bind(ablesungId, fahrzeugId)
    .first<AblesungZeile>();
  if (!ablesung) {
    return fehlerAntwort('ABLESUNG_NICHT_GEFUNDEN', 'Ablesung nicht gefunden.', 404);
  }
  const korrektur = await db
    .prepare('SELECT id FROM ablesungen WHERE korrigiert = ?')
    .bind(ablesungId)
    .first<{ id: string }>();
  if (korrektur) {
    return fehlerAntwort(
      'ABLESUNG_HAT_KORREKTUR',
      'Diese Ablesung wurde bereits korrigiert. Zuerst die Korrektur löschen.',
      409,
    );
  }
  await db
    .prepare('DELETE FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')
    .bind(ablesungId, fahrzeugId)
    .run();
  await protokolliereAenderung(
    db,
    fahrzeugId,
    identitaet.email,
    `Kilometerstand gelöscht: ${ablesung.stand} km vom ${ablesung.abgelesen_am}`,
  );
  return new Response(null, { status: 204 });
}
