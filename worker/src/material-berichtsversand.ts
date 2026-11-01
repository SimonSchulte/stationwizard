import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istObjekt, istText } from './json-lesen';
import { berlinerKalendertag } from './kalender';
import { VersandFehler, VERSANDFEHLER_ANTWORTEN, waehleVersand } from './mail-versand';
import {
  berichtAlsNachricht,
  berichtAlsText,
  type Berichtsart,
  BERICHTSARTEN,
  type BerichtsQuelle,
  istBerichtsart,
} from './material-bericht';
import { Checkposition } from './material-check';
import { type CheckZeile } from './material-checkablauf';
import {
  lesePruefeKoerper,
  type MaterialKonfiguration,
  SENDEN_KOERPER_GRENZE,
} from './material-gemeinsam';
import { leseEinstellungen } from './systemkonfiguration';

/** Berichte eines Checks: Vorschau als Text und Versand an die Standardempfänger. */

interface CheckMitBehaelterZeile extends CheckZeile {
  behaelter_bezeichnung: string;
  fahrzeug_bezeichnung: string;
}

const CHECK_MIT_BEHAELTER = `
  SELECT c.*, b.bezeichnung AS behaelter_bezeichnung,
         f.bezeichnung AS fahrzeug_bezeichnung
  FROM materialchecks c
  JOIN behaelter b ON b.id = c.behaelter_id
  JOIN fahrzeuge f ON f.id = b.fahrzeug_id
  WHERE c.id = ?`;

function zuBerichtsQuelle(zeile: CheckMitBehaelterZeile): BerichtsQuelle {
  return {
    behaelterBezeichnung: zeile.behaelter_bezeichnung,
    fahrzeugBezeichnung: zeile.fahrzeug_bezeichnung,
    vorlageBezeichnung: zeile.vorlage_bezeichnung,
    grundlage: zeile.grundlage,
    geprueftAm: zeile.geprueft_am,
    erfasstVon: zeile.erfasst_von,
    gemeldetVonName: zeile.gemeldet_von_name,
    verfallsdatumErfasst: zeile.verfallsdatum_erfasst === 1,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    positionen: JSON.parse(zeile.positionen) as Checkposition[],
  };
}

async function ladeBerichtsQuelle(db: D1Database, checkId: string): Promise<BerichtsQuelle | null> {
  const zeile = await db.prepare(CHECK_MIT_BEHAELTER).bind(checkId).first<CheckMitBehaelterZeile>();
  return zeile ? zuBerichtsQuelle(zeile) : null;
}

function pruefeArt(roh: string): Berichtsart | Response {
  const art = roh.toLowerCase();
  if (!istBerichtsart(art)) {
    return fehlerAntwort(
      'MATERIAL_BERICHT_ART_UNGUELTIG',
      `Unbekannte Berichtsart. Bekannt sind: ${BERICHTSARTEN.join(', ')}.`,
      400,
    );
  }
  return art;
}

/** Vorschau: derselbe Text, den auch die Mail trägt. */
export async function liefereBericht(
  db: D1Database,
  checkId: string,
  roh: string,
): Promise<Response> {
  const art = pruefeArt(roh);
  if (art instanceof Response) return art;
  const quelle = await ladeBerichtsQuelle(db, checkId);
  if (!quelle) {
    return fehlerAntwort('MATERIAL_CHECK_NICHT_GEFUNDEN', 'Check nicht gefunden.', 404);
  }
  return jsonAntwort({
    art,
    text: berichtAlsText(quelle, art, berlinerKalendertag(new Date())),
  });
}

/** Standardempfänger je Berichtsart aus der Systemkonfiguration. */
function standardEmpfaenger(
  art: Berichtsart,
  einstellungen: {
    materialBestellscheinEmpfaenger: string;
    materialMaengelLandEmpfaenger: string;
    materialMaengelSegEmpfaenger: string;
  },
): string {
  if (art === 'bestellschein') return einstellungen.materialBestellscheinEmpfaenger;
  if (art === 'maengel-land') return einstellungen.materialMaengelLandEmpfaenger;
  return einstellungen.materialMaengelSegEmpfaenger;
}

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Versendet den Bericht. Der Körper trägt **nur** einen Empfänger, nie einen
 * Text: ein clientgelieferter Mailtext wäre ein Versandrelais unter fremder
 * Absenderadresse. Den Text erzeugt der Worker aus der gespeicherten Checkzeile.
 */
export async function sendeMaterialBericht(
  anfrage: Request,
  umgebung: MaterialKonfiguration,
  db: D1Database,
  checkId: string,
  roh: string,
  identitaet: Benutzer,
): Promise<Response> {
  const art = pruefeArt(roh);
  if (art instanceof Response) return art;

  const konfigDb = umgebung.BENUTZER_DB;
  if (!konfigDb) {
    return fehlerAntwort(
      'SYSTEMKONFIGURATION_KONFIGURATION_FEHLT',
      'Die Systemkonfiguration ist noch nicht eingerichtet.',
      503,
    );
  }

  const quelle = await ladeBerichtsQuelle(db, checkId);
  if (!quelle) {
    return fehlerAntwort('MATERIAL_CHECK_NICHT_GEFUNDEN', 'Check nicht gefunden.', 404);
  }

  const koerper = await lesePruefeKoerper(anfrage, SENDEN_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const inhalt = koerper.inhalt;
  if (!istObjekt(inhalt)) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültige Anfrage.', 400);
  }

  const einstellungen = await leseEinstellungen(konfigDb);
  const uebergeben = inhalt['empfaenger'];
  let empfaenger: string;
  if (uebergeben === undefined || uebergeben === null || uebergeben === '') {
    empfaenger = standardEmpfaenger(art, einstellungen);
  } else if (istText(uebergeben) && EMAIL_MUSTER.test(uebergeben.trim())) {
    empfaenger = uebergeben.trim();
  } else {
    return fehlerAntwort(
      'MATERIAL_BERICHT_EMPFAENGER_UNGUELTIG',
      'Die angegebene Empfängeradresse ist nicht gültig.',
      400,
    );
  }
  if (empfaenger === '') {
    return fehlerAntwort(
      'MATERIAL_BERICHT_EMPFAENGER_FEHLT',
      'Es ist kein Standardempfänger hinterlegt und keiner angegeben.',
      409,
    );
  }

  const heute = berlinerKalendertag(new Date());
  const nachricht = berichtAlsNachricht(
    quelle,
    art,
    empfaenger,
    einstellungen.materialBetreff,
    heute,
  );
  try {
    const versand = await waehleVersand(einstellungen.materialVersandweg, umgebung);
    await versand.sende(nachricht);
  } catch (ursache) {
    if (ursache instanceof VersandFehler) {
      const { code, status } = VERSANDFEHLER_ANTWORTEN[ursache.grund];
      return fehlerAntwort(code, 'Der Bericht konnte nicht versendet werden.', status);
    }
    throw ursache;
  }

  // Bewusst ohne die Empfängeradresse im Protokoll: sie ist eine Angabe der
  // sendenden Person und gehört nicht in die Worker-Logs.
  console.info('MATERIAL_BERICHT_GESENDET', art, checkId);
  return jsonAntwort({
    art,
    gesendetAn: empfaenger,
    gesendetAm: new Date().toISOString(),
    gesendetVon: identitaet.email,
    versandweg: einstellungen.materialVersandweg,
  });
}
