import { fehlerAntwort, jsonAntwort } from './antwort';
import { leseZugangsdatum, type Zugangsdatum } from './zugangsdaten';

export interface EfsKonfiguration {
  HIORGSERVER_BASE_URL?: Zugangsdatum;
  HIORGSERVER_EFS_API_TOKEN?: Zugangsdatum;
}

type EfsAktion = 'checkapikey' | 'getveranstaltungen' | 'getveranstaltung';
type JsonObjekt = Record<string, unknown>;
type FeldTyp = 'text' | 'kennung';
type FeldSchema = Record<string, FeldTyp>;
type LeseErgebnis =
  { erfolg: true; inhalt: unknown } | { erfolg: false; ursache: 'zu-gross' | 'ungueltig' };

export const MAX_EFS_ANFRAGE_BYTES = 8 * 1024;
export const MAX_EFS_ANTWORT_BYTES = 5 * 1024 * 1024;

const AKTIONEN = new Map<string, EfsAktion>([
  ['/api/efs/checkapikey', 'checkapikey'],
  ['/api/efs/getveranstaltungen', 'getveranstaltungen'],
  ['/api/efs/getveranstaltung', 'getveranstaltung'],
]);

// Entspricht den tatsächlich gelesenen Feldern des übernommenen EfsApiService.
// Qualifikationsstrings werden unverändert zum bestehenden Client-Mapping geliefert.
const EINSATZ_FELDER: FeldSchema = {
  id: 'kennung',
  titel: 'text',
  stichwort: 'text',
  datum_von: 'text',
  datum_bis: 'text',
  beginn: 'kennung',
  end: 'kennung',
  zeitpunkt: 'kennung',
  ort: 'text',
  veranstaltung_id: 'kennung',
};
const KRAFT_FELDER: FeldSchema = {
  hiorg_ek_id: 'kennung',
  hiorg_org_id: 'kennung',
  vorname: 'text',
  nachname: 'text',
  fw_qual: 'text',
  med_qual: 'text',
  fuehr_qual: 'text',
  bes_ausbild: 'text',
  tel_mobil: 'text',
};
const MITTEL_FELDER: FeldSchema = {
  id: 'kennung',
  bezeichnung: 'kennung',
  funkruf: 'kennung',
  fugcode: 'kennung',
};
const DETAIL_FELDER: FeldSchema = {
  ...EINSATZ_FELDER,
  zeitraum_bemerk: 'text',
};

