import { fehlerAntwort, jsonAntwort } from './antwort';
import { Groessenfehler, leseBegrenzt } from './binaer-lesen';
import { starkesEtag } from './etag';
import { istObjekt, istText } from './json-lesen';
import { ANGEBOT_GROESSE_MAX, ANGEBOTE_JE_VORGANG_MAX, NOTIZ_TEXT_MAX } from './postfach-gemeinsam';
import { baueVorgangsdarstellung } from './vorgaenge-lesen';
import { ereignis } from './vorgaenge-schreiben';
import {
  konflikt,
  nichtGefunden,
  STUFE_EINGEREICHT,
  ungueltig,
  type GeprueftesBenutzerkonto,
  type VorgaengeKonfiguration,
} from './vorgaenge-gemeinsam';

/** Erkennt PDF, PNG und JPEG an den ersten Bytes; mehr nehmen Angebote nicht an. */
export function angebotTyp(bytes: Uint8Array): 'pdf' | 'png' | 'jpeg' | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'pdf';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  return null;
}

const MEDIENTYP = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg' } as const;
const ENDUNGEN = { pdf: /\.pdf$/i, png: /\.png$/i, jpeg: /\.(jpe?g)$/i } as const;

/** Dateiname ohne Pfad, Anführungszeichen und Steuerzeichen; sonst `null`. */
export function bereinigeDateiname(roh: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(roh);
  } catch {
    return null;
  }
  name = name.trim();
  if (name.length === 0 || name.length > 120) return null;
  for (const zeichen of name) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || '\\/"'.includes(zeichen)) return null;
  }
  return name;
}

interface Notiz {
  betreff: string;
  absender: string;
  datum: string;
  text: string;
}

/** Die Notiz zur ursprünglichen Mail reist als Base64-JSON in einer Kopfzeile (kurz gehalten). */
function leseNotiz(kopf: string | null): Notiz | null | 'ungueltig' {
  if (kopf === null) return null;
  try {
    const roh: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(kopf), (c) => c.charCodeAt(0))),
    );
    if (!istObjekt(roh) || Object.keys(roh).sort().join(',') !== 'absender,betreff,datum,text')
      return 'ungueltig';
    const { absender, betreff, datum, text } = roh;
    if (!istText(absender) || !istText(betreff) || !istText(datum) || !istText(text))
      return 'ungueltig';
    return {
      absender: absender.slice(0, 300),
      betreff: betreff.slice(0, 300),
      datum: datum.slice(0, 40),
      text: text.slice(0, NOTIZ_TEXT_MAX),
    };
  } catch {
    return 'ungueltig';
  }
}

function dateienFehlen(): Response {
  return fehlerAntwort(
    'VORGANG_DATEIEN_KONFIGURATION_FEHLT',
    'Der Dateispeicher der Vorgänge ist noch nicht eingerichtet.',
    503,
  );
}

