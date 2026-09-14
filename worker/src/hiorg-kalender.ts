import { fehlerAntwort, jsonAntwort } from './antwort';
import { istUmleitung, redigiere, ursachenText } from './diagnose';
import { istKennung, istObjekt, leseJsonBegrenzt, verwerfeInhalt } from './json-lesen';
import { leseZugangsdatum, type Zugangsdatum } from './zugangsdaten';

/**
 * Öffentlicher HiOrg-Kalenderfeed. Der Abruf braucht keine Header-Zugangsdaten;
 * das Geheimnis steckt in der Kalenderfreigabe selbst.
 *
 * `HIORGSERVER_CALENDER_FEED` darf beide Formen haben, und der Worker erkennt
 * sie an der Gestalt des Wertes:
 *
 * - **Vollständige Freigabe-URL** (führend, weil von HiOrg genau so ausgegeben
 *   und nachweislich als JSON beantwortet): der Worker ruft genau diese URL ab
 *   und ersetzt darin ausschließlich `monate` je Anfrage. Host und Schema sind
 *   dabei fest an HiOrg und HTTPS gebunden; ein vertauschtes Secret kann den
 *   Worker nicht zu einem fremden Ziel schicken.
 * - **Reiner `lab`-Tokenwert**: der Worker baut die URL aus `FEED_URL_BASIS`
 *   und `FESTE_FEED_PARAMETER` – dasselbe Muster wie `apikey`/`version`/
 *   `action` beim EFS-Ziel (`efs.ts`). Diese Parameterliste ist allerdings nur
 *   aus einer einzelnen Freigabe abgeleitet und nicht durch die HiOrg-
 *   Dokumentation belegt; weicht eine Einrichtung davon ab, antwortet HiOrg mit
 *   einer HTML-Seite statt mit JSON (`HIORG_KALENDER_ANTWORT_UNGUELTIG`). Für
 *   diesen Fall bleibt die vollständige URL der verlässliche Weg.
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

/** Fester Fremddienst: der Worker leitet das Ziel nie von Konfiguration ab. */
const ERLAUBTER_HOST = 'hiorg-server.de';

/** Fester Endpunkt; nur `lab` und `monate` unterscheiden sich je Einrichtung/Anfrage. */
const FEED_URL_BASIS = 'https://www.hiorg-server.de/termine.php';

/**
 * Feste, nicht geheime Anfrageparameter. `ov=biel` ist bereits Pflichtparameter
 * der öffentlichen Ereignis-Detaillinks (`hiorg-kalender.model.ts`) und damit
 * ohnehin kein Geheimnis.
 */
const FESTE_FEED_PARAMETER: Readonly<Record<string, string>> = {
  ov: 'biel',
  termin: '1',
  dienst: '1',
  auchint: '1',
  zr_dienst: '1',
  json: '1',
};

/**
 * Derselbe Feed liefert bei einem manuellen Browser-Aufruf gültiges JSON, beim
 * Worker-Abruf ohne `User-Agent` dagegen wiederholt eine HTML-Antwort (Status
 * 200) statt JSON – beobachtet über `HIORG_KALENDER_ANTWORT_UNGUELTIG`. Ein
 * browsertypischer `User-Agent` ist der naheliegendste Unterschied zwischen
 * beiden Anfragen.
 */
const FEED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** Zeichen, die in einem Konfigurations- oder Ereignis-Freitext nichts zu suchen haben. */
const UNZULAESSIGE_ZEICHEN = /[\u0000-\u0020\u007f\\]/;

/** Ein Wert mit Schema (`https:`) ist als vollständige URL gemeint, nicht als Token. */
const SCHEMA_MUSTER = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Mindestlänge, ab der ein Query-Wert der Freigabe-URL als Zugangsdatum gilt.
 * Die kurzen Schaltwerte (`1`) und die Ortskennung (`biel`) stehen ohnehin
 * unverschlüsselt in den öffentlichen Ereignis-Detaillinks
 * (`hiorg-kalender.model.ts`). Als „Geheimnis" behandelt würden sie jeden
 * Termin verwerfen, dessen Bezeichnung zufällig eine `1` enthält – dieselbe
 * Klasse Falsch-Positiv, die schon die frühere Prüfung der gesamten
 * Antworthülle ausgelöst hat.
 */
