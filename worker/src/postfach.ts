import { fehlerAntwort, jsonAntwort } from './antwort';
import { istObjekt, istText, leseJsonKoerper, UUID_MUSTER } from './json-lesen';
import { pruefeRollenRecht } from './rollen';
import {
  AUFBEWAHRUNG_TAGE,
  ermittlePostfachSicht,
  istGueltigesKuerzel,
  kuerzelAusBezeichnung,
  RESERVIERTE_KUERZEL,
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
const ADRESSE_PFAD = new RegExp(`^/api/postfach/adressen/(${UUID_MUSTER})$`, 'i');

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

interface AdressZeile {
  kuerzel: string;
  fahrzeug_id: string;
  bezeichnung: string;
}

/** Legt fehlende Kürzel aus der Bezeichnung an, eindeutig und ohne reservierte Namen. */
async function ergaenzeAdressen(db: D1Database, email: string): Promise<void> {
  const ohne = await db
    .prepare(
      `SELECT f.id, f.bezeichnung FROM fahrzeuge f
       WHERE NOT EXISTS (SELECT 1 FROM postfach_adressen a WHERE a.fahrzeug_id = f.id)`,
    )
    .all<{ id: string; bezeichnung: string }>();
  if (ohne.results.length === 0) return;
  const belegt = new Set(
    (
      await db.prepare('SELECT kuerzel FROM postfach_adressen').all<{ kuerzel: string }>()
    ).results.map((z) => z.kuerzel),
  );
  const jetzt = new Date().toISOString();
  for (const fahrzeug of ohne.results) {
    const basis = kuerzelAusBezeichnung(fahrzeug.bezeichnung);
    let kuerzel = basis;
    for (let n = 2; belegt.has(kuerzel) || RESERVIERTE_KUERZEL.has(kuerzel); n++) {
      const zusatz = `-${n}`;
      kuerzel = `${basis.slice(0, 30 - zusatz.length).replace(/-+$/, '')}${zusatz}`;
    }
    belegt.add(kuerzel);
    await db
      .prepare(
        'INSERT INTO postfach_adressen (kuerzel, fahrzeug_id, geaendert_am, geaendert_von) VALUES (?, ?, ?, ?)',
      )
      .bind(kuerzel, fahrzeug.id, jetzt, email)
      .run();
  }
}

function domainVon(anfrage: Request, umgebung: VorgaengeKonfiguration): string {
  const eingestellt = umgebung.POSTFACH_DOMAIN?.trim().toLowerCase();
  if (eingestellt && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(eingestellt)) return eingestellt;
  return new URL(anfrage.url).hostname;
}

async function listeAdressen(
  anfrage: Request,
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  email: string,
): Promise<Response> {
  await ergaenzeAdressen(db, email);
  const domain = domainVon(anfrage, umgebung);
  const ergebnis = await db
    .prepare(
      `SELECT a.kuerzel, a.fahrzeug_id, f.bezeichnung FROM postfach_adressen a
       JOIN fahrzeuge f ON f.id = a.fahrzeug_id ORDER BY f.bezeichnung`,
    )
    .all<AdressZeile>();
  return jsonAntwort({
    sammelAdresse: `${SAMMELPOSTFACH}@${domain}`,
    adressen: ergebnis.results.map((a) => ({
      fahrzeugId: a.fahrzeug_id,
      fahrzeugBezeichnung: a.bezeichnung,
      kuerzel: a.kuerzel,
      adresse: `${a.kuerzel}@${domain}`,
    })),
  });
}

async function setzeKuerzel(
  anfrage: Request,
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  fahrzeugId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const verboten = await pruefeRollenRecht(
    umgebung,
    identitaet,
    ['zugfuehrung'],
    'Die Adresse eines Fahrzeugs ändert nur die Zugführung.',
    'POSTFACH_KUERZEL_NICHT_ERLAUBT',
  );
  if (verboten) return verboten;
  const koerper = await leseJsonKoerper(anfrage, 1024, {
    inhaltstyp: 'POSTFACH_INHALTSTYP_UNGUELTIG',
    zuGross: 'POSTFACH_DATEI_ZU_GROSS',
    unlesbar: 'POSTFACH_DATEI_UNLESBAR',
  });
  if (koerper instanceof Response) return koerper;
  const wert = koerper.inhalt;
  if (!istObjekt(wert) || Object.keys(wert).join(',') !== 'kuerzel' || !istText(wert['kuerzel'])) {
    return ungueltig('Ungültiges Kürzel.');
  }
  const kuerzel = wert['kuerzel'].trim().toLowerCase();
  if (!istGueltigesKuerzel(kuerzel)) {
    return fehlerAntwort(
      'POSTFACH_KUERZEL_UNGUELTIG',
      'Das Kürzel besteht aus 2 bis 30 Zeichen (a bis z, Ziffern, Bindestrich) und ist kein reservierter Name.',
      400,
    );
  }
  const fahrzeug = await db
    .prepare('SELECT id FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first();
  if (!fahrzeug) return nichtGefunden('Fahrzeug nicht gefunden.');
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO postfach_adressen (kuerzel, fahrzeug_id, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(fahrzeug_id) DO UPDATE SET
           kuerzel = excluded.kuerzel, geaendert_am = excluded.geaendert_am, geaendert_von = excluded.geaendert_von`,
      )
      .bind(kuerzel, fahrzeugId, jetzt, identitaet.email)
      .run();
  } catch (ursache) {
    if (ursache instanceof Error && ursache.message.includes('UNIQUE')) {
      return fehlerAntwort(
        'POSTFACH_KUERZEL_VERGEBEN',
        'Dieses Kürzel gehört schon einem anderen Fahrzeug.',
        409,
      );
    }
    throw ursache;
  }
  return jsonAntwort({ fahrzeugId, kuerzel });
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
      if (methode === 'GET') return await listeAdressen(anfrage, db, umgebung, identitaet.email);
      return methodeNichtErlaubt('GET');
    }
    const adresse = ADRESSE_PFAD.exec(pfad)?.[1];
    if (adresse) {
      if (methode === 'PUT') return await setzeKuerzel(anfrage, db, umgebung, adresse, identitaet);
      return methodeNichtErlaubt('PUT');
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
