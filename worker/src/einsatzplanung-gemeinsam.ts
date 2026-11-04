import { fehlerAntwort } from './antwort';
import { versionAusEtag } from './etag';
import { leseJsonKoerper } from './json-lesen';

/** Gemeinsame Konfiguration, Grenzen, Körperlesen und Vorbedingungen der Einsatzplanung. */

export interface EinsatzplanungKonfiguration {
  EINSATZPLANUNG_DB?: D1Database;
}

export const FACHGRUPPEN = new Set(['sanitaet', 'betreuung', 'verpflegung', 'tesi', 'fuehrung']);
export const ABSCHNITT_FARBEN = new Set([
  'abschnitt-1',
  'abschnitt-2',
  'abschnitt-3',
  'abschnitt-4',
  'abschnitt-5',
  'abschnitt-6',
  'abschnitt-7',
  'abschnitt-8',
]);

// Ein VB-Inhalt hat höchstens 300 Laufzettel zu je höchstens 50 Positionen; die
// Grenze gilt für Vorlagen und Vorbereitungen gleichermaßen (Vertrag: Körper ≤ 256 KB).
export const VB_KOERPER_GRENZE = 256 * 1024;
export const EINSATZ_KOERPER_GRENZE = 16 * 1024;

export const MAX_ABSCHNITTE = 30;
export const MAX_LAUFZETTEL = 300;
export const MAX_POSITIONEN = 50;
export const TEXT_MAX = 200;
export const ANZAHL_MAX = 20;
export const ANWEISUNGEN_MAX = 6000;

export function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  return leseJsonKoerper(anfrage, grenze, {
    zuGross: 'EINSATZPLANUNG_ZU_GROSS',
    unlesbar: 'EINSATZPLANUNG_UNGUELTIG',
  });
}

export function ungueltig(nachricht: string): Response {
  return fehlerAntwort('EINSATZPLANUNG_UNGUELTIG', nachricht, 400);
}

export function nichtGefunden(): Response {
  return fehlerAntwort('EINSATZPLANUNG_NICHT_GEFUNDEN', 'Einsatz nicht gefunden.', 404);
}

export function bereitsVorhanden(nachricht: string): Response {
  return fehlerAntwort('EINSATZPLANUNG_BEREITS_VORHANDEN', nachricht, 409);
}

export function versionskonflikt(nachricht: string): Response {
  return fehlerAntwort('EINSATZPLANUNG_VERSIONSKONFLIKT', nachricht, 412);
}

/** Anlage nur mit `If-None-Match: *` und nie zusammen mit `If-Match`. */
export function pruefeAnlegenVorbedingung(anfrage: Request): Response | null {
  const ifNoneMatch = anfrage.headers.get('If-None-Match');
  if (ifNoneMatch === null) {
    return fehlerAntwort(
      'EINSATZPLANUNG_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  if (ifNoneMatch !== '*' || anfrage.headers.has('If-Match')) {
    return fehlerAntwort('EINSATZPLANUNG_VORBEDINGUNG_UNGUELTIG', 'Ungültige Vorbedingung.', 400);
  }
  return null;
}

/** Erwartete Versionsnummer aus `If-Match` (stark oder schwach), sonst die abweisende Antwort. */
export function erwarteteVersion(anfrage: Request): number | Response {
  const ifMatch = anfrage.headers.get('If-Match');
  if (ifMatch === null || ifMatch === '') {
    return fehlerAntwort(
      'EINSATZPLANUNG_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const version = versionAusEtag(ifMatch);
  if (version === null || anfrage.headers.has('If-None-Match')) {
    return fehlerAntwort('EINSATZPLANUNG_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  return version;
}
