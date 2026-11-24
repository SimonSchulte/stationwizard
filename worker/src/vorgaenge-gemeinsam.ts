import { fehlerAntwort } from './antwort';
import type { MailVersandKonfiguration } from './mail-versand';
import { versionAusEtag } from './etag';
import { type RollenKonfiguration } from './rollen';

/**
 * Gemeinsame Konfiguration, Grenzen und Fehlerantworten der Vorgänge
 * (`vorgaenge*.ts`; Konzept in `docs/konzept-vorgaenge.md`).
 */
export interface VorgaengeKonfiguration extends RollenKonfiguration, MailVersandKonfiguration {
  FAHRZEUGE_DB?: D1Database;
  /** Dateien der Angebote, der gesendeten Meldungen und der Rohmails; fehlt bis zur Einrichtung. */
  VORGAENGE_DATEIEN?: R2Bucket;
  /** Domain der Postfachadressen; ohne Angabe die Domain, unter der der Worker erreicht wird. */
  POSTFACH_DOMAIN?: string;
}

export interface GeprueftesBenutzerkonto {
  email: string;
}

export const VORGANG_ART = 'fahrzeug-material-defekt';

/**
 * Die festen Stufen des Vorgangs „Fahrzeug/Material defekt“. Frontend und Worker führen dieselbe
 * Liste (`src/app/vorgaenge/models/vorgang.model.ts`), gemeinsam ändern.
 */
export const VORGANG_STUFEN = [
  'Schadensmeldung ausgefüllt',
  'Angebote eingeholt',
  'Eingereicht',
  'Genehmigt',
  'Geplant',
  'Erledigt',
] as const;
export const STUFE_ANGEBOTE = 1;
export const STUFE_EINGEREICHT = 2;
export const STUFE_GENEHMIGT = 3;
export const LETZTE_STUFE = VORGANG_STUFEN.length - 1;

export const SLOTS = ['fest', 'leitung', 'verantw'] as const;
export type Slot = (typeof SLOTS)[number];
/** Ohne diese beiden Unterschriften lässt sich die Meldung weder drucken noch einreichen. */
export const PFLICHT_SLOTS: readonly Slot[] = ['fest', 'verantw'];
export const SLOT_BEZEICHNUNG: Record<Slot, string> = {
  fest: 'festgestellt durch',
  leitung: 'Leitung',
  verantw: 'verantwortliche Person',
};

/** Wer „Genehmigt“ setzen und eine eingereichte Meldung zurücknehmen darf. */
export const GENEHMIGUNG_ROLLEN: readonly string[] = ['zugfuehrung'];

export const VORGANG_KOERPER_GRENZE = 64 * 1024;
export const TITEL_MAX = 120;

export const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ungueltig(nachricht: string): Response {
  return fehlerAntwort('VORGANG_UNGUELTIG', nachricht, 400);
}

export function nichtGefunden(nachricht = 'Vorgang nicht gefunden.'): Response {
  return fehlerAntwort('VORGANG_NICHT_GEFUNDEN', nachricht, 404);
}

export function versionskonflikt(): Response {
  return fehlerAntwort(
    'VORGANG_VERSIONSKONFLIKT',
    'Der Stand wurde zwischenzeitlich geändert. Bitte neu laden.',
    412,
  );
}

export function konflikt(code: string, nachricht: string): Response {
  return fehlerAntwort(code, nachricht, 409);
}

/** Wert des `If-Match`-Kopfs als Versionsnummer oder die abweisende Antwort. */
export function erwarteteVersion(anfrage: Request): number | Response {
  const ifMatch = anfrage.headers.get('If-Match');
  if (ifMatch === null || ifMatch === '') {
    return fehlerAntwort(
      'VORGANG_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const version = versionAusEtag(ifMatch);
  if (version === null || anfrage.headers.has('If-None-Match')) {
    return fehlerAntwort('VORGANG_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  return version;
}

/** Lesbarer Name aus der geprüften E-Mail-Adresse, wie `anzeigenameAusEmail()` im Frontend. */
export function anzeigenameAusEmail(email: string): string {
  const lokalTeil = (email.split('@')[0] ?? '').trim();
  const teile = lokalTeil
    .split(/[._+-]+/)
    .map((teil) => teil.trim())
    .filter((teil) => teil.length > 0)
    .map((teil) => teil.charAt(0).toUpperCase() + teil.slice(1).toLowerCase());
  return teile.length > 0 ? teile.join(' ') : email;
}
