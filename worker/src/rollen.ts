import type { Benutzer } from './anmeldung';
import { fehlerAntwort } from './antwort';

/**
 * Serverseitige Rollenprüfung.
 *
 * Bis hierher galt im ganzen Projekt "Rechte vorerst alle, Rollen später"
 * (docs/konzept-fahrzeuge.md, Abschnitt 8): Rollen steuerten nur, was die
 * Oberfläche einblendet. Für die Freigabe öffentlicher Kilometermeldungen
 * reicht das nicht – eine Freigabe, die jede angemeldete Person auch für die
 * eigene Meldung erteilen könnte, wäre kein Kontrollschritt. Dies ist deshalb
 * die erste tatsächlich durchgesetzte Prüfung und zugleich die Vorlage für die
 * später fällige Admin-Rolle.
 *
 * Ehrliche Grenze: die Prüfung ist nur so stark wie die Rollenvergabe, und
 * `PUT /api/benutzerverwaltung/<E-Mail>` steht weiterhin jeder geprüften
 * Identität offen. Wer sich selbst "zugfuehrung" setzt, darf anschließend
 * freigeben. Das ist kein Grund, hier nichts zu prüfen – es ist der nächste
 * fällige Schritt (siehe docs/arbeitsstand.md).
 */
export interface RollenKonfiguration {
  BENUTZER_DB?: D1Database;
}

export interface Rollenzuordnung {
  rolle: string | null;
  sonderrollen: string[];
}

interface RollenZeile {
  rolle: string | null;
  sonderrollen: string;
}

/**
 * Rollenzuordnung einer geprüften Identität. `null`, wenn die Person noch
 * keine Zeile hat – dann gilt: keine Rolle. Das ist der Normalfall, weil eine
 * Zeile erst beim ersten `GET /api/benutzer` entsteht.
 */
export async function leseRolle(db: D1Database, email: string): Promise<Rollenzuordnung | null> {
  const zeile = await db
    .prepare('SELECT rolle, sonderrollen FROM benutzer WHERE email = ?')
    .bind(email)
    .first<RollenZeile>();
  if (!zeile) return null;
  // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
  const sonderrollen: unknown = JSON.parse(zeile.sonderrollen);
  return {
    rolle: zeile.rolle,
    sonderrollen: Array.isArray(sonderrollen)
      ? sonderrollen.filter((wert): wert is string => typeof wert === 'string')
      : [],
  };
}

/**
 * Freigabeberechtigt für ein Fahrzeug der angegebenen Gruppe ist die Hauptrolle
 * "zugfuehrung" (alle Gruppen) oder "gruppenfuehrung-<gruppe>" genau der Gruppe
 * dieses Fahrzeugs. Die Zuordnung ist eine Zeichenkettenbildung und keine
 * Tabelle, weil sich `Gruppe` (`betreuung`, `tesi`, `fuehrung`, `sanitaet`) und
 * die Gruppenführungsrollen genau decken.
 *
 * "gruppenfuehrung-verpflegung" trifft deshalb nie zu: für Verpflegung sind
 * fachlich keine Fahrzeuge vorgesehen, die Gruppe kennt das Fahrzeugmodell
 * nicht (siehe `migrations/0006_fahrzeug_gruppe.sql`).
 *
 * Reine Funktion, damit sie ohne Datenbank vollständig prüfbar ist.
 */
export function darfFreigeben(rolle: string | null, gruppe: string): boolean {
  if (rolle === 'zugfuehrung') return true;
  return gruppe !== '' && rolle === `gruppenfuehrung-${gruppe}`;
}

/**
 * Die Gruppen, für die diese Rolle freigeben darf – Grundlage der gefilterten
 * Liste offener Einreichungen. Leer bedeutet: diese Person sieht keine.
 */
export function freigabeGruppen(rolle: string | null): readonly string[] {
  return ALLE_GRUPPEN.filter((gruppe) => darfFreigeben(rolle, gruppe));
}

const ALLE_GRUPPEN: readonly string[] = ['betreuung', 'tesi', 'fuehrung', 'sanitaet'];

/**
 * Durchsetzung. Liefert `null`, wenn erlaubt, sonst die abweisende Antwort.
 *
 * Schließt bei fehlender Konfiguration zu, statt durchzuwinken (CLAUDE.md:
 * "Fehlende Konfiguration oder nicht prüfbare Tokens sperren den Zugriff").
 * Der Text nennt die eigene Rolle nicht.
 */
export async function pruefeFreigabeRecht(
  umgebung: RollenKonfiguration,
  identitaet: Benutzer,
  gruppe: string,
): Promise<Response | null> {
  const db = umgebung.BENUTZER_DB;
  if (!db) {
    return fehlerAntwort(
      'ROLLEN_KONFIGURATION_FEHLT',
      'Die Rollenverwaltung ist noch nicht eingerichtet; eine Freigabe ist deshalb nicht möglich.',
      503,
    );
  }
  const zuordnung = await leseRolle(db, identitaet.email);
  if (!darfFreigeben(zuordnung?.rolle ?? null, gruppe)) {
    return fehlerAntwort(
      'FREIGABE_NICHT_ERLAUBT',
      'Diese Meldung darf nur die Zugführung oder die Gruppenführung des Fahrzeugs freigeben.',
      403,
    );
  }
  return null;
}
