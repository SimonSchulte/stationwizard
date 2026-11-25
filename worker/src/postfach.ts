import { fehlerAntwort, jsonAntwort } from './antwort';
import { istObjekt, istText, leseJsonKoerper, UUID_MUSTER } from './json-lesen';
import {
  AUFBEWAHRUNG_TAGE,
  ermittlePostfachSicht,
  leiteAdressenAb,
  SAMMELPOSTFACH,
  sichtBedingung,
  type PostfachSicht,
} from './postfach-gemeinsam';
import { ereignis } from './vorgaenge-schreiben';
import {
  nichtGefunden,
  ungueltig,
  type GeprueftesBenutzerkonto,
  type VorgaengeKonfiguration,
} from './vorgaenge-gemeinsam';

export const POSTFACH_PFAD = '/api/postfach';
const MAILS_PFAD = '/api/postfach/mails';
const ADRESSEN_PFAD = '/api/postfach/adressen';
const MAIL_PFAD = new RegExp(`^/api/postfach/mails/(${UUID_MUSTER})$`, 'i');
const MAIL_DATEI_PFAD = new RegExp(`^/api/postfach/mails/(${UUID_MUSTER})/datei$`, 'i');
const MAIL_ZUORDNUNG_PFAD = new RegExp(`^/api/postfach/mails/(${UUID_MUSTER})/zuordnung$`, 'i');

const TAG_MS = 24 * 60 * 60 * 1000;

function methodeNichtErlaubt(erlaubt: string): Response {
  return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: erlaubt });
}

function dateienFehlen(): Response {
  return fehlerAntwort(
    'VORGANG_DATEIEN_KONFIGURATION_FEHLT',
    'Der Dateispeicher der Vorgänge ist noch nicht eingerichtet.',
    503,
  );
}

interface MailZeile {
  id: string;
  empfangen_am: string;
  absender: string;
  betreff: string;
  empfaenger: string;
  fahrzeug_id: string | null;
  groesse: number;
  fahrzeug_bezeichnung: string | null;
  status: string;
}

/** Nach der Frist liegt nichts mehr herum: offene Mails verfallen, alte Nachweise entfallen ganz. */
async function bereinige(db: D1Database, bucket: R2Bucket | undefined): Promise<void> {
  const grenze = new Date(Date.now() - AUFBEWAHRUNG_TAGE * TAG_MS).toISOString();
  const alt = await db
    .prepare(
      "SELECT id, r2_schluessel FROM postfach_mails WHERE status = 'offen' AND empfangen_am < ?",
    )
    .bind(grenze)
    .all<{ id: string; r2_schluessel: string | null }>();
  for (const mail of alt.results)
    await schliesseMail(db, bucket, mail.id, mail.r2_schluessel, 'verworfen', 'frist', null);
  const nachweisGrenze = new Date(Date.now() - 3 * AUFBEWAHRUNG_TAGE * TAG_MS).toISOString();
  await db
    .prepare("DELETE FROM postfach_mails WHERE status != 'offen' AND bearbeitet_am < ?")
    .bind(nachweisGrenze)
    .run();
}

/** Löscht die Rohmail und leert die Zeile; sie bleibt nur als Nachweis gegen Doppelzustellung. */
async function schliesseMail(
  db: D1Database,
  bucket: R2Bucket | undefined,
  id: string,
  schluessel: string | null,
  status: 'zugeordnet' | 'verworfen',
  von: string,
  vorgangId: string | null,
): Promise<void> {
  if (bucket && schluessel) await bucket.delete(schluessel);
  await db
    .prepare(
      `UPDATE postfach_mails
       SET status = ?, vorgang_id = ?, bearbeitet_am = ?, bearbeitet_von = ?, r2_schluessel = NULL,
           absender = '', betreff = '', empfaenger = ''
       WHERE id = ?`,
    )
    .bind(status, vorgangId, new Date().toISOString(), von, id)
    .run();
}

