import { fehlerAntwort, jsonAntwort } from './antwort';
import { ERFASSUNG_TOKEN_MUSTER, gleichInKonstanterZeit } from './erfassung-token';
import { istObjekt, leseJsonBegrenzt } from './json-lesen';
import { berlinerKalendertag } from './kalender';
import { verarbeiteOeffentlichenCheck } from './oeffentlicher-check';

/**
 * Öffentliche Kilometermeldung – der einzige Teil des Workers, der ohne
 * Cloudflare-Access-Sitzung erreichbar ist.
 *
 * Das ist eine bewusste, fachlich beauftragte Abweichung von "Anmeldung vor
 * allen Assets und APIs" (siehe CLAUDE.md und docs/konzept-fahrzeuge.md,
 * Abschnitt 10). Sie ist eng gefasst:
 *
 * - Drei feste Pfadmuster, kein Präfixabgleich – der Bypass kann nicht über
 *   Pfadvarianten wachsen.
 * - Jede Fachanfrage braucht ein unerratbares Token je Fahrzeug.
 * - Die Seite liefert nur Bezeichnung, Funkrufname und Kennzeichen; keinen
 *   Kilometerstand, keine UUID, keine E-Mail-Adresse, keinen Verlauf.
 * - Eine Meldung wird nie von selbst ein Kilometerstand. Sie landet in
 *   `ablesung_einreichungen` und wird erst durch die Freigabe einer geprüften
 *   Identität zur Ablesung (siehe `einreichungen.ts`).
 *
 * Weder Access noch die Ursprungsprüfung aus `index.ts` sind hier vorgelaufen;
 * beide Schutzwirkungen muss dieses Modul selbst erbringen.
 */
export interface OeffentlicheErfassungKonfiguration {
  FAHRZEUGE_DB?: D1Database;
  ASSETS?: Fetcher;
}

const SEITEN_PFAD = /^\/e\/([0-9a-f]{32})$/;
const API_PFAD = /^\/api\/oeffentlich\/meldung\/([0-9a-f]{32})$/;
const DATEI_PFAD = /^\/oeffentlich\/([A-Za-z0-9._-]+)$/;
// Der Fahrzeugcheck (AP-M6) nutzt dieselbe Mechanik mit eigenen Mustern und
// eigenem Token je Behälter; die Fachlogik liegt in `oeffentlicher-check.ts`.
const CHECK_SEITEN_PFAD = /^\/c\/([0-9a-f]{32})$/;
const CHECK_API_PFAD = /^\/api\/oeffentlich\/check\/([0-9a-f]{32})$/;

/**
 * Feste Erlaubnisliste statt eines Präfixabgleichs. Das zweite Build-Ziel läuft
 * mit `outputHashing: none` (siehe `angular.json`), die Dateinamen stehen also
 * fest. Ohne diese Liste würde ein Fehlgriff wegen
 * `not_found_handling = "single-page-application"` die `index.html` der
 * geschützten Hauptanwendung ausliefern.
 *
 * `npm run test:spa` prüft die Liste gegen das tatsächliche Build-Ergebnis.
 */
export const OEFFENTLICHE_DATEIEN: Readonly<Record<string, string>> = {
  'index.html': 'text/html; charset=utf-8',
  'main.js': 'text/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
};

const KOERPER_GRENZE = 2 * 1024;
const NAME_MIN = 2;
const NAME_MAX = 60;
const BEMERKUNG_MAX = 200;
const STAND_MAX = 9_999_999;

/**
 * Obergrenzen als Missbrauchsbremse, ohne zusätzlichen Speicher: beides sind
 * einfache Abfragen auf `ablesung_einreichungen`.
 *
 * Bewusst fahrzeugbezogen und nicht IP-bezogen. Eine IP-Speicherung wäre eine
 * neue personenbezogene Verarbeitung ohne fachlichen Auftrag und widerspräche
 * der Datenschutzlinie des Fahrzeugkonzepts.
 */
