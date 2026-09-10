import { fehlerAntwort, jsonAntwort } from './antwort';
import { istUmleitung, redigiere, ursachenText } from './diagnose';
import { istKennung, istObjekt, leseJsonBegrenzt, verwerfeInhalt } from './json-lesen';
import { leseZugangsdatum, type Zugangsdatum } from './zugangsdaten';

/**
 * Öffentlicher HiOrg-Kalenderfeed. Der Abruf braucht keine Header-Zugangsdaten,
 * aber die vollständige Feed-URL **ist** das Geheimnis: die Zugangsdaten stecken
 * als Query-Parameter darin. Sie bleibt deshalb vollständig im Worker.
 *
 * Die Schreibweise `HIORGSERVER_CALENDER_FEED` (mit „CALENDER") ist bewusst so
 * übernommen – das Secret heißt im Secrets Store genau so. Nicht „korrigieren".
 */
export interface HiorgKalenderKonfiguration {
  HIORGSERVER_CALENDER_FEED?: Zugangsdatum;
}

export const HIORG_KALENDER_PFAD = '/api/hiorg/kalender';
export const MAX_HIORG_KALENDER_ANTWORT_BYTES = 1024 * 1024;
export const HIORG_KALENDER_ZEITLIMIT_MS = 15_000;

/** Fester Fremddienst: ein vertauschtes Secret darf kein beliebiges Ziel freischalten. */
const ERLAUBTER_HOST = 'hiorg-server.de';

/** Zeichen, die in einer Konfigurations- oder Ereignis-URL nichts zu suchen haben. */
const UNZULAESSIGE_ZEICHEN = /[\u0000-\u0020\u007f\\]/;

interface Eintrag {
  id: string | number;
  sortdate: number;
  enddate?: number;
  verbez: string;
  typ: 'termin' | 'dienst';
  url?: string;
}

/** Ein reiner Leseendpunkt ohne Anfragedaten; Ziel und Zugangsdaten bestimmt der Worker. */
export async function verarbeiteHiorgKalender(
  anfrage: Request,
  umgebung: HiorgKalenderKonfiguration,
): Promise<Response> {
  const url = new URL(anfrage.url);
  if (url.pathname !== HIORG_KALENDER_PFAD) {
    return fehlerAntwort('API_NICHT_GEFUNDEN', 'API-Endpunkt nicht gefunden.', 404);
  }
  if (anfrage.method !== 'GET') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'GET' });
  }
  if (url.search !== '' || anfrage.url.includes('?')) {
    return fehlerAntwort('HIORG_KALENDER_ANFRAGE_UNGUELTIG', 'Keine URL-Parameter erlaubt.', 400);
  }

  const ziel = pruefeFeedZiel(await leseZugangsdatum(umgebung.HIORGSERVER_CALENDER_FEED));
  if (!ziel) {
    return fehlerAntwort(
      'HIORG_KALENDER_KONFIGURATION_FEHLT',
      'Der HiOrg-Kalenderfeed ist noch nicht eingerichtet.',
      503,
    );
  }
  // Geheim sind die vollständige URL und ihre Parameterwerte – nicht der Hostname:
  // der steht in jedem legitimen Ereignis-Link und darf nicht wegredigiert werden.
  const geheimnisse = [ziel, ...queryWerte(ziel)];

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), HIORG_KALENDER_ZEITLIMIT_MS);
  try {
    let antwort: Response;
    try {
      antwort = await fetch(ziel, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        // 'manual' folgt keiner Weiterleitung, macht sie aber als eigenen Status sichtbar.
        redirect: 'manual',
        signal: abbruch.signal,
      });
    } catch (fehler) {
      if (abbruch.signal.aborted) {
        return fehlerAntwort('HIORG_KALENDER_ZEITLIMIT', 'HiOrg antwortet nicht rechtzeitig.', 504);
      }
      // Nur ins Worker-Log des Betreibers, redigiert: die Antwort bleibt der feste Code.
      console.error(
        'HIORG_KALENDER_NICHT_ERREICHBAR',
        redigiere(ursachenText(fehler), geheimnisse),
      );
      return fehlerAntwort(
        'HIORG_KALENDER_NICHT_ERREICHBAR',
        'Der HiOrg-Kalender ist derzeit nicht erreichbar.',
        502,
      );
    }

    if (istUmleitung(antwort)) {
      // Weiterleitung bewusst nicht folgen: Ziel, Inhalt und Header bleiben unveröffentlicht.
      await verwerfeInhalt(antwort);
      return fehlerAntwort(
        'HIORG_KALENDER_UMLEITUNG',
        'HiOrg beantwortet die konfigurierte Feed-Adresse mit einer Weiterleitung.',
        502,
      );
    }
    if (!antwort.ok) {
      await verwerfeInhalt(antwort);
      return fehlerAntwort(
        'HIORG_KALENDER_ABRUF_FEHLGESCHLAGEN',
        'HiOrg hat den Kalenderabruf abgelehnt.',
        502,
      );
    }

    const ergebnis = await leseJsonBegrenzt(
      antwort,
      MAX_HIORG_KALENDER_ANTWORT_BYTES,
      abbruch.signal,
    );
    if (abbruch.signal.aborted) {
      return fehlerAntwort('HIORG_KALENDER_ZEITLIMIT', 'HiOrg antwortet nicht rechtzeitig.', 504);
    }
    if (!ergebnis.erfolg) {
      return ergebnis.ursache === 'zu-gross'
        ? fehlerAntwort(
            'HIORG_KALENDER_ANTWORT_ZU_GROSS',
            'Die HiOrg-Kalenderantwort ist zu groß.',
            502,
          )
        : antwortUngueltig('JSON-Antwort nicht lesbar oder kein Body', geheimnisse);
    }

    const huelle = filtereEintraege(ergebnis.inhalt);
    if (!('eintraege' in huelle)) {
      return antwortUngueltig(huelle.grund, geheimnisse);
    }
    // Auch ein fremder Server darf die geheime Feed-URL nicht in einem Feld spiegeln.
    const spiegelGrund = gespiegeltesGeheimnis(huelle.eintraege, geheimnisse);
    if (spiegelGrund) {
      return antwortUngueltig(spiegelGrund, geheimnisse);
    }
    return jsonAntwort({ status: 'OK', eintraege: huelle.eintraege });
  } finally {
    clearTimeout(zeitlimit);
  }
}