async function ladeSichtbareMail(
  db: D1Database,
  sicht: PostfachSicht,
  id: string,
): Promise<{ id: string; r2_schluessel: string | null; status: string } | null> {
  const bedingung = sichtBedingung(sicht);
  return await db
    .prepare(
      `SELECT m.id, m.r2_schluessel, m.status FROM postfach_mails m
       LEFT JOIN fahrzeuge f ON f.id = m.fahrzeug_id
       WHERE m.id = ? AND ${bedingung.sql}`,
    )
    .bind(id, ...bedingung.werte)
    .first();
}

async function listeMails(
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  email: string,
): Promise<Response> {
  const sicht = await ermittlePostfachSicht(umgebung, email);
  if (sicht instanceof Response) return sicht;
  await bereinige(db, umgebung.VORGAENGE_DATEIEN);
  const bedingung = sichtBedingung(sicht);
  const ergebnis = await db
    .prepare(
      `SELECT m.id, m.empfangen_am, m.absender, m.betreff, m.empfaenger, m.fahrzeug_id, m.groesse,
              m.status, f.bezeichnung AS fahrzeug_bezeichnung
       FROM postfach_mails m LEFT JOIN fahrzeuge f ON f.id = m.fahrzeug_id
       WHERE m.status = 'offen' AND ${bedingung.sql}
       ORDER BY m.empfangen_am DESC LIMIT 200`,
    )
    .bind(...bedingung.werte)
    .all<MailZeile>();
  return jsonAntwort({
    mails: ergebnis.results.map((m) => ({
      id: m.id,
      empfangenAm: m.empfangen_am,
      absender: m.absender,
      betreff: m.betreff,
      empfaenger: m.empfaenger,
      fahrzeugId: m.fahrzeug_id,
      fahrzeugBezeichnung: m.fahrzeug_bezeichnung,
      groesse: m.groesse,
    })),
    aufbewahrungTage: AUFBEWAHRUNG_TAGE,
  });
}

function domainVon(anfrage: Request, umgebung: VorgaengeKonfiguration): string {
  const eingestellt = umgebung.POSTFACH_DOMAIN?.trim().toLowerCase();
  if (eingestellt && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(eingestellt)) return eingestellt;
  return new URL(anfrage.url).hostname;
}

/**
 * Alle Fahrzeugadressen in einem Aufruf: je Fahrzeug eine Adresse aus dem Kennzeichen und eine aus dem
 * Funkrufnamen (ohne „72“), abgeleitet und nie gespeichert. Sichtbar für jede geprüfte Anmeldung,
 * weil die Adressen selbst kein Geheimnis sind; die Mails dahinter schützt die Rollenprüfung.
 */
async function listeAdressen(
  anfrage: Request,
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
): Promise<Response> {
  const domain = domainVon(anfrage, umgebung);
  const ergebnis = await db
    .prepare(
      'SELECT id, bezeichnung, kennzeichen, funkrufname FROM fahrzeuge ORDER BY bezeichnung COLLATE NOCASE',
    )
    .all<{ id: string; bezeichnung: string; kennzeichen: string; funkrufname: string }>();
  const nachId = new Map(ergebnis.results.map((f) => [f.id, f]));
  return jsonAntwort({
    sammelAdresse: `${SAMMELPOSTFACH}@${domain}`,
    fahrzeuge: leiteAdressenAb(ergebnis.results).map((f) => ({
      fahrzeugId: f.fahrzeugId,
      fahrzeugBezeichnung: f.fahrzeugBezeichnung,
      adressen: f.adressen.map((a) => ({
        art: a.art,
        adresse: `${a.lokal}@${domain}`,
        // Der Text, aus dem die Adresse entstand (Kennzeichen beziehungsweise Funkrufname), für Kontakte.
        quelle:
          (a.art === 'kennzeichen'
            ? nachId.get(f.fahrzeugId)?.kennzeichen
            : nachId.get(f.fahrzeugId)?.funkrufname) ?? '',
      })),
    })),
  });
}