const MAX_OFFENE_JE_FAHRZEUG = 5;
const WIEDERHOLFENSTER_MS = 60_000;

/** Header jeder öffentlichen Antwort. */
export const SCHUTZ_HEADER: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

/**
 * Strikt, weil sie es sein kann: das Build-Ziel bindet Stil und Skript als
 * eigene Dateien ein (`inlineCritical: false` in `angular.json`), es gibt also
 * weder ein inline `<style>` noch ein Ereignisattribut im HTML.
 *
 * `base-uri 'self'` statt `'none'`: die Seite wird unter `/e/<token>`
 * ausgeliefert, ihre Dateien liegen aber unter `/oeffentlich/`. Dafür trägt das
 * HTML ein `<base href="/oeffentlich/">`, und `'none'` verbietet genau das –
 * Stil und Skript würden dann gegen `/e/` aufgelöst und die Seite bliebe leer.
 * `'self'` erlaubt nur eine Basis derselben Origin und wehrt damit weiterhin
 * das ab, wogegen die Direktive gedacht ist: eine untergeschobene Basis auf
 * einer fremden Origin. `npm run test:spa` hält beide Seiten zusammen.
 */
const SEITEN_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; " +
  "img-src 'self' data:; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

/**
 * **Die vollständige Aufzählung dessen, was ohne Cloudflare Access erreichbar
 * ist.** Jedes Muster ist exakt verankert; es gibt bewusst keinen
 * Präfixabgleich, damit der Bypass nicht über Pfadvarianten wachsen kann.
 *
 * Wer hier ein Muster ergänzt, muss den Anzahltest in
 * `worker/tests/oeffentliche-erfassung.spec.ts` anfassen – und damit auch die
 * Beschreibung der Access-Bypass-Anwendung in `docs/einrichtung.md` und den
 * Absatz in CLAUDE.md.
 */
export const OEFFENTLICHE_MUSTER: readonly RegExp[] = [
  SEITEN_PFAD,
  API_PFAD,
  DATEI_PFAD,
  CHECK_SEITEN_PFAD,
  CHECK_API_PFAD,
];

export function istOeffentlicherPfad(pfad: string): boolean {
  return OEFFENTLICHE_MUSTER.some((muster) => muster.test(pfad));
}

/**
 * Eine einzige Antwort für unbekanntes Token, formal ungültiges Token und
 * gelöschtes Fahrzeug: gleicher Status, gleicher Text, gleicher Code. Damit
 * verrät der Endpunkt nicht, ob ein geratenes Token existiert.
 */
function unbekannt(): Response {
  return fehlerAntwort(
    'MELDUNG_UNBEKANNT',
    'Dieser QR-Code gehört zu keinem Fahrzeug.',
    404,
    SCHUTZ_HEADER,
  );
}

function nichtEingerichtet(): Response {
  return fehlerAntwort(
    'MELDUNG_KONFIGURATION_FEHLT',
    'Die Kilometermeldung ist noch nicht eingerichtet.',
    503,
    SCHUTZ_HEADER,
  );
}

