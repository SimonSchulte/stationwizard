import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { leseJsonKoerper } from './json-lesen';
import { pruefeUnterschrift, UNTERSCHRIFT_BYTES_MAX } from './unterschrift-pruefung';

export const UNTERSCHRIFT_PFAD = '/api/benutzer/unterschrift';

export interface BenutzerUnterschriftKonfiguration {
  BENUTZER_DB?: D1Database;
}

interface UnterschriftZeile {
  daten: string;
  geaendert_am: string;
}

/**
 * Eigene Unterschrift der geprüften Identität (`GET`/`PUT`/`DELETE`). Es gibt keinen Pfad zur
 * Unterschrift einer anderen Person: Die Zeile ergibt sich ausschließlich aus der Anmeldung.
 * Unterschriebene Dokumente tragen eine eigene Momentaufnahme (siehe `vorgaenge-unterschriften.ts`),
 * eine spätere Änderung hier ändert sie nicht.
 */
export async function verarbeiteBenutzerUnterschrift(
  anfrage: Request,
  umgebung: BenutzerUnterschriftKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.BENUTZER_DB;
  if (!db) {
    return fehlerAntwort(
      'UNTERSCHRIFT_KONFIGURATION_FEHLT',
      'Die Unterschrift ist noch nicht eingerichtet.',
      503,
    );
  }
  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('UNTERSCHRIFT_PFAD_UNGUELTIG', 'Endpunkt nicht gefunden.', 404);
  }

  try {
    if (anfrage.method === 'GET') {
      const zeile = await db
        .prepare('SELECT daten, geaendert_am FROM benutzer_unterschriften WHERE email = ?')
        .bind(identitaet.email)
        .first<UnterschriftZeile>();
      return jsonAntwort(
        zeile
          ? { unterschrift: JSON.parse(zeile.daten) as unknown, geaendertAm: zeile.geaendert_am }
          : { unterschrift: null, geaendertAm: null },
      );
    }

    if (anfrage.method === 'PUT') {
      const koerper = await leseJsonKoerper(anfrage, UNTERSCHRIFT_BYTES_MAX + 1024, {
        inhaltstyp: 'UNTERSCHRIFT_INHALTSTYP_UNGUELTIG',
        zuGross: 'UNTERSCHRIFT_DATEI_ZU_GROSS',
        unlesbar: 'UNTERSCHRIFT_DATEI_UNLESBAR',
      });
      if (koerper instanceof Response) return koerper;
      const daten = pruefeUnterschrift(koerper.inhalt);
      if (!daten) {
        return fehlerAntwort('UNTERSCHRIFT_DATEI_UNGUELTIG', 'Ungültige Unterschrift.', 400);
      }
      const jetzt = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO benutzer_unterschriften (email, art, daten, geaendert_am)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             art = excluded.art, daten = excluded.daten, geaendert_am = excluded.geaendert_am`,
        )
        .bind(identitaet.email, daten.art, JSON.stringify(daten), jetzt)
        .run();
      return jsonAntwort({ unterschrift: daten, geaendertAm: jetzt });
    }

    if (anfrage.method === 'DELETE') {
      await db
        .prepare('DELETE FROM benutzer_unterschriften WHERE email = ?')
        .bind(identitaet.email)
        .run();
      return jsonAntwort({ unterschrift: null, geaendertAm: null });
    }

    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
      Allow: 'GET, PUT, DELETE',
    });
  } catch (ursache) {
    console.error('UNTERSCHRIFT_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'UNTERSCHRIFT_DB_FEHLER',
      'Die Unterschrift konnte nicht verarbeitet werden.',
      502,
    );
  }
}