const MIN_GEHEIM_LAENGE = 8;

/** Angeschauter Monat als `JJJJ-MM`, wie ihn das Frontend führt (`monatIndex()+1`). */
const MONAT_MUSTER = /^\d{4}-(0[1-9]|1[0-2])$/;

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
  const monatParam = leseAngeschauterMonat(url);
  if (monatParam === 'ungueltig') {
    return fehlerAntwort(
      'HIORG_KALENDER_ANFRAGE_UNGUELTIG',
      'Der Parameter "monat" muss im Format JJJJ-MM angegeben werden; andere Parameter sind nicht erlaubt.',
      400,
    );
  }

  const zugang = pruefeFeedZugang(await leseZugangsdatum(umgebung.HIORGSERVER_CALENDER_FEED));
  if (!zugang) {
    return fehlerAntwort(
      'HIORG_KALENDER_KONFIGURATION_FEHLT',
      'Der HiOrg-Kalenderfeed ist noch nicht eingerichtet.',
      503,
    );
  }
  // Geheim sind der lab-Tokenwert beziehungsweise die vollständige Freigabe-URL
  // samt ihrer hinreichend langen Query-Werte – nicht Host, Pfad und die festen
  // Schaltparameter.
  const geheimnisse = zugang.geheimnisse;

  // Die HiOrg-API kann pro Abruf nur in eine Richtung schauen ("monate" positiv
  // vorwärts, negativ zurück). Der Worker setzt "monate" deshalb je Anfrage so,
  // dass der vom Client angeschaute Monat (ohne Angabe: der laufende Monat)
  // sicher im Fenster liegt – vorwärts für Gegenwart/Zukunft, zurück für die
  // Vergangenheit.
  const abrufZiel = baueZielUrl(zugang, monatParam ?? heutigerMonat());

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), HIORG_KALENDER_ZEITLIMIT_MS);
  try {
    let antwort: Response;
    try {
      antwort = await fetch(abrufZiel, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': FEED_USER_AGENT },
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
        : antwortUngueltig(
            `JSON-Antwort nicht lesbar oder kein Body (Status ${antwort.status}, ` +
              `Content-Type ${antwort.headers.get('content-type') ?? 'fehlt'}, ` +
              `Content-Length ${antwort.headers.get('content-length') ?? 'fehlt'}, ` +
              `Feed-Zugang ${benenneZugang(zugang)})` +
              (istHtml(antwort)
                ? ' – HiOrg liefert eine HTML-Seite statt JSON: Freigabe-Adresse und ' +
                  'Parameter der Einrichtung prüfen (vollständige Freigabe-URL ins Secret)'
                : ''),
          );
    }

    const huelle = filtereEintraege(ergebnis.inhalt, geheimnisse);
    if (!('eintraege' in huelle)) {
      return antwortUngueltig(huelle.grund);
    }
    return jsonAntwort({ status: 'OK', eintraege: huelle.eintraege });
  } finally {
    clearTimeout(zeitlimit);
  }
}

/**
 * Der Grund landet nur im Betreiberlog (`console.error`), nie in der
 * Browserantwort – die bleibt beim festen Code ohne Upstream-Details. `grund`
 * besteht ausschließlich aus fester eigener Vokabular und Zählwerten, nie aus
 * rohem Upstream-Text: eine Redigierung ist hier nicht nötig und würde
 * zufällig passende Ziffern (z. B. in Zähl- oder Indexangaben) unlesbar machen.
 */
function antwortUngueltig(grund: string): Response {
  console.error('HIORG_KALENDER_ANTWORT_UNGUELTIG', grund);
  return fehlerAntwort(
    'HIORG_KALENDER_ANTWORT_UNGUELTIG',
    'HiOrg hat keine gültigen Kalenderdaten geliefert.',
    502,
  );
}

interface AngeschauterMonat {
  jahr: number;
  monat: number; // 1..12
}

/**
 * Einziger erlaubter Anfrageparameter: der im Frontend gerade angeschaute
 * Monat. `undefined` heißt „kein Parameter gesendet" (Rückfall auf den
 * laufenden Monat), `'ungueltig'` heißt „falscher Name oder falsches Format"
 * – beides führt getrennt behandelt zu unterschiedlichen Antworten.
 */