export async function verarbeiteOeffentlicheErfassung(
  anfrage: Request,
  umgebung: OeffentlicheErfassungKonfiguration,
  url: URL,
): Promise<Response> {
  const datei = DATEI_PFAD.exec(url.pathname)?.[1];
  if (datei !== undefined) {
    return liefereDatei(anfrage, umgebung, url, datei);
  }

  // Der Fahrzeugcheck teilt sich Seitenauslieferung, Schutzheader und
  // Ursprungsprüfung mit der Kilometermeldung, hält seine Fachlogik aber in
  // einem eigenen Modul – sonst würde diese Datei zum Sammelbecken.
  if (CHECK_SEITEN_PFAD.test(url.pathname)) {
    return liefereDatei(anfrage, umgebung, url, 'index.html', SEITEN_CSP);
  }
  const checkToken = CHECK_API_PFAD.exec(url.pathname)?.[1];
  if (checkToken !== undefined) {
    return verarbeiteOeffentlichenCheck(anfrage, umgebung, url, checkToken);
  }

  if (SEITEN_PFAD.test(url.pathname)) {
    // Über gültig/ungültig entscheidet erst der Datenendpunkt; die Seite wird
    // für jede formal gültige Form ausgeliefert und zeigt dann "Dieser Code
    // funktioniert nicht". Das hält beide Pfade einfach und schafft kein Orakel.
    return liefereDatei(anfrage, umgebung, url, 'index.html', SEITEN_CSP);
  }

  const token = API_PFAD.exec(url.pathname)?.[1];
  if (token === undefined) return unbekannt();

  // Methode und Ursprung zuerst, noch vor der Konfigurationsprüfung: ein
  // Aufruf von fremder Origin soll nicht einmal erfahren, ob das Modul
  // eingerichtet ist.
  const schreibend = anfrage.method === 'POST';
  if (!schreibend && anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
      ...SCHUTZ_HEADER,
      Allow: 'GET, HEAD, POST',
    });
  }
  if (schreibend) {
    const ursprung = pruefeUrsprung(anfrage, url);
    if (ursprung) return ursprung;
  }

  const db = umgebung.FAHRZEUGE_DB;
  if (!db) return nichtEingerichtet();

  try {
    return schreibend ? await nimmMeldungAn(anfrage, db, token) : await leseFahrzeug(db, token);
  } catch (ursache) {
    console.error('MELDUNG_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'MELDUNG_DB_FEHLER',
      'Die Meldung konnte nicht verarbeitet werden.',
      502,
      SCHUTZ_HEADER,
    );
  }
}

/**
 * Liefert eine Datei des zweiten Build-Ziels. Zwei Riegel gegen die
 * SPA-Rückfallebene der Hauptanwendung: die feste Erlaubnisliste oben und ein
 * Abgleich des gelieferten Inhaltstyps – kommt auf eine Anfrage nach `main.js`
 * HTML zurück, fehlt die Datei und der Rückfall hat zugeschlagen.
 */
async function liefereDatei(
  anfrage: Request,
  umgebung: OeffentlicheErfassungKonfiguration,
  url: URL,
  datei: string,
  csp?: string,
): Promise<Response> {
  if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
      ...SCHUTZ_HEADER,
      Allow: 'GET, HEAD',
    });
  }
  const erwarteterTyp = OEFFENTLICHE_DATEIEN[datei];
  if (erwarteterTyp === undefined) return unbekannt();

  const assets = umgebung.ASSETS;
  if (!assets) return nichtEingerichtet();

  const ziel = new URL(`/oeffentlich/${datei}`, url);
  const antwort = await assets.fetch(new Request(ziel, { method: 'GET' }));
  if (!antwort.ok) return unbekannt();

  const gelieferterTyp = antwort.headers.get('Content-Type') ?? '';
  if (!erwarteterTyp.startsWith('text/html') && gelieferterTyp.includes('text/html')) {
    // Die Datei fehlt und die SPA-Rückfallebene hat die geschützte
    // Hauptanwendung geliefert. Die darf hier nicht nach außen.
    console.error('MELDUNG_DATEI_FEHLT', datei);
    return unbekannt();
  }

  const header = new Headers();
  for (const [name, wert] of Object.entries(SCHUTZ_HEADER)) header.set(name, wert);
  header.set('Content-Type', erwarteterTyp);
  if (csp) header.set('Content-Security-Policy', csp);
  return new Response(anfrage.method === 'HEAD' ? null : antwort.body, {
    status: 200,
    headers: header,
  });
}

/**
 * Die Ursprungsprüfung aus `index.ts` läuft vor diesem Zweig nicht – sie steht
 * dort hinter `pruefeAnmeldung`. Hier ist sie strenger als die globale: ein
 * fehlender `Origin` wird nicht geduldet, weil die Meldung garantiert aus einem
 * Browser derselben Origin abgeschickt wird.
 */
