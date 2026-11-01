import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { ursachenText } from './diagnose';
import {
  ABLAUF_PUFFER_MS,
  HIORG_ANTRAGSDATEN_MUSTER,
  HIORG_CODE_PFAD,
  HIORG_PERSONAL_PFAD,
  HIORG_VERBINDUNG_PFAD,
  type HiorgApiKonfiguration,
  leseZugang,
  NICHT_VERBUNDEN,
  transportFehler,
  VERBINDUNG_ABGELAUFEN,
  type Zugang,
} from './hiorg-gemeinsam';
import { codeAusAdresse } from './hiorg-oauth';
import {
  antragsdatenAusPersonal,
  filterePersonal,
  type HiorgAntragsdaten,
  type HiorgPersonAusgabe,
} from './hiorg-personal-felder';
import {
  enthaeltGeheimnis,
  entschluesseln,
  verbindungLesen,
  verbindungLoeschen,
  verbindungLoeschenStill,
} from './hiorg-tokenablage';
import { erneuern, personalAnfordern } from './hiorg-upstream';

/**
 * HiOrg-Server-API (`api.hiorg-server.de`, OAuth2 Authorization Code) als
 * zweiter HiOrg-Weg neben EFS (`efs.ts`). EFS arbeitet mit einem
 * organisationsweiten API-Key; diese API verlangt dagegen ein Zugriffstoken,
 * das eine konkrete HiOrg-Person durch ihre eigene Anmeldung bei HiOrg
 * ausstellt. Die Daten entsprechen deshalb immer den HiOrg-Rechten genau der
 * Person, die die Verbindung hergestellt hat.
 *
 * Ablauf, vollständig im Worker:
 *
 * 1. `GET /hiorg/verbinden` (Seitenaufruf, hinter Access) setzt ein zufälliges
 *    `state` als `__Host-`-Cookie und leitet zur festen HiOrg-Anmeldeseite.
 * 2. HiOrg leitet auf `GET /hiorg/rueckruf` zurück. Der Worker vergleicht
 *    `state`, tauscht den Code mit Client-ID und Client-Secret gegen Token und
 *    legt diese AES-GCM-verschlüsselt in `hiorg_verbindungen` (BENUTZER_DB)
 *    unter der geprüften Access-E-Mail ab.
 * 3. `GET /api/hiorg/personal` ruft `/core/v1/personal` mit diesem Token ab,
 *    erneuert es bei Bedarf und gibt nur eine feste, kleine Feldauswahl weiter.
 *
 * Der Browser sieht weder Client-Secret noch Token noch eine Upstream-Adresse:
 * er navigiert ausschließlich auf die beiden festen Pfade derselben Origin.
 * Die einzige HiOrg-Adresse, die er zu sehen bekommt, ist die Anmeldeseite,
 * auf die der Worker ihn weiterleitet – das ist der Kern des OAuth-Ablaufs.
 *
 * Zwei Rückrufwege, je nach bei HiOrg registrierter Redirect-URI:
 *
 * - **manuell** (Standard): Redirect-URI ist der Access-Callback der
 *   Team-Domain (`<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/callback`) – so bleibt
 *   die Anwendungsdomain gegenüber HiOrg ungenannt. Dort läuft nur
 *   Cloudflare-Code; Access lehnt den ihm unbekannten `state` ab und zeigt eine
 *   Fehlerseite, in deren Adresszeile `code` und `state` stehen. Die Person
 *   kopiert diese Adresse in die App, `POST /api/hiorg/verbindung/code` prüft
 *   `state` gegen das Cookie und tauscht den Code mit genau dieser URI.
 * - **automatisch**: Die Laufzeitvariable `HIORG_SERVER_REDIRECT_URI` ist
 *   `<Origin>/hiorg/rueckruf` und dort registriert; HiOrg leitet direkt zum
 *   Worker zurück.
 *
 * Eine andere Redirect-URI gilt als nicht eingerichtet – der Worker tauscht
 * nie Codes für Adressen, die er nicht selbst kennt.
 */
