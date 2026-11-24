import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag } from './etag';
import { istObjekt, istText } from './json-lesen';
import { pruefeUnterschrift } from './unterschrift-pruefung';
import { baueVorgangsdarstellung } from './vorgaenge-lesen';
import { ereignis, istZugfuehrung } from './vorgaenge-schreiben';
import {
  anzeigenameAusEmail,
  EMAIL_MUSTER,
  konflikt,
  nichtGefunden,
  SLOT_BEZEICHNUNG,
  SLOTS,
  STUFE_EINGEREICHT,
  ungueltig,
  VORGANG_KOERPER_GRENZE,
  type GeprueftesBenutzerkonto,
  type Slot,
  type VorgaengeKonfiguration,
} from './vorgaenge-gemeinsam';
import { leseJsonKoerper } from './json-lesen';

export function istSlot(wert: string): wert is Slot {
  return (SLOTS as readonly string[]).includes(wert);
}

interface Kontext {
  vorgang_id: string;
  stufe: number;
  meldung_id: string;
  vollstaendig: number;
  gesperrt: number;
}

async function ladeKontext(db: D1Database, vorgangId: string): Promise<Kontext | null> {
  return await db
    .prepare(
      `SELECT v.id AS vorgang_id, v.stufe, m.id AS meldung_id, m.vollstaendig, m.gesperrt
       FROM vorgaenge v JOIN schadensmeldungen m ON m.vorgang_id = v.id WHERE v.id = ?`,
    )
    .bind(vorgangId)
    .first<Kontext>();
}

async function antwortMitStand(db: D1Database, vorgangId: string): Promise<Response> {
  const darstellung = await baueVorgangsdarstellung(db, vorgangId);
  if (!darstellung) return nichtGefunden();
  return jsonAntwort(darstellung.inhalt, 200, { ETag: starkesEtag(darstellung.version) });
}