export function pruefeUrsprung(anfrage: Request, url: URL): Response | null {
  const ursprung = anfrage.headers.get('Origin');
  const site = anfrage.headers.get('Sec-Fetch-Site');
  if (ursprung !== url.origin || (site !== null && site !== 'same-origin')) {
    return fehlerAntwort(
      'ANFRAGE_URSPRUNG_UNGUELTIG',
      'Meldungen sind nur aus dieser Anwendung erlaubt.',
      403,
      SCHUTZ_HEADER,
    );
  }
  return null;
}

interface FahrzeugFuerMeldung {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  erfassung_token: string | null;
}

/**
 * Sucht das Fahrzeug zum Token. Die Datenbank findet die Zeile bereits über den
 * eindeutigen Index; der zusätzliche Vergleich in konstanter Zeit ist die
 * Zusage, dass an keiner Stelle im Worker ein früh abbrechender
 * Zeichenkettenvergleich über das Token entscheidet.
 */
async function findeFahrzeug(db: D1Database, token: string): Promise<FahrzeugFuerMeldung | null> {
  if (!ERFASSUNG_TOKEN_MUSTER.test(token)) return null;
  const zeile = await db
    .prepare(
      `SELECT id, bezeichnung, funkrufname, kennzeichen, erfassung_token
         FROM fahrzeuge WHERE erfassung_token = ?`,
    )
    .bind(token)
    .first<FahrzeugFuerMeldung>();
  if (!zeile?.erfassung_token) return null;
  return gleichInKonstanterZeit(zeile.erfassung_token, token) ? zeile : null;
}

async function leseFahrzeug(db: D1Database, token: string): Promise<Response> {
  const fahrzeug = await findeFahrzeug(db, token);
  if (!fahrzeug) return unbekannt();
  // Bewusst ohne `id`: die interne UUID gehört nicht auf eine öffentliche
  // Seite. Ebenso ohne Kilometerstand – er würde die Fahrzeugnutzung offenlegen
  // und erlauben, die eigene Zahl passend zu wählen.
  return jsonAntwort(
    {
      bezeichnung: fahrzeug.bezeichnung,
      funkrufname: fahrzeug.funkrufname,
      kennzeichen: fahrzeug.kennzeichen,
    },
    200,
    SCHUTZ_HEADER,
  );
}

interface MeldungEingabe {
  name: string;
  stand: number;
  bemerkung: string;
}

/**
 * Ersetzt Steuerzeichen durch Leerzeichen, damit kein gemeldeter Name mit
 * Zeilenumbrüchen in der Freigabeliste oder in einem Protokolleintrag landet.
 */
function saeubere(wert: string): string {
  let sauber = '';
  for (const zeichen of wert) {
    const code = zeichen.codePointAt(0) ?? 0;
    sauber += code < 0x20 || code === 0x7f ? ' ' : zeichen;
  }
  return sauber.trim();
}

function pruefeMeldung(wert: unknown): MeldungEingabe | null {
  if (!istObjekt(wert)) return null;
  const name = typeof wert['name'] === 'string' ? saeubere(wert['name']) : null;
  const bemerkung = typeof wert['bemerkung'] === 'string' ? saeubere(wert['bemerkung']) : '';
  const stand = wert['stand'];
  if (
    name === null ||
    name.length < NAME_MIN ||
    name.length > NAME_MAX ||
    bemerkung.length > BEMERKUNG_MAX ||
    typeof stand !== 'number' ||
    !Number.isInteger(stand) ||
    stand < 0 ||
    stand > STAND_MAX
  ) {
    return null;
  }
  return { name, stand, bemerkung };
}

