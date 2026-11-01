import { fehlerAntwort } from './antwort';
import { versionAusEtag } from './etag';
import { istText, leseJsonKoerper } from './json-lesen';
import { type MailVersandKonfiguration } from './mail-versand';
import { type SystemkonfigurationKonfiguration } from './systemkonfiguration';

/**
 * Gemeinsame Bausteine der Materialendpunkte: Konfiguration, Grenzen,
 * Versionsprüfung und Körperlesen. Die Ressourcen selbst liegen in
 * `material-vorlagen.ts`, `material-behaelter.ts`, `material-checkablauf.ts`,
 * `material-pruefcodes.ts` und `material-berichtsversand.ts`; `material.ts` verteilt
 * nur die Pfade.
 */

export interface MaterialKonfiguration
  extends SystemkonfigurationKonfiguration, MailVersandKonfiguration {
  FAHRZEUGE_DB?: D1Database;
}
export const HERKUENFTE = new Set(['seg', 'land', 'beide']);

// Eine Vorlage trägt ihren gesamten Baum in einer JSON-Spalte; die
// NFR-EE-Liste mit 125 Artikeln liegt bei rund 21 kB.
export const VORLAGE_KOERPER_GRENZE = 256 * 1024;
export const BEHAELTER_KOERPER_GRENZE = 8 * 1024;
// Rund 125 Positionen mit Verfallsdaten je Stück liegen bei etwa 35 kB; die
// Grenze lässt Luft, bleibt aber weit unter der Zeilengrenze von D1.
export const CHECK_KOERPER_GRENZE = 256 * 1024;
export const SENDEN_KOERPER_GRENZE = 4 * 1024;

export const BEZEICHNUNG_MAX = 200;
export const TEXT_MAX = 2000;
export const EINHEIT_MAX = 20;
export const SOLLMENGE_MAX = 999;
export function istKurztext(wert: unknown, grenze: number): wert is string {
  return istText(wert) && wert.length <= grenze;
}

/** Erwartete Versionsnummer aus `If-Match`, sonst die abweisende Antwort. */
export function erwarteteVersion(anfrage: Request): number | Response {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return fehlerAntwort(
      'MATERIAL_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const version = versionAusEtag(ifMatch);
  if (version === null) {
    return fehlerAntwort('MATERIAL_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  return version;
}

export function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  return leseJsonKoerper(anfrage, grenze, {
    inhaltstyp: 'MATERIAL_INHALTSTYP_UNGUELTIG',
    zuGross: 'MATERIAL_DATEI_ZU_GROSS',
    unlesbar: 'MATERIAL_DATEI_UNLESBAR',
  });
}
