import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istObjekt, istText, leseJsonKoerper } from './json-lesen';
import { anzeigenameAusEmail } from './vorgaenge-gemeinsam';

export const ANZEIGENAME_PFAD = '/api/benutzer/anzeigename';
export const ANZEIGENAME_MAX_LAENGE = 60;

export interface AnzeigenameKonfiguration {
  BENUTZER_DB?: D1Database;
}

/**
 * Prüft einen selbst gewählten Anzeigename: Text ohne Steuerzeichen, überzählige Leerzeichen
 * werden zusammengefasst, höchstens 60 Zeichen. `null` (Name zurücksetzen) ist gültig; ein leerer
 * oder nur aus Leerraum bestehender Text nicht.
 */
export function pruefeAnzeigename(wert: unknown): { name: string | null } | null {
  if (wert === null) return { name: null };
  if (!istText(wert)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(wert)) return null;
  const name = wert.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || [...name].length > ANZEIGENAME_MAX_LAENGE) return null;
  return { name };
}

/** Der gespeicherte eigene Name der Person oder `null`. */
export async function leseAnzeigename(db: D1Database, email: string): Promise<string | null> {
  const zeile = await db
    .prepare('SELECT anzeigename FROM benutzer WHERE email = ?')
    .bind(email)
    .first<{ anzeigename: string | null }>();
  return zeile?.anzeigename ?? null;
}

/**
 * Name für Ausgaben und Verlaufseinträge: der eigene Name der Person, sonst der aus der E-Mail-
 * Adresse abgeleitete. Ein Lesefehler oder fehlende Konfiguration fällt auf die Ableitung zurück –
 * ein Name darf nie eine Fachaktion verhindern.
 */
export async function ermittleAnzeigename(
  db: D1Database | undefined,
  email: string,
): Promise<string> {
  if (db) {
    try {
      const eigener = await leseAnzeigename(db, email);
      if (eigener) return eigener;
    } catch (ursache) {
      console.error('ANZEIGENAME_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    }
  }
  return anzeigenameAusEmail(email);
}

/**
 * Eigener Anzeigename der geprüften Identität (`GET`/`PUT`). Es gibt keinen Pfad zum Namen einer
 * anderen Person. Der Name ändert keine Zuordnung: Rollen, Unterschriften und Freigaben hängen
 * weiter an der E-Mail-Adresse.
 */
export async function verarbeiteAnzeigename(
  anfrage: Request,
  umgebung: AnzeigenameKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.BENUTZER_DB;
  if (!db) {
    return fehlerAntwort(
      'ANZEIGENAME_KONFIGURATION_FEHLT',
      'Die Benutzereinstellungen sind noch nicht eingerichtet.',
      503,
    );
  }
  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('ANZEIGENAME_PFAD_UNGUELTIG', 'Endpunkt nicht gefunden.', 404);
  }
  try {
    if (anfrage.method === 'GET') {
      return jsonAntwort({ anzeigename: await leseAnzeigename(db, identitaet.email) });
    }
    if (anfrage.method === 'PUT') {
      const koerper = await leseJsonKoerper(anfrage, 1024, {
        inhaltstyp: 'ANZEIGENAME_INHALTSTYP_UNGUELTIG',
        zuGross: 'ANZEIGENAME_DATEI_ZU_GROSS',
        unlesbar: 'ANZEIGENAME_DATEI_UNLESBAR',
      });
      if (koerper instanceof Response) return koerper;
      const inhalt = koerper.inhalt;
      const eingabe =
        istObjekt(inhalt) && Object.keys(inhalt).join() === 'anzeigename'
          ? pruefeAnzeigename(inhalt['anzeigename'])
          : null;
      if (!eingabe) {
        return fehlerAntwort('ANZEIGENAME_DATEI_UNGUELTIG', 'Ungültiger Anzeigename.', 400);
      }
      // Nur die eigene Zeile; sie entsteht beim ersten geprüften Abruf von /api/benutzer.
      const jetzt = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO benutzer (email, sonderrollen, erster_zugriff_am, letzter_zugriff_am, anzeigename)
           VALUES (?, '[]', ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET anzeigename = excluded.anzeigename`,
        )
        .bind(identitaet.email, jetzt, jetzt, eingabe.name)
        .run();
      return jsonAntwort({ anzeigename: eingabe.name });
    }
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
      Allow: 'GET, PUT',
    });
  } catch (ursache) {
    console.error('ANZEIGENAME_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'ANZEIGENAME_DB_FEHLER',
      'Der Anzeigename konnte nicht verarbeitet werden.',
      502,
    );
  }
}