/** `PUT …/angebote/<id>`: Datei ablegen (Id vom Client, damit der Upload sich wiederholen lässt). */
export async function legeAngebotAn(
  anfrage: Request,
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  vorgangId: string,
  angebotId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const bucket = umgebung.VORGAENGE_DATEIEN;
  if (!bucket) return dateienFehlen();
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'VORGANG_VORBEDINGUNG_UNGUELTIG',
      'Neuanlage nur mit If-None-Match: *.',
      400,
    );
  }
  const dateiname = bereinigeDateiname(anfrage.headers.get('X-Stationwizard-Dateiname') ?? '');
  if (!dateiname) return ungueltig('Ungültiger Dateiname.');
  const notiz = leseNotiz(anfrage.headers.get('X-Stationwizard-Notiz'));
  if (notiz === 'ungueltig') return ungueltig('Ungültige Notiz zur Mail.');

  const vorgang = await db
    .prepare(
      `SELECT v.stufe, (SELECT COUNT(*) FROM vorgang_angebote a WHERE a.vorgang_id = v.id) AS anzahl
       FROM vorgaenge v WHERE v.id = ?`,
    )
    .bind(vorgangId)
    .first<{ stufe: number; anzahl: number }>();
  if (!vorgang) return nichtGefunden();
  if (vorgang.stufe >= STUFE_EINGEREICHT) {
    return konflikt(
      'VORGANG_ANGEBOT_GESPERRT',
      'Nach dem Einreichen lassen sich keine Angebote mehr ändern.',
    );
  }
  if (vorgang.anzahl >= ANGEBOTE_JE_VORGANG_MAX) {
    return konflikt(
      'VORGANG_ANGEBOTE_GRENZE',
      `Höchstens ${ANGEBOTE_JE_VORGANG_MAX} Angebote je Vorgang.`,
    );
  }

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 30_000);
  let inhalt: Uint8Array<ArrayBuffer>;
  try {
    inhalt = await leseBegrenzt(anfrage, ANGEBOT_GROESSE_MAX, abbruch.signal);
  } catch (fehler) {
    if (fehler instanceof Groessenfehler) {
      return fehlerAntwort('VORGANG_DATEI_ZU_GROSS', 'Die Datei ist größer als 10 MB.', 413);
    }
    return fehlerAntwort(
      'VORGANG_UPLOAD_ZEITLIMIT',
      'Die Datei wurde nicht rechtzeitig übertragen.',
      408,
    );
  } finally {
    clearTimeout(zeitlimit);
  }
  const typ = angebotTyp(inhalt);
  if (!typ || !ENDUNGEN[typ].test(dateiname)) {
    return fehlerAntwort(
      'VORGANG_ANGEBOT_TYP_UNGUELTIG',
      'Angebote nehmen wir als PDF, PNG oder JPEG an; Dateiendung und Inhalt müssen übereinstimmen.',
      415,
    );
  }

  const schluessel = `vorgaenge/${vorgangId}/${angebotId}`;
  const jetzt = new Date().toISOString();
  await bucket.put(schluessel, inhalt, { httpMetadata: { contentType: MEDIENTYP[typ] } });
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO vorgang_angebote
             (id, vorgang_id, dateiname, groesse, r2_schluessel, quelle, mail_betreff, mail_absender,
              mail_datum, mail_text, hochgeladen_am, hochgeladen_von)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          angebotId,
          vorgangId,
          dateiname,
          inhalt.byteLength,
          schluessel,
          notiz ? 'email' : 'upload',
          notiz?.betreff ?? null,
          notiz?.absender ?? null,
          notiz?.datum ?? null,
          notiz?.text ?? null,
          jetzt,
          identitaet.email,
        ),
      ereignis(
        db,
        vorgangId,
        identitaet.email,
        notiz
          ? `Angebot aus E-Mail übernommen: ${dateiname}.`
          : `Angebot hochgeladen: ${dateiname}.`,
      ),
    ]);
  } catch (ursache) {
    await bucket.delete(schluessel);
    if (ursache instanceof Error && ursache.message.includes('UNIQUE')) {
      return konflikt('VORGANG_ANGEBOT_VORHANDEN', 'Dieses Angebot ist schon abgelegt.');
    }
    throw ursache;
  }
  const darstellung = await baueVorgangsdarstellung(db, vorgangId, 201);
  if (!darstellung) return nichtGefunden();
  return jsonAntwort(darstellung.inhalt, 201, { ETag: starkesEtag(darstellung.version) });
}

/** `GET …/angebote/<id>`: die Datei, gestreamt und ohne dass der Worker sie liest. */
export async function liefereAngebot(
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  vorgangId: string,
  angebotId: string,
): Promise<Response> {
  const bucket = umgebung.VORGAENGE_DATEIEN;
  if (!bucket) return dateienFehlen();
  const zeile = await db
    .prepare(
      'SELECT dateiname, r2_schluessel FROM vorgang_angebote WHERE id = ? AND vorgang_id = ?',
    )
    .bind(angebotId, vorgangId)
    .first<{ dateiname: string; r2_schluessel: string }>();
  if (!zeile) return nichtGefunden('Angebot nicht gefunden.');
  const objekt = await bucket.get(zeile.r2_schluessel);
  if (!objekt) return nichtGefunden('Die Datei dieses Angebots fehlt im Speicher.');
  const typ = zeile.dateiname.toLowerCase().endsWith('.pdf')
    ? MEDIENTYP.pdf
    : zeile.dateiname.toLowerCase().endsWith('.png')
      ? MEDIENTYP.png
      : MEDIENTYP.jpeg;
  return new Response(objekt.body, {
    status: 200,
    headers: {
      'Content-Type': typ,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zeile.dateiname)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** `DELETE …/angebote/<id>`: nur bis zum Einreichen. */
export async function entferneAngebot(
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  vorgangId: string,
  angebotId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const bucket = umgebung.VORGAENGE_DATEIEN;
  if (!bucket) return dateienFehlen();
  const zeile = await db
    .prepare(
      `SELECT a.dateiname, a.r2_schluessel, v.stufe FROM vorgang_angebote a
       JOIN vorgaenge v ON v.id = a.vorgang_id WHERE a.id = ? AND a.vorgang_id = ?`,
    )
    .bind(angebotId, vorgangId)
    .first<{ dateiname: string; r2_schluessel: string; stufe: number }>();
  if (!zeile) return nichtGefunden('Angebot nicht gefunden.');
  if (zeile.stufe >= STUFE_EINGEREICHT) {
    return konflikt(
      'VORGANG_ANGEBOT_GESPERRT',
      'Nach dem Einreichen lassen sich keine Angebote mehr ändern.',
    );
  }
  await db.batch([
    db.prepare('DELETE FROM vorgang_angebote WHERE id = ?').bind(angebotId),
    ereignis(db, vorgangId, identitaet.email, `Angebot entfernt: ${zeile.dateiname}.`),
  ]);
  await bucket.delete(zeile.r2_schluessel);
  const darstellung = await baueVorgangsdarstellung(db, vorgangId);
  if (!darstellung) return nichtGefunden();
  return jsonAntwort(darstellung.inhalt, 200, { ETag: starkesEtag(darstellung.version) });
}
