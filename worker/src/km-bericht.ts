import { fehlerAntwort, jsonAntwort } from './antwort';
import type { GeprueftesBenutzerkonto } from './fahrzeuge';
import { berlinerKalendertag } from './kalender';
import {
  VersandFehler,
  waehleVersand,
  type MailVersandKonfiguration,
  type MailNachricht,
} from './mail-versand';
import { leseEinstellungen, type SystemkonfigurationKonfiguration } from './systemkonfiguration';

/**
 * Kilometerstandsbericht über alle Fahrzeuge: einmal als strukturierte
 * Vorschau für die Oberfläche, einmal als Mailtext. Der Bericht ist reine
 * Fahrzeugfachlichkeit und liegt deshalb neben `fahrzeuge.ts`, nicht in der
 * Systemkonfiguration – dort steht nur, wohin er geht.
 *
 * Die Kennzahlen bilden `src/app/fahrzeuge/services/kilometer-soll.ts` nach:
 * Jahressoll aus der Mindestlaufleistung, Jahresstartstand aus der letzten
 * Ablesung des Vorjahres (ersatzweise der ersten des Jahres, dann als
 * unvollständig markiert). Beide Fassungen müssen gemeinsam geändert werden;
 * `worker/tests/km-bericht.spec.ts` spiegelt die Fälle der dortigen Tests.
 * Eine geteilte Quelle wäre nur um den Preis möglich, Anwendungsquellen in
 * das Worker-Bundle zu ziehen – das bleibt bewusst getrennt.
 */

export interface KmBerichtKonfiguration
  extends SystemkonfigurationKonfiguration, MailVersandKonfiguration {
  FAHRZEUGE_DB?: D1Database;
}

export const KM_BERICHT_PFAD = '/api/fahrzeuge/km-bericht';
export const KM_BERICHT_SENDEN_PFAD = '/api/fahrzeuge/km-bericht/senden';

/** Siehe `MINDEST_KM_PRO_MONAT` in `src/app/fahrzeuge/models/fahrzeug.model.ts`. */
const MINDEST_KM_PRO_MONAT: Record<string, number> = {
  'land-nrw': 150,
  bund: 50,
  organisation: 0,
};

const EIGENTUEMER_LABEL: Record<string, string> = {
  'land-nrw': 'Land NRW',
  bund: 'Bund',
  organisation: 'Organisation',
};

interface FahrzeugZeile {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  eigentuemer: string;
}

interface AblesungZeile {
  id: string;
  fahrzeug_id: string;
  abgelesen_am: string;
  stand: number;
  korrigiert: string | null;
}

export interface BerichtZeile {
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  eigentuemer: string;
  /** Letzter gültiger Stand, oder `null` ohne jede Ablesung. */
  letzterStand: number | null;
  abgelesenAm: string | null;
  /** Kalendertage zwischen letzter Ablesung und Stichtag. */
  tageSeitAblesung: number | null;
  sollKm: number;
  istKm: number | null;
  restKm: number | null;
  unvollstaendig: boolean;
}

export interface KmBericht {
  /** Berliner Kalendertag, an dem der Bericht erstellt wurde. */
  stichtag: string;
  jahr: number;
  zeilen: BerichtZeile[];
  ohneAblesung: number;
  unterSoll: number;
}

/** Differenz zweier reiner Kalendertage in Tagen; beide Seiten sind `YYYY-MM-DD`. */
function tageZwischen(von: string, bis: string): number {
  const alsZahl = (tag: string) => Date.parse(`${tag}T00:00:00Z`);
  return Math.round((alsZahl(bis) - alsZahl(von)) / 86_400_000);
}

function jahrVon(tag: string): number {
  return Number(tag.slice(0, 4));
}

/**
 * Gültig sind alle Ablesungen, auf die keine spätere Korrektur verweist –
 * dieselbe Regel wie im Fahrzeugdetail (`korrigierteIds`).
 */
function gueltigeAblesungen(alle: readonly AblesungZeile[]): AblesungZeile[] {
  const korrigierte = new Set(
    alle.map((eintrag) => eintrag.korrigiert).filter((id): id is string => id !== null),
  );
  return alle.filter((eintrag) => !korrigierte.has(eintrag.id));
}

