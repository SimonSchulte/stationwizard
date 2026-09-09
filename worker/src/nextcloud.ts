import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { leseZugangsdatum, type Zugangsdatum } from './zugangsdaten';

export interface NextcloudKonfiguration {
  NEXTCLOUD_BASE_URL?: Zugangsdatum;
  NEXTCLOUD_SHARE_TOKEN?: Zugangsdatum;
  NEXTCLOUD_SHARE_PASSWORD?: Zugangsdatum;
  NEXTCLOUD_PEP_SHARE_TOKEN?: Zugangsdatum;
  NEXTCLOUD_PEP_SHARE_PASSWORD?: Zugangsdatum;
}

const XLSX_INHALTSTYP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_GRENZE = 15 * 1024 * 1024;
const PEP_GRENZE = 2 * 1024 * 1024;
const UUID_MUSTER = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PLANUNGS_PFAD = new RegExp(`^/api/nextcloud/planungen/(${UUID_MUSTER})$`, 'i');
const DATEINAME = new RegExp(`^(${UUID_MUSTER})\\.pep\\.json$`, 'i');
const PROPFIND_INHALT = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>`;

class Groessenfehler extends Error {}
/** Nur der fetch()-Aufruf selbst wirft dies; unterscheidet Transportfehler von Verarbeitungsfehlern. */
class VerbindungsFehler extends Error {}

/** Nur feste Freigaben und UUID-Dateinamen; Access-/Ursprungsprüfung erfolgt im Router. */
export async function verarbeiteNextcloud(
  anfrage: Request,
  umgebung: NextcloudKonfiguration,
): Promise<Response> {
  const url = new URL(anfrage.url);
  const arbeitsmappe = url.pathname === '/api/nextcloud/arbeitsmappe';
  const liste = url.pathname === '/api/nextcloud/planungen';
  const planungsId = PLANUNGS_PFAD.exec(url.pathname)?.[1];
  if ((!arbeitsmappe && !liste && !planungsId) || url.search || url.hash) {
    return fehlerAntwort('NEXTCLOUD_PFAD_UNGUELTIG', 'NextCloud-Endpunkt nicht gefunden.', 404);
  }
  if (anfrage.method !== 'GET' && (liste || anfrage.method !== 'PUT')) {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
      Allow: liste ? 'GET' : 'GET, PUT',
    });
  }

  const grenze = arbeitsmappe ? XLSX_GRENZE : PEP_GRENZE;
  let inhalt: Uint8Array<ArrayBuffer> | undefined;
  const bedingungsHeader: Record<string, string> = {};
  if (anfrage.method === 'PUT') {
    const beiUebereinstimmung = anfrage.headers.get('If-Match');
    const beiNichtvorhandensein = anfrage.headers.get('If-None-Match');
    if (!beiUebereinstimmung && !beiNichtvorhandensein) {
      return fehlerAntwort(
        'NEXTCLOUD_VORBEDINGUNG_FEHLT',
        'Zum Speichern zuerst laden oder eine neue Datei ausdrücklich anlegen.',
        428,
      );
    }
    if (
      (beiUebereinstimmung && beiNichtvorhandensein) ||
      (beiUebereinstimmung !== null && !istStarkerEtag(beiUebereinstimmung)) ||
      (beiNichtvorhandensein !== null && beiNichtvorhandensein !== '*')
    ) {
      return fehlerAntwort('NEXTCLOUD_VORBEDINGUNG_UNGUELTIG', 'Ungültige Dateiversion.', 400);
    }
    if (beiUebereinstimmung) bedingungsHeader['If-Match'] = beiUebereinstimmung;
    if (beiNichtvorhandensein) bedingungsHeader['If-None-Match'] = beiNichtvorhandensein;
    const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    if (
      arbeitsmappe
        ? inhaltstyp !== XLSX_INHALTSTYP && inhaltstyp !== 'application/octet-stream'
        : inhaltstyp !== 'application/json'
    ) {
      return fehlerAntwort('NEXTCLOUD_INHALTSTYP_UNGUELTIG', 'Unzulässiger Dateityp.', 415);
    }
    const uploadAbbruch = new AbortController();
    const uploadZeitlimit = setTimeout(() => uploadAbbruch.abort(), 30_000);
    try {
      inhalt = await leseBegrenzt(anfrage, grenze, uploadAbbruch.signal);
    } catch (fehler) {
      if (uploadAbbruch.signal.aborted) {
        return fehlerAntwort(
          'NEXTCLOUD_UPLOAD_ZEITLIMIT',
          'Die Datei wurde nicht rechtzeitig übertragen.',
          408,
        );
      }
      return fehlerAntwort(
        fehler instanceof Groessenfehler ? 'NEXTCLOUD_DATEI_ZU_GROSS' : 'NEXTCLOUD_DATEI_UNLESBAR',
        fehler instanceof Groessenfehler ? 'Die Datei ist zu groß.' : 'Die Datei ist nicht lesbar.',
        fehler instanceof Groessenfehler ? 413 : 400,
      );
    } finally {
      clearTimeout(uploadZeitlimit);
    }
    if (arbeitsmappe ? !istZip(inhalt) : !istPepDatei(inhalt, planungsId!)) {
      return fehlerAntwort('NEXTCLOUD_DATEI_UNGUELTIG', 'Ungültiger Dateiinhalt.', 400);
    }
  }

  const tokenQuelle = arbeitsmappe
    ? umgebung.NEXTCLOUD_SHARE_TOKEN
    : umgebung.NEXTCLOUD_PEP_SHARE_TOKEN;
  const passwortQuelle = arbeitsmappe
    ? umgebung.NEXTCLOUD_SHARE_PASSWORD
    : umgebung.NEXTCLOUD_PEP_SHARE_PASSWORD;
  const [basis, token, passwort] = await Promise.all([
    leseZugangsdatum(umgebung.NEXTCLOUD_BASE_URL),
    leseZugangsdatum(tokenQuelle),
    leseZugangsdatum(passwortQuelle),
  ]);
  const basisUrl = pruefeBasisUrl(basis);
  if (
    !basisUrl ||
    !token ||
    /[:\r\n]/.test(token) ||
    (passwortQuelle !== undefined && passwort === undefined)
  ) {
    return fehlerAntwort(
      'NEXTCLOUD_KONFIGURATION_FEHLT',
      'Die NextCloud-Verbindung ist nicht vollständig eingerichtet.',
      503,
    );
  }
  const verzeichnis = `${basisUrl}/public.php/webdav/`;
  const ziel = planungsId ? `${verzeichnis}${planungsId}.pep.json` : verzeichnis;
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 30_000);
  try {
    let antwort: Response;
    try {
      antwort = await fetch(ziel, {
        method: liste ? 'PROPFIND' : anfrage.method,
        headers: {
          Authorization: `Basic ${kodiereBasic(`${token}:${passwort ?? ''}`)}`,
          'X-Requested-With': 'XMLHttpRequest',
          ...bedingungsHeader,
          ...(liste
            ? { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }
            : anfrage.method === 'PUT'
              ? { 'Content-Type': arbeitsmappe ? XLSX_INHALTSTYP : 'application/json' }
              : {}),
        },
        body: liste ? PROPFIND_INHALT : inhalt,
        // 'manual' folgt keiner Weiterleitung, macht sie aber als eigenen Status sichtbar.
        redirect: 'manual',
        signal: abbruch.signal,
      });
    } catch (fehler) {
      // DNS-, TLS- und Verbindungsfehler landen hier; Weiterleitungen dagegen unten.
      throw abbruch.signal.aborted ? fehler : new VerbindungsFehler(undefined, { cause: fehler });
    }
    if (istUmleitung(antwort)) {
      // Weiterleitung bewusst nicht folgen: Ziel, Inhalt und Header bleiben unveröffentlicht.
      await verwerfeInhalt(antwort);
      return fehlerAntwort(
        'NEXTCLOUD_UMLEITUNG',
        'NextCloud beantwortet die konfigurierte Adresse mit einer Weiterleitung.',
        502,
      );
    }
    if (!antwort.ok) {
      await verwerfeInhalt(antwort);
      return upstreamFehler(antwort.status);
    }
    if (
      liste
        ? antwort.status !== 207
        : anfrage.method === 'GET'
          ? antwort.status !== 200
          : ![200, 201, 204].includes(antwort.status)
    ) {
      await verwerfeInhalt(antwort);
      return fehlerAntwort('NEXTCLOUD_ANTWORT_UNGUELTIG', 'Ungültige NextCloud-Antwort.', 502);
    }
    const dateiHeader = versionsHeader(antwort);
    if (anfrage.method === 'PUT') {
      // Manche WebDAV-Server senden eine HTML-Bestätigung: niemals weiterreichen.
      await verwerfeInhalt(antwort);
      return new Response(null, { status: 204, headers: dateiHeader });
    }
    const daten = await leseBegrenzt(antwort, grenze, abbruch.signal);
    if (liste) {
      const dateien = leseDateiliste(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(daten),
        verzeichnis,
      );
      return jsonAntwort({ dateien });
    }
    if (arbeitsmappe ? !istZip(daten) : !istPepDatei(daten, planungsId!)) {
      return fehlerAntwort(
        'NEXTCLOUD_ANTWORT_UNGUELTIG',
        'Ungültiger Dateiinhalt von NextCloud.',
        502,
      );
    }
    return new Response(daten, {
      status: 200,
      headers: {
        ...dateiHeader,
        'Content-Type': arbeitsmappe ? XLSX_INHALTSTYP : 'application/json; charset=utf-8',
      },
    });
  } catch (fehler) {
    if (abbruch.signal.aborted) {
      return fehlerAntwort('NEXTCLOUD_ZEITLIMIT', 'NextCloud antwortet nicht rechtzeitig.', 504);
    }
    if (fehler instanceof Groessenfehler) {
      return fehlerAntwort('NEXTCLOUD_ANTWORT_ZU_GROSS', 'Die NextCloud-Datei ist zu groß.', 502);
    }
    if (fehler instanceof VerbindungsFehler) {
      return fehlerAntwort(
        'NEXTCLOUD_NICHT_ERREICHBAR',
        'NextCloud konnte nicht gelesen werden.',
        502,
      );
    }
    // Antwort kam an, war aber nicht verarbeitbar (z. B. ungültiges WebDAV-XML).
    return fehlerAntwort('NEXTCLOUD_ANTWORT_UNGUELTIG', 'Ungültige NextCloud-Antwort.', 502);
  } finally {
    clearTimeout(zeitlimit);
  }
}

/** Mit redirect: 'manual' liefert die Laufzeit die Weiterleitung als echten 3xx-Status. */
function istUmleitung(antwort: Response): boolean {
  return antwort.status >= 300 && antwort.status <= 399;
}

function pruefeBasisUrl(wert: string | undefined): string | undefined {
  // URL() verschluckt leere Query-/Fragmenttrenner sowie manche Steuerzeichen.
  // Vor dem Anhängen des festen WebDAV-Pfads auch die Rohkonfiguration prüfen.
  if (
    !wert ||
    wert.trim() !== wert ||
    /[?#\\\u0000-\u0020\u007f]/.test(wert) ||
    !/^https:\/\/[^/@]+(?:\/|$)/.test(wert)
  )
    return undefined;
  try {
    const url = new URL(wert);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      return undefined;
    }
    return url.href.replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

function kodiereBasic(wert: string): string {
  const bytes = new TextEncoder().encode(wert);
  let binaer = '';
  for (const byte of bytes) binaer += String.fromCharCode(byte);
  return btoa(binaer);
}

function istStarkerEtag(wert: string): boolean {
  return /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(wert);
}

async function leseBegrenzt(
  quelle: Request | Response,
  grenze: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const groesse = Number(quelle.headers.get('Content-Length'));
  if (Number.isFinite(groesse) && groesse > grenze) {
    await verwerfeInhalt(quelle);
    throw new Groessenfehler();
  }
  if (!quelle.body) return new Uint8Array();
  const leser = quelle.body.getReader();
  const teile: Uint8Array[] = [];
  let laenge = 0;
  const beiAbbruch = () => void leser.cancel().catch(() => undefined);
  signal?.addEventListener('abort', beiAbbruch, { once: true });
  try {
    if (signal?.aborted) throw new Error('Zeitlimit');
    while (true) {
      const { done, value } = await leser.read();
      if (signal?.aborted) throw new Error('Zeitlimit');
      if (done) break;
      laenge += value.byteLength;
      if (laenge > grenze) {
        await leser.cancel();
        throw new Groessenfehler();
      }
      teile.push(value);
    }
  } finally {
    signal?.removeEventListener('abort', beiAbbruch);
    leser.releaseLock();
  }
  const ergebnis = new Uint8Array(laenge);
  let versatz = 0;
  for (const teil of teile) {
    ergebnis.set(teil, versatz);
    versatz += teil.byteLength;
  }
  return ergebnis;
}

async function verwerfeInhalt(quelle: Request | Response): Promise<void> {
  await quelle.body?.cancel().catch(() => undefined);
}

function istZip(inhalt: Uint8Array): boolean {
  return (
    inhalt.length >= 4 &&
    inhalt[0] === 0x50 &&
    inhalt[1] === 0x4b &&
    inhalt[2] === 3 &&
    inhalt[3] === 4
  );
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return wert !== null && typeof wert === 'object' && !Array.isArray(wert);
}

function istPepDatei(inhalt: Uint8Array, id: string): boolean {
  try {
    const datei: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(inhalt),
    );
    if (
      !istObjekt(datei) ||
      typeof datei['version'] !== 'string' ||
      !istObjekt(datei['meta']) ||
      !istObjekt(datei['planung'])
    )
      return false;
    const meta = datei['meta'];
    const planung = datei['planung'];
    return (
      typeof meta['exportedAt'] === 'string' &&
      typeof meta['locale'] === 'string' &&
      typeof planung['id'] === 'string' &&
      planung['id'].toLowerCase() === id.toLowerCase() &&
      typeof planung['name'] === 'string' &&
      typeof planung['start'] === 'string' &&
      typeof planung['end'] === 'string' &&
      Array.isArray(planung['posten']) &&
      Array.isArray(planung['einsatzkraefte']) &&
      (planung['einsatzleiter'] === null || istObjekt(planung['einsatzleiter']))
    );
  } catch {
    return false;
  }
}

function versionsHeader(antwort: Response): Record<string, string> {
  const header: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const etag = antwort.headers.get('ETag');
  const geaendert = antwort.headers.get('Last-Modified');
  if (etag && (istStarkerEtag(etag) || /^W\/"[^"\r\n]*"$/.test(etag))) header['ETag'] = etag;
  if (geaendert && Number.isFinite(Date.parse(geaendert))) header['Last-Modified'] = geaendert;
  return header;
}

function upstreamFehler(status: number): Response {
  if (status === 401 || status === 403) {
    return fehlerAntwort('NEXTCLOUD_ZUGANG_ABGELEHNT', 'NextCloud lehnt die Freigabe ab.', 502);
  }
  if (status === 412) {
    return fehlerAntwort(
      'NEXTCLOUD_DATEI_GEAENDERT',
      'Die Datei wurde zwischenzeitlich geändert. Bitte erneut laden.',
      412,
    );
  }
  if (status === 404) {
    return fehlerAntwort('NEXTCLOUD_DATEI_NICHT_GEFUNDEN', 'NextCloud-Datei nicht gefunden.', 404);
  }
  return fehlerAntwort('NEXTCLOUD_FEHLER', 'NextCloud konnte die Anfrage nicht ausführen.', 502);
}

function alsListe(wert: unknown): unknown[] {
  return wert === undefined ? [] : Array.isArray(wert) ? wert : [wert];
}

function leseDateiliste(xml: string, verzeichnis: string): { id: string; etag: string | null }[] {
  // Keine DTD und keine Entity-Deklaration. Nur die fünf XML-Zeichen-Escapes
  // werden anschließend explizit aufgelöst; der Parser expandiert keine Entities.
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error('Ungültiges WebDAV-XML');
  }
  const parser = new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: false,
  });
  const wurzel: unknown = parser.parse(xml);
  if (!istObjekt(wurzel) || !istObjekt(wurzel['multistatus']))
    throw new Error('Ungültiges WebDAV-XML');
  const verzeichnisUrl = new URL(verzeichnis);
  const ergebnis = new Map<string, string | null>();
  for (const antwort of alsListe(wurzel['multistatus']['response'])) {
    if (!istObjekt(antwort) || typeof antwort['href'] !== 'string') continue;
    let dateiname: string;
    try {
      const url = new URL(xmlZeichen(antwort['href']), verzeichnisUrl);
      if (
        url.origin !== verzeichnisUrl.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        continue;
      const pfad = decodeURIComponent(url.pathname);
      const verzeichnisPfad = decodeURIComponent(verzeichnisUrl.pathname);
      if (!pfad.startsWith(verzeichnisPfad)) continue;
      dateiname = pfad.slice(verzeichnisPfad.length);
    } catch {
      continue;
    }
    const id = DATEINAME.exec(dateiname)?.[1];
    if (!id) continue;
    let istDatei = false;
    let etag: string | null = null;
    for (const propstat of alsListe(antwort['propstat'])) {
      if (
        !istObjekt(propstat) ||
        typeof propstat['status'] !== 'string' ||
        !/^HTTP\/\d(?:\.\d)? 200(?: |$)/.test(propstat['status']) ||
        !istObjekt(propstat['prop'])
      )
        continue;
      const eigenschaften = propstat['prop'];
      if ('resourcetype' in eigenschaften) {
        const typ = eigenschaften['resourcetype'];
        if (typ === '') istDatei = true;
        else if (istObjekt(typ) && 'collection' in typ) {
          istDatei = false;
          break;
        }
      }
      if (typeof eigenschaften['getetag'] === 'string') {
        const wert = xmlZeichen(eigenschaften['getetag']);
        if (istStarkerEtag(wert)) etag = wert;
      }
    }
    if (istDatei) ergebnis.set(id, etag);
  }
  return [...ergebnis].map(([id, etag]) => ({ id, etag })).sort((a, b) => a.id.localeCompare(b.id));
}

function xmlZeichen(wert: string): string {
  const zeichen: Record<string, string> = {
    '&quot;': '"',
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
  };
  return wert.replace(/&(?:quot|apos|lt|gt|amp);/g, (treffer) => zeichen[treffer]!);
}