function leseAngeschauterMonat(url: URL): AngeschauterMonat | undefined | 'ungueltig' {
  const schluessel = [...url.searchParams.keys()];
  if (schluessel.length === 0) return undefined;
  if (schluessel.length > 1 || schluessel[0] !== 'monat') return 'ungueltig';
  const wert = url.searchParams.get('monat') ?? '';
  if (!MONAT_MUSTER.test(wert)) return 'ungueltig';
  const [jahrText, monatText] = wert.split('-');
  return { jahr: Number(jahrText), monat: Number(monatText) };
}

/** Heutiges Jahr/Monat in Europe/Berlin – nie über eine reine UTC-Rechnung. */
function heutigerMonat(): AngeschauterMonat {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const jahr = Number(teile.find((teil) => teil.type === 'year')?.value);
  const monat = Number(teile.find((teil) => teil.type === 'month')?.value);
  return { jahr, monat };
}

/**
 * "monate" so gewählt, dass der angeschaute Monat sicher im abgerufenen
 * Fenster liegt: vorwärts (positiv) für die Gegenwart und Zukunft, zurück
 * (negativ) für die Vergangenheit. Die `+1`/`-1`-Polsterung fängt ab, dass
 * „monate" laut HiOrg-Dokumentation ab dem heutigen Tag zählt, nicht ab
 * Monatsanfang.
 */
function monateFuer(angeschauterMonat: AngeschauterMonat): number {
  const heute = heutigerMonat();
  const differenz =
    (angeschauterMonat.jahr - heute.jahr) * 12 + (angeschauterMonat.monat - heute.monat);
  return differenz >= 0 ? differenz + 1 : differenz - 1;
}

/**
 * Baut die Feed-Anfrage-URL. Bei einer konfigurierten Freigabe-URL bleibt diese
 * unverändert bis auf `monate`; der Rest der Adresse stammt dann von HiOrg
 * selbst und wird nicht durch eine eigene Parameterliste ersetzt. Bei einem
 * reinen `lab`-Tokenwert setzt der Worker Host, Pfad und die festen Parameter
 * selbst ein.
 */
function baueZielUrl(zugang: FeedZugang, angeschauterMonat: AngeschauterMonat): string {
  const url = zugang.art === 'url' ? new URL(zugang.ziel) : baueFesteFeedUrl(zugang.token);
  url.searchParams.set('monate', String(monateFuer(angeschauterMonat)));
  return url.href;
}

function baueFesteFeedUrl(labToken: string): URL {
  const url = new URL(FEED_URL_BASIS);
  for (const [schluessel, wert] of Object.entries(FESTE_FEED_PARAMETER)) {
    url.searchParams.set(schluessel, wert);
  }
  url.searchParams.set('lab', labToken);
  return url;
}

/**
 * Der konfigurierte Feed-Zugang in der Form, die das Secret tatsächlich hat.
 * `geheimnisse` benennt, was davon in Antworten und Logs nie auftauchen darf.
 */
export type FeedZugang =
  | { art: 'url'; ziel: string; geheimnisse: string[] }
  | { art: 'lab'; token: string; geheimnisse: string[] };

/**
 * Erkennt an der Gestalt des Secrets, welche der beiden zulässigen Formen
 * vorliegt: ein Wert mit Schema ist als vollständige Freigabe-URL gemeint und
 * wird wie zuvor an HTTPS und `hiorg-server.de` gebunden; jeder andere Wert
 * gilt als reiner `lab`-Tokenwert. Ein leerer Wert, ein Steuerzeichen, ein
 * Backslash oder eine URL mit fremdem Ziel sperrt den Zugriff.
 */
export function pruefeFeedZugang(wert: string | undefined): FeedZugang | undefined {
  if (!wert || UNZULAESSIGE_ZEICHEN.test(wert)) return undefined;
  if (!SCHEMA_MUSTER.test(wert)) return { art: 'lab', token: wert, geheimnisse: [wert] };
  let url: URL;
  try {
    url = new URL(wert);
  } catch {
    return undefined;
  }
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
  return { art: 'url', ziel: url.href, geheimnisse: [url.href, ...geheimeQueryWerte(url)] };
}