/** Schritt 3 und Verbindungsverwaltung unter `/api/hiorg/`. */
export async function verarbeiteHiorgApi(
  anfrage: Request,
  umgebung: HiorgApiKonfiguration,
  benutzer: Benutzer,
): Promise<Response> {
  const pfad = new URL(anfrage.url).pathname;
  if (pfad === HIORG_CODE_PFAD) return codeAusAdresse(anfrage, umgebung, benutzer);
  if (pfad === HIORG_VERBINDUNG_PFAD) {
    if (anfrage.method !== 'GET' && anfrage.method !== 'DELETE') {
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, DELETE',
      });
    }
    const zugang = await leseZugang(umgebung, anfrage);
    if (!zugang) return jsonAntwort({ eingerichtet: false, verbunden: false, modus: null });
    try {
      if (anfrage.method === 'DELETE') {
        // HiOrg dokumentiert keinen Widerrufsendpunkt; das Token wird hier
        // nur verworfen und läuft bei HiOrg von selbst ab.
        await verbindungLoeschen(zugang.db, benutzer.email);
        return jsonAntwort({ eingerichtet: true, verbunden: false, modus: zugang.modus });
      }
      const zeile = await verbindungLesen(zugang.db, benutzer.email);
      return jsonAntwort({ eingerichtet: true, verbunden: zeile !== null, modus: zugang.modus });
    } catch (ursache) {
      console.error('HIORG_VERBINDUNG_DB_FEHLER', ursachenText(ursache));
      return fehlerAntwort(
        'HIORG_SPEICHER_FEHLER',
        'Die HiOrg-Verbindung konnte nicht gelesen werden.',
        500,
      );
    }
  }

  const antragsdaten = HIORG_ANTRAGSDATEN_MUSTER.exec(pfad);
  if (pfad === HIORG_PERSONAL_PFAD || antragsdaten) {
    if (anfrage.method !== 'GET') {
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }
    if (new URL(anfrage.url).search !== '') {
      return fehlerAntwort('HIORG_ANFRAGE_UNGUELTIG', 'Keine URL-Parameter erlaubt.', 400);
    }
    const zugang = await leseZugang(umgebung, anfrage);
    if (!zugang) {
      return fehlerAntwort(
        'HIORG_API_KONFIGURATION_FEHLT',
        'Die HiOrg-Server-API ist noch nicht eingerichtet.',
        503,
      );
    }
    const personId = antragsdaten?.[1];
    return personalAbrufen(zugang, benutzer.email, (inhalt) =>
      personId ? antragsdatenAusPersonal(inhalt, personId) : filterePersonal(inhalt),
    );
  }

  return fehlerAntwort('API_NICHT_GEFUNDEN', 'API-Endpunkt nicht gefunden.', 404);
}
/**
 * Ruft das Personal mit dem gespeicherten Token ab und gibt nur zurück, was `auswahl` aus der
 * Rohantwort heraussucht. `undefined` heißt: unerwartete Form, die ganze Antwort wird verworfen;
 * `null` heißt: die gesuchte Person ist nicht dabei.
 */
async function personalAbrufen(
  zugang: Zugang,
  email: string,
  auswahl: (inhalt: unknown) => HiorgPersonAusgabe[] | HiorgAntragsdaten | null | undefined,
): Promise<Response> {
  let gespeichert: string | null;
  try {
    gespeichert = await verbindungLesen(zugang.db, email);
  } catch (ursache) {
    console.error('HIORG_VERBINDUNG_DB_FEHLER', ursachenText(ursache));
    return fehlerAntwort(
      'HIORG_SPEICHER_FEHLER',
      'Die HiOrg-Verbindung konnte nicht gelesen werden.',
      500,
    );
  }
  if (gespeichert === null) return NICHT_VERBUNDEN();
  let token = await entschluesseln(gespeichert, zugang.clientSecret, email);
  if (!token) {
    // Etwa nach einem neuen Client-Secret: der alte Stand ist nicht mehr lesbar.
    await verbindungLoeschenStill(zugang.db, email);
    return VERBINDUNG_ABGELAUFEN();
  }

  let erneuert = false;
  if (token.ablaufMs !== null && Date.now() >= token.ablaufMs - ABLAUF_PUFFER_MS) {
    const neu = await erneuern(zugang, email, gespeichert, token);
    if (neu instanceof Response) return neu;
    token = neu;
    erneuert = true;
  }

  let abruf = await personalAnfordern(token.zugang);
  if (abruf.art === 'nicht-autorisiert' && !erneuert && token.erneuerung) {
    // Ein vorzeitig ungültiges Token: einmal erneuern und den Lesezugriff wiederholen.
    const neu = await erneuern(zugang, email, gespeichert, token);
    if (neu instanceof Response) return neu;
    token = neu;
    abruf = await personalAnfordern(token.zugang);
  }

  switch (abruf.art) {
    case 'erfolg': {
      const ergebnis = auswahl(abruf.inhalt);
      if (ergebnis === null) {
        return fehlerAntwort(
          'HIORG_PERSON_NICHT_GEFUNDEN',
          'Die Person ist im HiOrg-Personal nicht enthalten.',
          404,
        );
      }
      // Auch ein fremder Server darf ein Token nicht in einem erlaubten Textfeld spiegeln.
      if (
        !ergebnis ||
        enthaeltGeheimnis(ergebnis, [token.zugang, token.erneuerung, zugang.clientSecret])
      ) {
        return transportFehler('ungueltig');
      }
      return jsonAntwort(Array.isArray(ergebnis) ? { personen: ergebnis } : ergebnis);
    }
    case 'nicht-autorisiert':
      await verbindungLoeschenStill(zugang.db, email);
      return VERBINDUNG_ABGELAUFEN();
    case 'verboten':
      return fehlerAntwort(
        'HIORG_API_BERECHTIGUNG_FEHLT',
        'Das verbundene HiOrg-Konto darf die Personaldaten nicht abrufen.',
        403,
      );
    case 'gesperrt':
      return fehlerAntwort(
        'HIORG_API_FUNKTION_GESPERRT',
        'Die Personal-API ist in der HiOrg-Lizenz nicht freigeschaltet.',
        502,
      );
    case 'abgelehnt':
      return fehlerAntwort('HIORG_API_ABRUF_FEHLGESCHLAGEN', 'HiOrg hat den Abruf abgelehnt.', 502);
    case 'zu-gross':
      return fehlerAntwort('HIORG_API_ANTWORT_ZU_GROSS', 'Die HiOrg-Antwort ist zu groß.', 502);
    default:
      return transportFehler(abruf.art);
  }
}