function berechneZeile(
  fahrzeug: FahrzeugZeile,
  ablesungen: readonly AblesungZeile[],
  stichtag: string,
  jahr: number,
): BerichtZeile {
  const sortiert = [...ablesungen].sort((a, b) => a.abgelesen_am.localeCompare(b.abgelesen_am));
  const bisJahresende = sortiert.filter((a) => jahrVon(a.abgelesen_am) <= jahr);
  const letzte = bisJahresende.at(-1) ?? null;

  const vorjahr = sortiert.filter((a) => jahrVon(a.abgelesen_am) < jahr).at(-1);
  const imJahr = sortiert.filter((a) => jahrVon(a.abgelesen_am) === jahr);
  const ersteImJahr = imJahr[0];
  let startstand: number | null = null;
  let unvollstaendig = true;
  if (vorjahr) {
    startstand = vorjahr.stand;
    unvollstaendig = false;
  } else if (ersteImJahr) {
    startstand = ersteImJahr.stand;
    unvollstaendig = ersteImJahr.abgelesen_am !== `${jahr}-01-01`;
  }

  const sollKm = (MINDEST_KM_PRO_MONAT[fahrzeug.eigentuemer] ?? 0) * 12;
  const istKm = startstand !== null && letzte ? letzte.stand - startstand : null;
  return {
    bezeichnung: fahrzeug.bezeichnung,
    funkrufname: fahrzeug.funkrufname,
    kennzeichen: fahrzeug.kennzeichen,
    eigentuemer: fahrzeug.eigentuemer,
    letzterStand: letzte?.stand ?? null,
    abgelesenAm: letzte?.abgelesen_am ?? null,
    tageSeitAblesung: letzte ? tageZwischen(letzte.abgelesen_am, stichtag) : null,
    sollKm,
    istKm,
    restKm: istKm !== null ? Math.max(0, sollKm - istKm) : null,
    unvollstaendig,
  };
}

export async function ladeKmBericht(db: D1Database, stichtag: string): Promise<KmBericht> {
  const fahrzeuge = await db
    .prepare(
      'SELECT id, bezeichnung, funkrufname, kennzeichen, eigentuemer FROM fahrzeuge ORDER BY bezeichnung',
    )
    .all<FahrzeugZeile>();
  const ablesungen = await db
    .prepare('SELECT id, fahrzeug_id, abgelesen_am, stand, korrigiert FROM ablesungen')
    .all<AblesungZeile>();

  const jahr = jahrVon(stichtag);
  const gueltige = gueltigeAblesungen(ablesungen.results);
  const zeilen = fahrzeuge.results.map((fahrzeug) =>
    berechneZeile(
      fahrzeug,
      gueltige.filter((eintrag) => eintrag.fahrzeug_id === fahrzeug.id),
      stichtag,
      jahr,
    ),
  );

  return {
    stichtag,
    jahr,
    zeilen,
    ohneAblesung: zeilen.filter((zeile) => zeile.letzterStand === null).length,
    // `sollKm === 0` betrifft Fahrzeuge der Organisation ohne Vorgabe; sie
    // gelten nie als unter Soll (siehe docs/konzept-fahrzeuge.md, Abschnitt 3).
    unterSoll: zeilen.filter((zeile) => zeile.sollKm > 0 && (zeile.restKm ?? zeile.sollKm) > 0)
      .length,
  };
}

/**
 * Farben wie `PDF_FARBEN` in `src/app/einsatz/services/pdf-export.service.ts`.
 * Mailclients kennen weder CSS-Variablen noch externe Stylesheets; wie beim
 * PDF-Export stehen deshalb aufgelöste Werte statt Tokennamen (siehe CLAUDE.md,
 * "Darstellung") – dieselben Werte, keine zweite Palette.
 */
const MAIL_FARBEN = {
  dunkelblau: '#000548',
  weiss: '#FFFFFF',
  text: '#333333',
  sekundaer: '#666666',
  hellgrau: '#C7CCD9',
  alternierendeZeile: '#F5F6FA',
  rot: '#EB003C',
  gruen: '#2F8F68',
} as const;