/** Siehe `MIN_GEHEIM_LAENGE`: kurze Schaltwerte sind keine Zugangsdaten. */
function geheimeQueryWerte(url: URL): string[] {
  return [...url.searchParams.values()].filter((wert) => wert.trim().length >= MIN_GEHEIM_LAENGE);
}

/** Für das Betreiberlog: benennt die Gestalt des Secrets, nie seinen Wert. */
function benenneZugang(zugang: FeedZugang): string {
  return zugang.art === 'url' ? 'vollständige Freigabe-URL' : 'lab-Tokenwert';
}

function istHtml(antwort: Response): boolean {
  return (antwort.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
}

function istHiorgHost(wirt: string): boolean {
  const klein = wirt.toLowerCase();
  return klein === ERLAUBTER_HOST || klein.endsWith(`.${ERLAUBTER_HOST}`);
}

type HuelleErgebnis = { eintraege: Eintrag[] } | { grund: string };

function filtereEintraege(inhalt: unknown, geheimnisse: string[]): HuelleErgebnis {
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
    const eintrag = filtereEintrag(roh, geheimnisse);
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
 *
 * `verbez` und ein textuelles `id` können nicht bereinigt werden, ohne den
 * Eintrag sinnentleert zu machen – enthalten sie ein konfiguriertes
 * Zugangsdatum, entfällt deshalb der ganze Datensatz (wie bei jedem anderen
 * kaputten Feld). Ein `url`-Link dagegen entfällt für sich allein, der
 * restliche Eintrag bleibt erhalten – wie beim bereits bestehenden Wegfall
 * eines Links mit fremdem Ziel.
 */
function filtereEintrag(roh: unknown, geheimnisse: string[]): Eintrag | undefined {
  if (!istObjekt(roh)) return undefined;

  const sortdate = roh['sortdate'];
  if (typeof sortdate !== 'number' || !Number.isFinite(sortdate) || sortdate <= 0) {
    return undefined;
  }
  const verbez = roh['verbez'];
  if (typeof verbez !== 'string' || verbez.trim() === '') return undefined;
  if (enthaeltGeheimnis(verbez, geheimnisse)) return undefined;
  const typ = roh['typ'];
  if (typ !== 'termin' && typ !== 'dienst') return undefined;
  const id = roh['id'];
  if (!istKennung(id)) return undefined;
  if (typeof id === 'string' && enthaeltGeheimnis(id, geheimnisse)) return undefined;

  const eintrag: Eintrag = { id, sortdate, verbez, typ };

  // Bei eintägigen Terminen liefert der Feed "" statt eines Endzeitpunkts.
  const enddate = roh['enddate'];
  if (typeof enddate === 'number' && Number.isFinite(enddate) && enddate >= sortdate) {
    eintrag.enddate = enddate;
  }

  const rohUrl = roh['url'];
  const url = typeof rohUrl === 'string' ? bereinigeEreignisUrl(rohUrl) : undefined;
  // Auch ein fremder Server darf die geheime Feed-URL nicht in einem Feld spiegeln.
  if (url && !enthaeltGeheimnis(url, geheimnisse)) eintrag.url = url;

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
 * Prüft ein einzelnes, von HiOrg geliefertes Freitextfeld auf ein
 * konfiguriertes Zugangsdatum (volle Feed-URL oder einer ihrer Query-Werte).
 * Bewusst pro Feld statt über die gesamte serialisierte Antwort: eine frühere
 * Fassung prüfte `JSON.stringify()` der kompletten eigenen Antworthülle und
 * schlug deshalb auch dann an, wenn ein kurzer Query-Wert zufällig mit einem
 * eigenen JSON-Baustein übereinstimmte (`"id"`, `"url"`, `"typ"`, `"OK"` …) –
 * unabhängig vom tatsächlichen Feed-Inhalt.
 */
function enthaeltGeheimnis(text: string, geheimnisse: string[]): boolean {
  return geheimnisse.some(
    (geheim) => geheim !== '' && varianten(geheim).some((v) => v !== '' && text.includes(v)),
  );
}