/** Setzt `gesperrt` passend zur Zahl der Unterschriften (mit der ersten gesperrt, ohne letzte frei). */
function sperreNachfuehren(db: D1Database, meldungId: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE schadensmeldungen
       SET gesperrt = CASE WHEN EXISTS (
         SELECT 1 FROM meldung_unterschriften WHERE meldung_id = ? AND status = 'unterschrieben'
       ) THEN 1 ELSE 0 END
       WHERE id = ?`,
    )
    .bind(meldungId, meldungId);
}

/**
 * `PUT …/meldung/unterschriften/<slot>`: `{ "aktion": "unterschreiben" }` setzt die hinterlegte
 * Unterschrift der **geprüften Identität** (nie ein Bild aus dem Körper), `{ "aktion": "anfordern",
 * "an": "<E-Mail>" }` legt eine Anfrage an eine andere Person an.
 */
export async function setzeUnterschrift(
  anfrage: Request,
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  vorgangId: string,
  slot: Slot,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const benutzerDb = umgebung.BENUTZER_DB;
  if (!benutzerDb) {
    return fehlerAntwort(
      'VORGANG_BENUTZER_KONFIGURATION_FEHLT',
      'Die Benutzerverwaltung ist noch nicht eingerichtet.',
      503,
    );
  }
  const koerper = await leseJsonKoerper(anfrage, VORGANG_KOERPER_GRENZE, {
    inhaltstyp: 'VORGANG_INHALTSTYP_UNGUELTIG',
    zuGross: 'VORGANG_DATEI_ZU_GROSS',
    unlesbar: 'VORGANG_DATEI_UNLESBAR',
  });
  if (koerper instanceof Response) return koerper;
  const wert = koerper.inhalt;
  if (!istObjekt(wert)) return ungueltig('Ungültige Anfrage.');
  const aktion = wert['aktion'];

  const kontext = await ladeKontext(db, vorgangId);
  if (!kontext) return nichtGefunden();
  if (kontext.stufe >= STUFE_EINGEREICHT) {
    return konflikt('VORGANG_MELDUNG_GESPERRT', 'Die Meldung ist bereits eingereicht.');
  }
  if (kontext.vollstaendig !== 1) {
    return konflikt(
      'VORGANG_MELDUNG_UNVOLLSTAENDIG',
      'Zuerst die Pflichtangaben der Schadensmeldung ausfüllen.',
    );
  }
  const vorhanden = await db
    .prepare(
      'SELECT status, an_email FROM meldung_unterschriften WHERE meldung_id = ? AND slot = ?',
    )
    .bind(kontext.meldung_id, slot)
    .first<{ status: string; an_email: string | null }>();
  if (vorhanden?.status === 'unterschrieben') {
    return konflikt('VORGANG_UNTERSCHRIFT_VORHANDEN', 'Dieses Feld ist schon unterschrieben.');
  }
  const jetzt = new Date().toISOString();

  if (aktion === 'unterschreiben') {
    if (Object.keys(wert).length !== 1) return ungueltig('Ungültige Anfrage.');
    if (vorhanden && vorhanden.an_email !== identitaet.email) {
      return konflikt(
        'VORGANG_UNTERSCHRIFT_ANGEFRAGT',
        'Dieses Feld ist für eine andere Person angefragt. Zuerst die Anfrage zurückziehen.',
      );
    }
    const gespeichert = await benutzerDb
      .prepare('SELECT daten FROM benutzer_unterschriften WHERE email = ?')
      .bind(identitaet.email)
      .first<{ daten: string }>();
    const signatur = gespeichert ? pruefeUnterschrift(JSON.parse(gespeichert.daten)) : null;
    if (!signatur) {
      return konflikt(
        'VORGANG_UNTERSCHRIFT_FEHLT',
        'Zuerst im Benutzermenü eine Unterschrift hinterlegen.',
      );
    }
    const name = anzeigenameAusEmail(identitaet.email);
    await db.batch([
      db
        .prepare(
          `INSERT INTO meldung_unterschriften
             (meldung_id, slot, status, an_email, angefragt_von, angefragt_am, name, unterschrieben_am, signatur)
           VALUES (?, ?, 'unterschrieben', ?, ?, ?, ?, ?, ?)
           ON CONFLICT(meldung_id, slot) DO UPDATE SET
             status = 'unterschrieben', name = excluded.name,
             unterschrieben_am = excluded.unterschrieben_am, signatur = excluded.signatur`,
        )
        .bind(
          kontext.meldung_id,
          slot,
          identitaet.email,
          vorhanden ? null : null,
          null,
          name,
          jetzt,
          JSON.stringify(signatur),
        ),
      sperreNachfuehren(db, kontext.meldung_id),
      ereignis(
        db,
        vorgangId,
        identitaet.email,
        `Unterschrift gesetzt (${SLOT_BEZEICHNUNG[slot]}): ${name}.`,
      ),
    ]);
    return await antwortMitStand(db, vorgangId);
  }

  if (aktion === 'anfordern') {
    if (Object.keys(wert).sort().join(',') !== 'aktion,an') return ungueltig('Ungültige Anfrage.');
    const an = wert['an'];
    if (!istText(an) || !EMAIL_MUSTER.test(an) || an.length > 254)
      return ungueltig('Ungültige Person.');
    const person = await benutzerDb
      .prepare('SELECT email FROM benutzer WHERE email = ?')
      .bind(an)
      .first<{ email: string }>();
    if (!person) {
      return fehlerAntwort(
        'VORGANG_PERSON_UNBEKANNT',
        'Diese Person hat sich noch nicht angemeldet.',
        404,
      );
    }
    await db.batch([
      db
        .prepare(
          `INSERT INTO meldung_unterschriften
             (meldung_id, slot, status, an_email, angefragt_von, angefragt_am)
           VALUES (?, ?, 'angefragt', ?, ?, ?)
           ON CONFLICT(meldung_id, slot) DO UPDATE SET
             status = 'angefragt', an_email = excluded.an_email,
             angefragt_von = excluded.angefragt_von, angefragt_am = excluded.angefragt_am`,
        )
        .bind(kontext.meldung_id, slot, an, identitaet.email, jetzt),
      ereignis(
        db,
        vorgangId,
        identitaet.email,
        `Unterschrift angefragt (${SLOT_BEZEICHNUNG[slot]}) bei ${anzeigenameAusEmail(an)}.`,
      ),
    ]);
    return await antwortMitStand(db, vorgangId);
  }

  return ungueltig('Unbekannte Aktion.');
}

/**
 * `DELETE …/meldung/unterschriften/<slot>`: zieht eine Anfrage zurück oder entfernt eine
 * Unterschrift. Eine fremde Unterschrift entfernt nur die Zugführung, wer sie gesetzt hat, darf
 * sie selbst zurücknehmen.
 */
export async function entferneUnterschrift(
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  vorgangId: string,
  slot: Slot,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const kontext = await ladeKontext(db, vorgangId);
  if (!kontext) return nichtGefunden();
  if (kontext.stufe >= STUFE_EINGEREICHT) {
    return konflikt('VORGANG_MELDUNG_GESPERRT', 'Die Meldung ist bereits eingereicht.');
  }
  const zeile = await db
    .prepare(
      'SELECT status, an_email, name FROM meldung_unterschriften WHERE meldung_id = ? AND slot = ?',
    )
    .bind(kontext.meldung_id, slot)
    .first<{ status: string; an_email: string | null; name: string | null }>();
  if (!zeile) return nichtGefunden('Für dieses Feld gibt es nichts zu entfernen.');
  if (
    zeile.status === 'unterschrieben' &&
    zeile.an_email !== identitaet.email &&
    !(await istZugfuehrung(umgebung, identitaet.email))
  ) {
    return fehlerAntwort(
      'VORGANG_UNTERSCHRIFT_NICHT_ERLAUBT',
      'Eine fremde Unterschrift entfernt nur die Zugführung.',
      403,
    );
  }
  await db.batch([
    db
      .prepare('DELETE FROM meldung_unterschriften WHERE meldung_id = ? AND slot = ?')
      .bind(kontext.meldung_id, slot),
    sperreNachfuehren(db, kontext.meldung_id),
    ereignis(
      db,
      vorgangId,
      identitaet.email,
      zeile.status === 'unterschrieben'
        ? `Unterschrift entfernt (${SLOT_BEZEICHNUNG[slot]}): ${zeile.name ?? ''}.`
        : `Anfrage zurückgezogen (${SLOT_BEZEICHNUNG[slot]}).`,
    ),
  ]);
  return await antwortMitStand(db, vorgangId);
}

/** `DELETE …/meldung/unterschriften`: alle entfernen, damit sich die Meldung wieder bearbeiten lässt. */
export async function entferneAlleUnterschriften(
  db: D1Database,
  vorgangId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const kontext = await ladeKontext(db, vorgangId);
  if (!kontext) return nichtGefunden();
  if (kontext.stufe >= STUFE_EINGEREICHT) {
    return konflikt('VORGANG_MELDUNG_GESPERRT', 'Die Meldung ist bereits eingereicht.');
  }
  await db.batch([
    db.prepare('DELETE FROM meldung_unterschriften WHERE meldung_id = ?').bind(kontext.meldung_id),
    sperreNachfuehren(db, kontext.meldung_id),
    ereignis(db, vorgangId, identitaet.email, 'Alle Unterschriften und Anfragen entfernt.'),
  ]);
  return await antwortMitStand(db, vorgangId);
}