/**
 * Der Grund landet nur redigiert im Betreiberlog (`console.error`), nie in der
 * Browserantwort – die bleibt beim festen Code ohne Upstream-Details.
 */
function antwortUngueltig(grund: string, geheimnisse: (string | undefined)[]): Response {
  console.error('HIORG_KALENDER_ANTWORT_UNGUELTIG', redigiere(grund, geheimnisse));
  return fehlerAntwort(
    'HIORG_KALENDER_ANTWORT_UNGUELTIG',
    'HiOrg hat keine gültigen Kalenderdaten geliefert.',
    502,
  );
}

/**
 * Wie `pruefeZiel()` in `efs.ts`, mit einem bewussten Unterschied: der
 * Query-String ist hier **erlaubt**, weil genau dort die Zugangsdaten stehen.
 * Dafür ist der Host fest an HiOrg gebunden.
 */
export function pruefeFeedZiel(wert: string | undefined): string | undefined {
  if (!wert || UNZULAESSIGE_ZEICHEN.test(wert)) return undefined;
  try {
    const url = new URL(wert);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash ||
      !istHiorgHost(url.hostname)
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function istHiorgHost(wirt: string): boolean {
  const klein = wirt.toLowerCase();
  return klein === ERLAUBTER_HOST || klein.endsWith(`.${ERLAUBTER_HOST}`);
}

function queryWerte(ziel: string): string[] {
  try {
    return [...new URL(ziel).searchParams.values()].filter((wert) => wert.trim() !== '');
  } catch {
    return [];
  }
}

type HuelleErgebnis = { eintraege: Eintrag[] } | { grund: string };

function filtereEintraege(inhalt: unknown): HuelleErgebnis {
  if (!istObjekt(inhalt)) {
    return { grund: 'Antwort ist kein JSON-Objekt' };
  }
  // `status` liefert der Feed als String ("200"); `success` ist das belastbare Signal.
  if (inhalt['success'] !== true) {
    return { grund: `success ist ${typeof inhalt['success']} statt true` };
  }
  if (!Array.isArray(inhalt['data'])) {
    return { grund: 'data ist kein Array' };
  }
  const daten = inhalt['data'];
  const eintraege: Eintrag[] = [];
  for (const roh of daten) {
    const eintrag = filtereEintrag(roh);
    if (eintrag) eintraege.push(eintrag);
  }
  // Ein einzelner kaputter Datensatz darf den Jahresplan nicht blind machen –
  // gar kein brauchbarer Eintrag bei nicht leerem Feed dagegen schon.
  if (daten.length > 0 && eintraege.length === 0) {
    return { grund: `kein Eintrag der ${daten.length} Datensätze war brauchbar` };
  }
  return { eintraege };
}

/**
 * Allow-List je Eintrag. Bewusst **nicht** weitergereicht: `ansprech` und
 * `bemerkung` (Klarnamen und Freitext, teils mit Zugangslinks), `verort`,
 * `treff`, `kursnr`, `max_meldungen` und die `personal_*`-Felder
 * (Einsatzdisposition). Für Namensabgleich und Link werden sie nicht gebraucht;
 * was nicht durchgereicht wird, landet auch nicht in Screenshots oder Logs.
 */
function filtereEintrag(roh: unknown): Eintrag | undefined {
  if (!istObjekt(roh)) return undefined;

  const sortdate = roh['sortdate'];
  if (typeof sortdate !== 'number' || !Number.isFinite(sortdate) || sortdate <= 0) {
    return undefined;
  }
  const verbez = roh['verbez'];
  if (typeof verbez !== 'string' || verbez.trim() === '') return undefined;
  const typ = roh['typ'];
  if (typ !== 'termin' && typ !== 'dienst') return undefined;
  const id = roh['id'];
  if (!istKennung(id)) return undefined;

  const eintrag: Eintrag = { id, sortdate, verbez, typ };

  // Bei eintägigen Terminen liefert der Feed "" statt eines Endzeitpunkts.
  const enddate = roh['enddate'];
  if (typeof enddate === 'number' && Number.isFinite(enddate) && enddate >= sortdate) {
    eintrag.enddate = enddate;
  }

  const rohUrl = roh['url'];
  const url = typeof rohUrl === 'string' ? bereinigeEreignisUrl(rohUrl) : undefined;
  if (url) eintrag.url = url;

  return eintrag;
}

const ENTITAETEN = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&apos;', "'"],
]);