/** Feste Postfach-Endpunkte hinter der bereits geprüften Anmeldung. */
export async function verarbeitePostfach(
  anfrage: Request,
  umgebung: VorgaengeKonfiguration,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const db = umgebung.FAHRZEUGE_DB;
  if (!db) {
    return fehlerAntwort(
      'POSTFACH_KONFIGURATION_FEHLT',
      'Das Postfach ist noch nicht eingerichtet.',
      503,
    );
  }
  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('POSTFACH_PFAD_UNGUELTIG', 'Postfach-Endpunkt nicht gefunden.', 404);
  }
  const pfad = url.pathname;
  const methode = anfrage.method;

  try {
    if (pfad === MAILS_PFAD) {
      if (methode === 'GET') return await listeMails(db, umgebung, identitaet.email);
      return methodeNichtErlaubt('GET');
    }
    if (pfad === ADRESSEN_PFAD) {
      if (methode === 'GET') return await listeAdressen(anfrage, db, umgebung);
      return methodeNichtErlaubt('GET');
    }
    const datei = MAIL_DATEI_PFAD.exec(pfad)?.[1];
    const zuordnung = MAIL_ZUORDNUNG_PFAD.exec(pfad)?.[1];
    const mailId = MAIL_PFAD.exec(pfad)?.[1];
    if (datei || zuordnung || mailId) {
      const sicht = await ermittlePostfachSicht(umgebung, identitaet.email);
      if (sicht instanceof Response) return sicht;
      const bucket = umgebung.VORGAENGE_DATEIEN;
      const id = (datei ?? zuordnung ?? mailId) as string;
      const mail = await ladeSichtbareMail(db, sicht, id);
      // Eine Mail, die jemand nicht sehen darf, ist für ihn nicht da (404 statt 403).
      if (!mail || mail.status !== 'offen') return nichtGefunden('Mail nicht gefunden.');

      if (datei) {
        if (methode !== 'GET') return methodeNichtErlaubt('GET');
        if (!bucket) return dateienFehlen();
        const objekt = mail.r2_schluessel ? await bucket.get(mail.r2_schluessel) : null;
        if (!objekt) return nichtGefunden('Die Rohmail fehlt im Speicher.');
        return new Response(objekt.body, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      if (zuordnung) {
        if (methode !== 'POST') return methodeNichtErlaubt('POST');
        const koerper = await leseJsonKoerper(anfrage, 1024, {
          inhaltstyp: 'POSTFACH_INHALTSTYP_UNGUELTIG',
          zuGross: 'POSTFACH_DATEI_ZU_GROSS',
          unlesbar: 'POSTFACH_DATEI_UNLESBAR',
        });
        if (koerper instanceof Response) return koerper;
        const wert = koerper.inhalt;
        if (
          !istObjekt(wert) ||
          Object.keys(wert).join(',') !== 'vorgangId' ||
          !istText(wert['vorgangId'])
        ) {
          return ungueltig('Ungültiger Vorgang.');
        }
        const vorgang = await db
          .prepare('SELECT id FROM vorgaenge WHERE id = ?')
          .bind(wert['vorgangId'])
          .first<{ id: string }>();
        if (!vorgang) return nichtGefunden();
        await schliesseMail(
          db,
          bucket,
          id,
          mail.r2_schluessel,
          'zugeordnet',
          identitaet.email,
          vorgang.id,
        );
        await ereignis(
          db,
          vorgang.id,
          identitaet.email,
          'Mail aus dem Postfach dem Vorgang zugeordnet.',
        ).run();
        return jsonAntwort({ zugeordnet: true });
      }
      if (methode !== 'DELETE') return methodeNichtErlaubt('DELETE');
      await schliesseMail(db, bucket, id, mail.r2_schluessel, 'verworfen', identitaet.email, null);
      return jsonAntwort({ verworfen: true });
    }

    return fehlerAntwort('POSTFACH_PFAD_UNGUELTIG', 'Postfach-Endpunkt nicht gefunden.', 404);
  } catch (ursache) {
    console.error('POSTFACH_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'POSTFACH_DB_FEHLER',
      'Das Postfach konnte nicht verarbeitet werden.',
      502,
    );
  }
}