function maskiere(wert: string): string {
  return wert
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function zahl(wert: number): string {
  return wert.toLocaleString('de-DE');
}

function datum(tag: string): string {
  const [jahr, monat, tagImMonat] = tag.split('-');
  return `${tagImMonat}.${monat}.${jahr}`;
}

function standText(zeile: BerichtZeile): string {
  return zeile.letzterStand === null ? 'keine Ablesung' : `${zahl(zeile.letzterStand)} km`;
}

function ablesungText(zeile: BerichtZeile): string {
  if (!zeile.abgelesenAm) return '–';
  const tage = zeile.tageSeitAblesung ?? 0;
  const zusatz = tage === 0 ? 'heute' : tage === 1 ? 'vor 1 Tag' : `vor ${zahl(tage)} Tagen`;
  return `${datum(zeile.abgelesenAm)} (${zusatz})`;
}

function bilanzText(zeile: BerichtZeile): string {
  if (zeile.sollKm === 0) return 'keine Vorgabe';
  if (zeile.istKm === null) return 'nicht berechenbar';
  const rest = zeile.restKm ?? 0;
  const kern =
    rest === 0
      ? `${zahl(zeile.istKm)} von ${zahl(zeile.sollKm)} km erreicht`
      : `${zahl(zeile.istKm)} von ${zahl(zeile.sollKm)} km, ${zahl(rest)} km offen`;
  return zeile.unvollstaendig ? `${kern} (Startstand unvollständig)` : kern;
}

export function berichtAlsText(bericht: KmBericht): string {
  const kopf = [
    `Kilometerstandsbericht zum ${datum(bericht.stichtag)}`,
    `Bezugsjahr ${bericht.jahr}, ${zahl(bericht.zeilen.length)} Fahrzeuge`,
    `${zahl(bericht.ohneAblesung)} ohne Ablesung, ${zahl(bericht.unterSoll)} unter Jahressoll`,
    '',
  ];
  if (bericht.zeilen.length === 0) {
    return [...kopf, 'Es sind keine Fahrzeuge erfasst.'].join('\n');
  }
  const zeilen = bericht.zeilen.map((zeile) =>
    [
      [zeile.bezeichnung, zeile.funkrufname, zeile.kennzeichen].filter(Boolean).join(' · '),
      `  Stand: ${standText(zeile)}, abgelesen ${ablesungText(zeile)}`,
      `  Jahresbilanz: ${bilanzText(zeile)}`,
    ].join('\n'),
  );
  return [...kopf, ...zeilen].join('\n');
}

function kopfzelle(inhalt: string, ausrichtung = 'left'): string {
  return (
    `<th style="padding:8px 10px;text-align:${ausrichtung};font-size:12px;` +
    `letter-spacing:0.04em;text-transform:uppercase;color:${MAIL_FARBEN.weiss};` +
    `background-color:${MAIL_FARBEN.dunkelblau};">${inhalt}</th>`
  );
}

function zelle(inhalt: string, ausrichtung = 'left', farbe: string = MAIL_FARBEN.text): string {
  return (
    `<td style="padding:8px 10px;text-align:${ausrichtung};font-size:13px;color:${farbe};` +
    `border-bottom:1px solid ${MAIL_FARBEN.hellgrau};">${inhalt}</td>`
  );
}

export function berichtAlsHtml(bericht: KmBericht): string {
  const kopf =
    `<tr>${kopfzelle('Fahrzeug')}${kopfzelle('Eigentümer')}` +
    `${kopfzelle('Letzter Stand', 'right')}${kopfzelle('Abgelesen')}${kopfzelle('Jahresbilanz')}</tr>`;

  const zeilen = bericht.zeilen
    .map((zeile, index) => {
      const hintergrund =
        index % 2 === 1 ? ` background-color:${MAIL_FARBEN.alternierendeZeile};` : '';
      const kennung = [zeile.funkrufname, zeile.kennzeichen].filter(Boolean).join(' · ');
      const name =
        `<strong>${maskiere(zeile.bezeichnung)}</strong>` +
        (kennung
          ? `<br><span style="color:${MAIL_FARBEN.sekundaer};font-size:12px;">${maskiere(kennung)}</span>`
          : '');
      const standFarbe = zeile.letzterStand === null ? MAIL_FARBEN.rot : MAIL_FARBEN.text;
      const bilanzFarbe =
        zeile.sollKm === 0
          ? MAIL_FARBEN.sekundaer
          : zeile.istKm === null || (zeile.restKm ?? 0) > 0
            ? MAIL_FARBEN.rot
            : MAIL_FARBEN.gruen;
      return (
        `<tr style="${hintergrund}">` +
        zelle(name) +
        zelle(maskiere(EIGENTUEMER_LABEL[zeile.eigentuemer] ?? zeile.eigentuemer)) +
        zelle(maskiere(standText(zeile)), 'right', standFarbe) +
        zelle(maskiere(ablesungText(zeile))) +
        zelle(maskiere(bilanzText(zeile)), 'left', bilanzFarbe) +
        '</tr>'
      );
    })
    .join('');

  const tabelle =
    bericht.zeilen.length === 0
      ? `<p style="color:${MAIL_FARBEN.sekundaer};">Es sind keine Fahrzeuge erfasst.</p>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;` +
        `border-collapse:collapse;"><thead>${kopf}</thead><tbody>${zeilen}</tbody></table>`;

  return (
    `<!doctype html><html lang="de"><body style="margin:0;padding:24px;` +
    `font-family:Arial,Helvetica,sans-serif;color:${MAIL_FARBEN.text};` +
    `background-color:${MAIL_FARBEN.weiss};">` +
    `<h1 style="margin:0 0 4px;font-size:20px;color:${MAIL_FARBEN.dunkelblau};">` +
    `Kilometerstandsbericht zum ${datum(bericht.stichtag)}</h1>` +
    `<p style="margin:0 0 20px;font-size:13px;color:${MAIL_FARBEN.sekundaer};">` +
    `Bezugsjahr ${bericht.jahr} · ${zahl(bericht.zeilen.length)} Fahrzeuge · ` +
    `${zahl(bericht.ohneAblesung)} ohne Ablesung · ${zahl(bericht.unterSoll)} unter Jahressoll</p>` +
    tabelle +
    `<p style="margin:20px 0 0;font-size:12px;color:${MAIL_FARBEN.sekundaer};">` +
    'Automatisch erzeugt aus HiorgWache. Der Versand wurde in der Systemkonfiguration ausgelöst.' +
    '</p></body></html>'
  );
}

export function berichtAlsNachricht(
  bericht: KmBericht,
  an: string,
  betreffVorlage: string,
): MailNachricht {
  return {
    an,
    betreff: `${betreffVorlage} – ${datum(bericht.stichtag)}`,
    text: berichtAlsText(bericht),
    html: berichtAlsHtml(bericht),
  };
}

/** Feste Berichtsendpunkte hinter der bereits geprüften Anmeldung. */
export async function verarbeiteKmBericht(
  anfrage: Request,
  umgebung: KmBerichtKonfiguration,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('KM_BERICHT_PFAD_UNGUELTIG', 'Berichtsendpunkt nicht gefunden.', 404);
  }
  const db = umgebung.FAHRZEUGE_DB;
  if (!db) {
    return fehlerAntwort(
      'KM_BERICHT_KONFIGURATION_FEHLT',
      'Das Fahrzeugmodul ist noch nicht eingerichtet.',
      503,
    );
  }

  const vorschau = url.pathname === KM_BERICHT_PFAD;
  if (vorschau && anfrage.method !== 'GET') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'GET' });
  }
  if (!vorschau && anfrage.method !== 'POST') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'POST' });
  }

  let bericht: KmBericht;
  try {
    bericht = await ladeKmBericht(db, berlinerKalendertag(new Date()));
  } catch (ursache) {
    console.error('KM_BERICHT_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort('KM_BERICHT_DB_FEHLER', 'Der Bericht konnte nicht erstellt werden.', 502);
  }

  if (vorschau) {
    return jsonAntwort(bericht);
  }
  return sendeBericht(bericht, umgebung, identitaet);
}