/**
 * Der Feed liefert Ereignis-URLs HTML-escaped (`&amp;` als Parametertrenner).
 * Die Dekodierung liegt hier, weil die Prüfung ohnehin auf der dekodierten URL
 * laufen muss; der Client bekommt dadurch genau eine, bereits saubere Fassung.
 * Ein Link mit fremdem Ziel entfällt – der Eintrag selbst bleibt erhalten.
 */
export function bereinigeEreignisUrl(roh: string): string | undefined {
  const dekodiert = roh.replace(
    /&(?:amp|lt|gt|quot|apos|#39);/g,
    (treffer) => ENTITAETEN.get(treffer) ?? treffer,
  );
  if (UNZULAESSIGE_ZEICHEN.test(dekodiert)) return undefined;
  try {
    const url = new URL(dekodiert);
    if (url.protocol !== 'https:' || url.username || url.password || !istHiorgHost(url.hostname)) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function varianten(geheim: string): string[] {
  return [
    geheim,
    JSON.stringify(geheim).slice(1, -1),
    encodeURIComponent(geheim),
    new URLSearchParams({ wert: geheim }).toString().slice('wert='.length),
  ];
}

/**
 * Prüft ausschließlich die von HiOrg gelieferten Freitextfelder (`verbez`,
 * `url`, ein textuelles `id`) – nicht die von uns selbst erzeugte JSON-Hülle
 * (feste Schlüssel wie `status`, `id`, `url`, feste Werte wie `OK`, `typ`).
 * Eine frühere Fassung prüfte die gesamte serialisierte Antwort und schlug
 * deshalb auch dann an, wenn ein kurzer Query-Wert zufällig mit einem dieser
 * eigenen JSON-Bausteine übereinstimmte – unabhängig vom tatsächlichen
 * Feed-Inhalt. `sortdate`/`enddate` (geprüft numerisch) und `typ` (feste
 * Aufzählung) können kein beliebiges Zugangsdatum tragen und bleiben daher
 * außen vor.
 */
function gespiegeltesGeheimnis(eintraege: Eintrag[], geheimnisse: string[]): string | undefined {
  for (const [eintragIndex, eintrag] of eintraege.entries()) {
    const felder: [string, unknown][] = [
      ['verbez', eintrag.verbez],
      ['url', eintrag.url],
      ['id', eintrag.id],
    ];
    for (const [feld, wert] of felder) {
      if (typeof wert !== 'string') continue;
      const quelle = benenneGeheimnisquelle(wert, geheimnisse);
      if (quelle) {
        return `${quelle} im Feld '${feld}' von Eintrag ${eintragIndex + 1} gespiegelt`;
      }
    }
  }
  return undefined;
}

function benenneGeheimnisquelle(text: string, geheimnisse: string[]): string | undefined {
  for (const [index, geheim] of geheimnisse.entries()) {
    if (!geheim || !varianten(geheim).some((v) => v !== '' && text.includes(v))) continue;
    return index === 0 ? 'vollständige Feed-URL' : `Query-Wert Nr. ${index}`;
  }
  return undefined;
}
