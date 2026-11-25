import { ermittleAnzeigename } from './anzeigename';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istPdf } from './ehrungsantrag-vorlage';
import { starkesEtag } from './etag';
import { istObjekt, istText, leseJsonKoerper, UUID_REGEX } from './json-lesen';
import { MAIL_FARBEN, maskiere } from './mail-format';
import {
  VersandFehler,
  VERSANDFEHLER_ANTWORTEN,
  waehleVersand,
  type MailAnhang,
} from './mail-versand';
import { leseEinstellungen } from './systemkonfiguration';
import { baueVorgangsdarstellung } from './vorgaenge-lesen';
import { ereignis } from './vorgaenge-schreiben';
import {
  erwarteteVersion,
  konflikt,
  nichtGefunden,
  PFLICHT_SLOTS,
  STUFE_ANGEBOTE,
  STUFE_EINGEREICHT,
  ungueltig,
  versionskonflikt,
  type GeprueftesBenutzerkonto,
  type VorgaengeKonfiguration,
} from './vorgaenge-gemeinsam';
import { pruefeSchadensmeldung } from './vorgaenge-meldung-pruefung';

/** Das PDF der Meldung, Base64-kodiert: wenige hundert KB, mit Beiblatt etwas mehr. */
const PDF_BASE64_MAX = 3 * 1024 * 1024;
/** Summe der angehängten Angebote; darüber geht keine Mail mehr raus (Kosten im Worker, Mailgröße). */
const ANHAENGE_BYTES_MAX = 3 * 1024 * 1024;
const NACHRICHT_MAX = 1000;
const EMPFAENGER_MAX = 5;
const KOERPER_GRENZE = PDF_BASE64_MAX + 16 * 1024;

export type VersandModus = 'einreichen' | 'senden';

/** Base64 in Blöcken, damit große Argumentlisten für `String.fromCharCode` vermieden werden. */
function alsBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