/** Nur drei bekannte Leseaktionen; Ziel, API-Key, Version und Aktion bestimmt der Worker. */
export async function verarbeiteEfs(
  anfrage: Request,
  umgebung: EfsKonfiguration,
): Promise<Response> {
  const url = new URL(anfrage.url);
  const aktion = AKTIONEN.get(url.pathname);
  if (!aktion) {
    return fehlerAntwort('API_NICHT_GEFUNDEN', 'API-Endpunkt nicht gefunden.', 404);
  }
  if (anfrage.method !== 'POST') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: 'POST' });
  }
  if (url.search !== '' || anfrage.url.includes('?')) {
    return fehlerAntwort('EFS_ANFRAGE_UNGUELTIG', 'Keine URL-Parameter erlaubt.', 400);
  }
  if (
    anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    return fehlerAntwort('EFS_INHALTSTYP_UNGUELTIG', 'JSON als Anfrageformat erforderlich.', 415);
  }

  const gelesen = await leseJsonBegrenzt(anfrage, MAX_EFS_ANFRAGE_BYTES);
  if (!gelesen.erfolg) {
    return gelesen.ursache === 'zu-gross'
      ? fehlerAntwort('EFS_ANFRAGE_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
      : fehlerAntwort('EFS_ANFRAGE_UNGUELTIG', 'Ungültige JSON-Anfrage.', 400);
  }
  if (!istObjekt(gelesen.inhalt)) {
    return fehlerAntwort('EFS_ANFRAGE_UNGUELTIG', 'Ein JSON-Objekt ist erforderlich.', 400);
  }
  const inhalt = gelesen.inhalt;
  if (Object.keys(inhalt).some((feld) => aktion !== 'getveranstaltung' || feld !== 'id')) {
    return fehlerAntwort('EFS_ANFRAGE_UNGUELTIG', 'Unbekannte Anfragefelder.', 400);
  }
  const id = inhalt['id'];
  if (
    aktion === 'getveranstaltung' &&
    (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
  ) {
    return fehlerAntwort('EFS_ANFRAGE_UNGUELTIG', 'Ungültige Veranstaltungskennung.', 400);
  }

  const [basisUrl, token] = await Promise.all([
    leseZugangsdatum(umgebung.HIORGSERVER_BASE_URL),
    leseZugangsdatum(umgebung.HIORGSERVER_EFS_API_TOKEN),
  ]);
  const ziel = pruefeZiel(basisUrl);
  if (!ziel || !token || token.trim() !== token) {
    return fehlerAntwort(
      'EFS_KONFIGURATION_FEHLT',
      'Die HiOrg-Anbindung ist noch nicht vollständig eingerichtet.',
      503,
    );
  }

  const formulardaten = new URLSearchParams({
    apikey: token,
    version: '2',
    action: aktion,
  });
  if (aktion === 'getveranstaltung') {
    formulardaten.set('id', id as string);
  }

  let antwort: Response;
  try {
    antwort = await fetch(ziel, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formulardaten.toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return fehlerAntwort('EFS_NICHT_ERREICHBAR', 'HiOrg ist derzeit nicht erreichbar.', 502);
  }

  if (!antwort.ok) {
    await verwerfeInhalt(antwort);
    return fehlerAntwort('EFS_ABRUF_FEHLGESCHLAGEN', 'HiOrg hat den Abruf abgelehnt.', 502);
  }
  const ergebnis = await leseJsonBegrenzt(antwort, MAX_EFS_ANTWORT_BYTES);
  if (!ergebnis.erfolg) {
    return ergebnis.ursache === 'zu-gross'
      ? fehlerAntwort('EFS_ANTWORT_ZU_GROSS', 'Die HiOrg-Antwort ist zu groß.', 502)
      : fehlerAntwort('EFS_ANTWORT_UNGUELTIG', 'HiOrg hat keine gültigen Daten geliefert.', 502);
  }
  if (!istObjekt(ergebnis.inhalt) || ergebnis.inhalt['status'] !== 'OK') {
    return fehlerAntwort('EFS_ANTWORT_UNGUELTIG', 'HiOrg hat keine gültigen Daten geliefert.', 502);
  }

  const daten = filtereAntwort(aktion, ergebnis.inhalt);
  // Auch ein fremder Server darf den API-Key nicht in einem erlaubten Textfeld spiegeln.
  if (!daten || enthaeltZugangsdatum(daten, token)) {
    return fehlerAntwort('EFS_ANTWORT_UNGUELTIG', 'HiOrg hat keine gültigen Daten geliefert.', 502);
  }
  return jsonAntwort(daten);
}

function pruefeZiel(wert: string | undefined): string | undefined {
  if (!wert || /[\u0000-\u0020\u007f\\]/.test(wert)) return undefined;
  // URL() normalisiert unter anderem leere Userinfo und Steuerzeichen weg.
  // Solche fehlerhaften Secrets ebenso wie leere Query-/Fragmentteile ablehnen.
  const bestandteile = /^https:\/\/([^/?#]+)(?:\/[^?#]*)?$/i.exec(wert);
  if (!bestandteile || bestandteile[1]?.includes('@')) return undefined;
  try {
    const url = new URL(wert);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function istObjekt(wert: unknown): wert is JsonObjekt {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function istKennung(wert: unknown): wert is string | number {
  return typeof wert === 'string' || (typeof wert === 'number' && Number.isFinite(wert));
}

function filtereFelder(daten: JsonObjekt, schema: FeldSchema): JsonObjekt | undefined {
  const ausgabe: JsonObjekt = {};
  for (const [feld, typ] of Object.entries(schema)) {
    const wert = daten[feld];
    // Fehlende und null-Werte werden im bestehenden Client mit ?? behandelt.
    if (wert === undefined || wert === null) continue;
    if (typ === 'text' ? typeof wert !== 'string' : !istKennung(wert)) return undefined;
    ausgabe[feld] = wert;
  }
  return ausgabe;
}

function filtereAntwort(aktion: EfsAktion, daten: JsonObjekt): JsonObjekt | undefined {
  if (aktion === 'checkapikey') {
    const orga = daten['orga'];
    const organisationsId = daten['hiorg_org_id'];
    return typeof orga === 'string' &&
      orga.trim() !== '' &&
      istKennung(organisationsId) &&
      String(organisationsId).trim() !== ''
      ? { status: 'OK', orga, hiorg_org_id: organisationsId }
      : undefined;
  }

  if (aktion === 'getveranstaltungen') {
    if (!Array.isArray(daten['einsaetze'])) return undefined;
    const einsaetze: JsonObjekt[] = [];
    for (const einsatz of daten['einsaetze']) {
      if (!istObjekt(einsatz) || !istKennung(einsatz['id']) || String(einsatz['id']) === '') {
        return undefined;
      }
      const ausgabe = filtereFelder(einsatz, EINSATZ_FELDER);
      if (!ausgabe) return undefined;
      einsaetze.push(ausgabe);
    }
    return { status: 'OK', einsaetze };
  }

  const bekannteFelder = [
    ...Object.keys(DETAIL_FELDER),
    'einsatzkraefte_imeinsatz',
    'einsatzmittel_imeinsatz',
  ];
  if (!bekannteFelder.some((feld) => Object.hasOwn(daten, feld))) return undefined;
  const kopf = filtereFelder(daten, DETAIL_FELDER);
  if (!kopf) return undefined;

  const kraefte = daten['einsatzkraefte_imeinsatz'] ?? {};
  const mittel = daten['einsatzmittel_imeinsatz'] ?? [];
  if (!istObjekt(kraefte) || !Array.isArray(mittel)) return undefined;
  const gefilterteKraefte: JsonObjekt = Object.create(null);
  const gefilterteMittel: JsonObjekt[] = [];
  for (const [id, kraft] of Object.entries(kraefte)) {
    if (!istObjekt(kraft)) return undefined;
    const ausgabe = filtereFelder(kraft, KRAFT_FELDER);
    if (!ausgabe) return undefined;
    gefilterteKraefte[id] = ausgabe;
  }
  for (const einheit of mittel) {
    if (!istObjekt(einheit)) return undefined;
    const ausgabe = filtereFelder(einheit, MITTEL_FELDER);
    if (!ausgabe) return undefined;
    gefilterteMittel.push(ausgabe);
  }
  return {
    status: 'OK',
    ...kopf,
    einsatzkraefte_imeinsatz: gefilterteKraefte,
    einsatzmittel_imeinsatz: gefilterteMittel,
  };
}

function enthaeltZugangsdatum(daten: JsonObjekt, token: string): boolean {
  const text = JSON.stringify(daten);
  const varianten = [
    JSON.stringify(token).slice(1, -1),
    encodeURIComponent(token),
    new URLSearchParams({ wert: token }).toString().slice('wert='.length),
  ];
  return varianten.some((variante) => text.includes(variante));
}

async function verwerfeInhalt(quelle: Response): Promise<void> {
  try {
    await quelle.body?.cancel();
  } catch {
    // Der feste Fehlercode genügt; Transportfehler werden nicht veröffentlicht.
  }
}

async function leseJsonBegrenzt(quelle: Request | Response, grenze: number): Promise<LeseErgebnis> {
  if (Number(quelle.headers.get('Content-Length')) > grenze) {
    try {
      await quelle.body?.cancel();
    } catch {
      // Der Größenfehler bleibt maßgeblich.
    }
    return { erfolg: false, ursache: 'zu-gross' };
  }
  if (!quelle.body) return { erfolg: false, ursache: 'ungueltig' };
  const leser = quelle.body.getReader();
  const stuecke: Uint8Array[] = [];
  let groesse = 0;
  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      groesse += value.byteLength;
      if (groesse > grenze) {
        await leser.cancel();
        return { erfolg: false, ursache: 'zu-gross' };
      }
      stuecke.push(value);
    }
    const bytes = new Uint8Array(groesse);
    let position = 0;
    for (const stueck of stuecke) {
      bytes.set(stueck, position);
      position += stueck.byteLength;
    }
    return {
      erfolg: true,
      inhalt: JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
      ) as unknown,
    };
  } catch {
    return { erfolg: false, ursache: 'ungueltig' };
  } finally {
    leser.releaseLock();
  }
}