async function sendeBericht(
  bericht: KmBericht,
  umgebung: KmBerichtKonfiguration,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const konfigDb = umgebung.BENUTZER_DB;
  if (!konfigDb) {
    return fehlerAntwort(
      'SYSTEMKONFIGURATION_KONFIGURATION_FEHLT',
      'Die Systemkonfiguration ist noch nicht eingerichtet.',
      503,
    );
  }

  let einstellungen;
  try {
    einstellungen = await leseEinstellungen(konfigDb);
  } catch (ursache) {
    console.error(
      'SYSTEMKONFIGURATION_DB_FEHLER',
      ursache instanceof Error ? ursache.message : ursache,
    );
    return fehlerAntwort(
      'SYSTEMKONFIGURATION_DB_FEHLER',
      'Die Systemkonfiguration konnte nicht gelesen werden.',
      502,
    );
  }

  const empfaenger = einstellungen.kmBerichtEmpfaenger;
  if (!empfaenger) {
    return fehlerAntwort(
      'KM_BERICHT_EMPFAENGER_FEHLT',
      'Es ist keine Empfängeradresse hinterlegt.',
      409,
    );
  }

  try {
    const versand = await waehleVersand(einstellungen.kmBerichtVersandweg, umgebung);
    await versand.sende(berichtAlsNachricht(bericht, empfaenger, einstellungen.kmBerichtBetreff));
  } catch (ursache) {
    if (ursache instanceof VersandFehler) {
      return fehlerAntwort(
        ursache.grund === 'konfiguration-fehlt'
          ? 'MAIL_VERSANDWEG_NICHT_EINGERICHTET'
          : 'MAIL_VERSAND_FEHLGESCHLAGEN',
        ursache.message,
        ursache.grund === 'konfiguration-fehlt' ? 503 : 502,
      );
    }
    throw ursache;
  }

  console.log('KM_BERICHT_GESENDET', bericht.zeilen.length);
  return jsonAntwort({
    gesendetAn: empfaenger,
    gesendetAm: new Date().toISOString(),
    gesendetVon: identitaet.email,
    anzahlFahrzeuge: bericht.zeilen.length,
    versandweg: einstellungen.kmBerichtVersandweg,
  });
}