async function nimmMeldungAn(anfrage: Request, db: D1Database, token: string): Promise<Response> {
  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== 'application/json') {
    return fehlerAntwort(
      'MELDUNG_INHALTSTYP_UNGUELTIG',
      'Unzulässiger Inhaltstyp.',
      415,
      SCHUTZ_HEADER,
    );
  }

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 10_000);
  let gelesen;
  try {
    gelesen = await leseJsonBegrenzt(anfrage, KOERPER_GRENZE, abbruch.signal);
  } finally {
    clearTimeout(zeitlimit);
  }
  if (!gelesen.erfolg) {
    return gelesen.ursache === 'zu-gross'
      ? fehlerAntwort('MELDUNG_ZU_GROSS', 'Die Meldung ist zu groß.', 413, SCHUTZ_HEADER)
      : fehlerAntwort(
          'MELDUNG_EINGABE_UNGUELTIG',
          'Die Meldung ist nicht lesbar.',
          400,
          SCHUTZ_HEADER,
        );
  }

  const eingabe = pruefeMeldung(gelesen.inhalt);
  if (!eingabe) {
    return fehlerAntwort(
      'MELDUNG_EINGABE_UNGUELTIG',
      'Bitte Namen und Kilometerstand vollständig angeben.',
      400,
      SCHUTZ_HEADER,
    );
  }

  const fahrzeug = await findeFahrzeug(db, token);
  if (!fahrzeug) return unbekannt();

  const bremse = await pruefeMengengrenzen(db, fahrzeug.id);
  if (bremse) return bremse;

  const jetzt = new Date();
  await db
    .prepare(
      `INSERT INTO ablesung_einreichungen
         (id, fahrzeug_id, abgelesen_am, stand, eingereicht_am, eingereicht_von_name,
          bemerkung, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'offen')`,
    )
    .bind(
      crypto.randomUUID(),
      fahrzeug.id,
      // Der Ablesetag kommt vom Server als Berliner Kalendertag. Die öffentliche
      // Seite hat bewusst kein Datumsfeld: eine Rückdatierung aus einer nicht
      // angemeldeten Quelle wäre eine überflüssige Angriffsfläche.
      berlinerKalendertag(jetzt),
      eingabe.stand,
      jetzt.toISOString(),
      eingabe.name,
      eingabe.bemerkung,
    )
    .run();

  return jsonAntwort({ status: 'eingereicht' }, 201, SCHUTZ_HEADER);
}

async function pruefeMengengrenzen(db: D1Database, fahrzeugId: string): Promise<Response | null> {
  const offene = await db
    .prepare(
      `SELECT COUNT(*) AS anzahl FROM ablesung_einreichungen
        WHERE fahrzeug_id = ? AND status = 'offen'`,
    )
    .bind(fahrzeugId)
    .first<{ anzahl: number }>();
  if ((offene?.anzahl ?? 0) >= MAX_OFFENE_JE_FAHRZEUG) {
    return fehlerAntwort(
      'MELDUNG_ZU_VIELE_OFFEN',
      'Für dieses Fahrzeug liegen bereits mehrere ungeprüfte Meldungen vor. Bitte später erneut versuchen.',
      429,
      { ...SCHUTZ_HEADER, 'Retry-After': '3600' },
    );
  }

  const letzte = await db
    .prepare(
      `SELECT MAX(eingereicht_am) AS zuletzt FROM ablesung_einreichungen WHERE fahrzeug_id = ?`,
    )
    .bind(fahrzeugId)
    .first<{ zuletzt: string | null }>();
  const zuletzt = letzte?.zuletzt ? Date.parse(letzte.zuletzt) : Number.NaN;
  if (Number.isFinite(zuletzt) && Date.now() - zuletzt < WIEDERHOLFENSTER_MS) {
    return fehlerAntwort(
      'MELDUNG_ZU_HAEUFIG',
      'Für dieses Fahrzeug wurde gerade eben schon gemeldet. Bitte kurz warten.',
      429,
      { ...SCHUTZ_HEADER, 'Retry-After': '60' },
    );
  }
  return null;
}