function ausBase64(wert: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(wert) || wert.length % 4 !== 0) return null;
  try {
    return Uint8Array.from(atob(wert), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hashKurz(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface Eingabe {
  modus: VersandModus;
  pdf: string;
  empfaenger: string[];
  angebote: string[];
  nachricht: string;
}

function pruefeEingabe(wert: unknown): Eingabe | null {
  if (
    !istObjekt(wert) ||
    Object.keys(wert).sort().join(',') !== 'angebote,empfaenger,modus,nachricht,pdf'
  ) {
    return null;
  }
  const { modus, pdf, empfaenger, angebote, nachricht } = wert;
  if (modus !== 'einreichen' && modus !== 'senden') return null;
  if (!istText(pdf) || pdf.length === 0 || pdf.length > PDF_BASE64_MAX) return null;
  if (!istText(nachricht) || nachricht.length > NACHRICHT_MAX) return null;
  for (const zeichen of nachricht) {
    const code = zeichen.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x0a && code !== 0x09) || code === 0x7f) return null;
  }
  if (!Array.isArray(empfaenger) || empfaenger.length === 0 || empfaenger.length > EMPFAENGER_MAX)
    return null;
  if (!empfaenger.every(istText)) return null;
  if (!Array.isArray(angebote) || angebote.length > 20) return null;
  if (!angebote.every((id) => istText(id) && UUID_REGEX.test(id))) return null;
  return {
    modus,
    pdf,
    empfaenger: empfaenger as string[],
    angebote: angebote as string[],
    nachricht,
  };
}

interface Kontext {
  stufe: number;
  version: number;
  titel: string;
  fahrzeug_bezeichnung: string;
  fahrzeug_kennzeichen: string;
  meldung_id: string;
  vollstaendig: number;
  inhalt: string;
  pflicht: number;
  angebote: number;
}

/**
 * `POST …/einreichen`: versendet die unterschriebene Meldung (das im Browser erzeugte PDF) per Mail
 * und setzt bei `modus: "einreichen"` erst **nach** erfolgreichem Versand die Stufe „Eingereicht“.
 * Empfänger stammen aus der Systemkonfiguration; der Anfragekörper wählt nur daraus aus. Bei einem
 * Fehler oder unklaren Ergebnis bleibt der Stand unverändert, ein automatischer Wiederholungsversuch
 * findet nicht statt.
 */
export async function sendeMeldung(
  anfrage: Request,
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  vorgangId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const erwartet = erwarteteVersion(anfrage);
  if (erwartet instanceof Response) return erwartet;
  const koerper = await leseJsonKoerper(anfrage, KOERPER_GRENZE, {
    inhaltstyp: 'VORGANG_INHALTSTYP_UNGUELTIG',
    zuGross: 'VORGANG_DATEI_ZU_GROSS',
    unlesbar: 'VORGANG_DATEI_UNLESBAR',
  });
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeEingabe(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültige Angaben zum Versand.');

  const benutzerDb = umgebung.BENUTZER_DB;
  if (!benutzerDb) {
    return fehlerAntwort(
      'VORGANG_BENUTZER_KONFIGURATION_FEHLT',
      'Die Systemkonfiguration ist noch nicht eingerichtet.',
      503,
    );
  }

  const kontext = await db
    .prepare(
      `SELECT v.stufe, v.version, v.titel, f.bezeichnung AS fahrzeug_bezeichnung,
              f.kennzeichen AS fahrzeug_kennzeichen, m.id AS meldung_id, m.vollstaendig, m.inhalt,
              (SELECT COUNT(*) FROM meldung_unterschriften u
                WHERE u.meldung_id = m.id AND u.status = 'unterschrieben'
                  AND u.slot IN ('fest', 'verantw')) AS pflicht,
              (SELECT COUNT(*) FROM vorgang_angebote a WHERE a.vorgang_id = v.id) AS angebote
       FROM vorgaenge v
       JOIN fahrzeuge f ON f.id = v.fahrzeug_id
       JOIN schadensmeldungen m ON m.vorgang_id = v.id
       WHERE v.id = ?`,
    )
    .bind(vorgangId)
    .first<Kontext>();
  if (!kontext) return nichtGefunden();
  if (kontext.version !== erwartet) return versionskonflikt();
  if (kontext.vollstaendig !== 1 || kontext.pflicht < PFLICHT_SLOTS.length) {
    return konflikt(
      'VORGANG_UNTERSCHRIFT_FEHLT_ZUM_SENDEN',
      'Zum Senden müssen die Pflichtangaben ausgefüllt und beide Pflichtunterschriften gesetzt sein.',
    );
  }
  if (eingabe.modus === 'einreichen') {
    if (kontext.stufe >= STUFE_EINGEREICHT) {
      return konflikt('VORGANG_BEREITS_EINGEREICHT', 'Der Vorgang ist schon eingereicht.');
    }
    if (kontext.angebote < 1) {
      return konflikt('VORGANG_ANGEBOT_FEHLT', 'Ohne Angebot kann nicht eingereicht werden.');
    }
    if (kontext.stufe !== STUFE_ANGEBOTE) {
      return konflikt(
        'VORGANG_STUFE_FEHLT',
        'Zuerst die Stufe „Angebote eingeholt“ erreichen, dann einreichen.',
      );
    }
  }

  const einstellungen = await leseEinstellungen(benutzerDb);
  const konfiguriert = einstellungen.vorgangEmpfaenger
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a !== '');
  if (konfiguriert.length === 0) {
    return konflikt(
      'VORGANG_EMPFAENGER_FEHLT',
      'Es sind keine Empfänger festgelegt. Die Zugführung legt sie in der Systemkonfiguration fest.',
    );
  }
  const gewaehlt = [...new Set(eingabe.empfaenger.map((a) => a.trim()))];
  const bekannt = new Map(konfiguriert.map((a) => [a.toLowerCase(), a]));
  const empfaenger = gewaehlt.map((a) => bekannt.get(a.toLowerCase()));
  if (empfaenger.some((a) => a === undefined)) {
    return ungueltig('Empfänger müssen aus der Systemkonfiguration stammen.');
  }

  const pdf = ausBase64(eingabe.pdf);
  if (!pdf || !istPdf(pdf)) return ungueltig('Das PDF ist ungültig.');

  const meldung = pruefeSchadensmeldung(JSON.parse(kontext.inhalt));
  const bucket = umgebung.VORGAENGE_DATEIEN;

  // Angebote als Anhänge: nur solche dieses Vorgangs, nur wenn der Speicher eingerichtet ist.
  const anhaenge: MailAnhang[] = [{ dateiname: 'schadensmeldung.pdf', inhaltBase64: eingabe.pdf }];
  if (eingabe.angebote.length > 0) {
    if (!bucket) {
      return fehlerAntwort(
        'VORGANG_DATEIEN_KONFIGURATION_FEHLT',
        'Der Dateispeicher der Vorgänge ist noch nicht eingerichtet.',
        503,
      );
    }
    let summe = 0;
    for (const id of [...new Set(eingabe.angebote)]) {
      const zeile = await db
        .prepare(
          'SELECT dateiname, groesse, r2_schluessel FROM vorgang_angebote WHERE id = ? AND vorgang_id = ?',
        )
        .bind(id, vorgangId)
        .first<{ dateiname: string; groesse: number; r2_schluessel: string }>();
      if (!zeile) return nichtGefunden('Ein gewähltes Angebot gibt es an diesem Vorgang nicht.');
      summe += zeile.groesse;
      if (summe > ANHAENGE_BYTES_MAX) {
        return fehlerAntwort(
          'VORGANG_ANHANG_ZU_GROSS',
          'Die gewählten Angebote sind zusammen zu groß für eine Mail.',
          413,
        );
      }
      const objekt = await bucket.get(zeile.r2_schluessel);
      if (!objekt) return nichtGefunden('Die Datei eines Angebots fehlt im Speicher.');
      anhaenge.push({
        dateiname: zeile.dateiname,
        inhaltBase64: alsBase64(new Uint8Array(await objekt.arrayBuffer())),
      });
    }
  }

  const betreff = `${einstellungen.vorgangBetreff}: ${kontext.fahrzeug_bezeichnung} (${kontext.fahrzeug_kennzeichen})`;
  const absender = await ermittleAnzeigename(benutzerDb, identitaet.email);
  const zeilen = [
    `Fahrzeug: ${kontext.fahrzeug_bezeichnung}, Kennzeichen ${kontext.fahrzeug_kennzeichen}`,
    `Vorgang: ${kontext.titel}`,
    meldung ? `Datum der Feststellung: ${meldung.datumFeststellung}` : '',
    eingabe.nachricht ? `\n${eingabe.nachricht}` : '',
    `\nDie unterschriebene Schadens- und Verlustmeldung hängt als PDF an.${anhaenge.length > 1 ? ` Dazu ${anhaenge.length - 1} Angebot${anhaenge.length > 2 ? 'e' : ''}.` : ''}`,
    `Gesendet von ${absender}.`,
  ].filter((z) => z !== '');
  const html = `<div style="font-family:Arial,sans-serif;color:${MAIL_FARBEN.text};font-size:14px;line-height:1.5">${zeilen
    .map((z) => `<p style="margin:0 0 8px">${maskiere(z).replaceAll('\n', '<br>')}</p>`)
    .join('')}</div>`;

  try {
    const versand = await waehleVersand(einstellungen.vorgangVersandweg, umgebung);
    await versand.sende({
      an: empfaenger[0] as string,
      weitereEmpfaenger: empfaenger.slice(1) as string[],
      betreff,
      text: zeilen.join('\n'),
      html,
      anhaenge,
    });
  } catch (ursache) {
    if (ursache instanceof VersandFehler) {
      const { code, status } = VERSANDFEHLER_ANTWORTEN[ursache.grund];
      return fehlerAntwort(code, 'Die Meldung konnte nicht versendet werden.', status);
    }
    throw ursache;
  }

  // Nachweis, was gesendet wurde: unveränderliche Kopie, wenn der Speicher eingerichtet ist.
  let schluessel: string | null = null;
  if (bucket) {
    try {
      schluessel = `vorgaenge/${vorgangId}/meldung-${await hashKurz(pdf)}.pdf`;
      await bucket.put(schluessel, pdf, { httpMetadata: { contentType: 'application/pdf' } });
    } catch (ursache) {
      console.error(
        'VORGANG_PDF_KOPIE_FEHLER',
        ursache instanceof Error ? ursache.name : 'unbekannt',
      );
      schluessel = null;
    }
  }

  const jetzt = new Date().toISOString();
  const eingereicht = eingabe.modus === 'einreichen';
  const anweisungen: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE schadensmeldungen
         SET versendet_am = ?, versendet_von = ?, versendet_an = ?, pdf_schluessel = ?
         WHERE id = ?`,
      )
      .bind(jetzt, identitaet.email, JSON.stringify(empfaenger), schluessel, kontext.meldung_id),
  ];
  if (eingereicht) {
    anweisungen.push(
      db
        .prepare(
          `UPDATE vorgaenge SET stufe = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
           WHERE id = ? AND version = ?`,
        )
        .bind(STUFE_EINGEREICHT, jetzt, identitaet.email, vorgangId, erwartet),
    );
  }
  anweisungen.push(
    ereignis(
      db,
      vorgangId,
      identitaet.email,
      eingereicht
        ? `Eingereicht: Meldung per E-Mail an ${empfaenger.length} Empfänger gesendet${anhaenge.length > 1 ? ` (mit ${anhaenge.length - 1} Angebot${anhaenge.length > 2 ? 'en' : ''})` : ''}.`
        : `Meldung per E-Mail an ${empfaenger.length} Empfänger gesendet.`,
    ),
  );
  await db.batch(anweisungen);
  console.info('VORGANG_MELDUNG_GESENDET', vorgangId, eingabe.modus);

  const darstellung = await baueVorgangsdarstellung(db, vorgangId);
  if (!darstellung) return nichtGefunden();
  return jsonAntwort(darstellung.inhalt, 200, { ETag: starkesEtag(darstellung.version) });
}
