import { jsonAntwort } from './antwort';
import { starkesEtag } from './etag';
import { ermittlePostfachSicht, sichtBedingung } from './postfach-gemeinsam';
import {
  nichtGefunden,
  SLOTS,
  type Slot,
  type VorgaengeKonfiguration,
} from './vorgaenge-gemeinsam';

interface VorgangZeile {
  id: string;
  art: string;
  fahrzeug_id: string;
  titel: string;
  stufe: number;
  geplant_am: string | null;
  abgeschlossen_am: string | null;
  angelegt_am: string;
  angelegt_von: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

interface ListenZeile extends VorgangZeile {
  fahrzeug_bezeichnung: string;
  fahrzeug_kennzeichen: string;
  fahrzeug_gruppe: string;
  meldung_id: string | null;
  vollstaendig: number | null;
  versendet_am: string | null;
  pflicht_unterschriften: number;
  angebote: number;
}

function vorgangJson(z: VorgangZeile): Record<string, unknown> {
  return {
    id: z.id,
    art: z.art,
    fahrzeugId: z.fahrzeug_id,
    titel: z.titel,
    stufe: z.stufe,
    geplantAm: z.geplant_am,
    abgeschlossenAm: z.abgeschlossen_am,
    angelegtAm: z.angelegt_am,
    angelegtVon: z.angelegt_von,
    geaendertAm: z.geaendert_am,
    geaendertVon: z.geaendert_von,
  };
}

/** Alle Vorgänge mit Kennzahlen in einem Aufruf; die Oberfläche filtert je Fahrzeug selbst. */
export async function listeVorgaenge(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT v.id, v.art, v.fahrzeug_id, v.titel, v.stufe, v.geplant_am, v.abgeschlossen_am,
              v.angelegt_am, v.angelegt_von, v.geaendert_am, v.geaendert_von, v.version,
              f.bezeichnung AS fahrzeug_bezeichnung, f.kennzeichen AS fahrzeug_kennzeichen,
              f.gruppe AS fahrzeug_gruppe,
              m.id AS meldung_id, m.vollstaendig, m.versendet_am,
              (SELECT COUNT(*) FROM meldung_unterschriften u
                WHERE u.meldung_id = m.id AND u.status = 'unterschrieben'
                  AND u.slot IN ('fest', 'verantw')) AS pflicht_unterschriften,
              (SELECT COUNT(*) FROM vorgang_angebote a WHERE a.vorgang_id = v.id) AS angebote
       FROM vorgaenge v
       JOIN fahrzeuge f ON f.id = v.fahrzeug_id
       LEFT JOIN schadensmeldungen m ON m.vorgang_id = v.id
       ORDER BY v.geaendert_am DESC
       LIMIT 500`,
    )
    .all<ListenZeile>();
  return jsonAntwort({
    vorgaenge: ergebnis.results.map((z) => ({
      ...vorgangJson(z),
      fahrzeugBezeichnung: z.fahrzeug_bezeichnung,
      fahrzeugKennzeichen: z.fahrzeug_kennzeichen,
      fahrzeugGruppe: z.fahrzeug_gruppe,
      meldungVollstaendig: z.vollstaendig === 1,
      pflichtUnterschriften: z.pflicht_unterschriften,
      versendetAm: z.versendet_am,
      angebote: z.angebote,
    })),
  });
}

interface MeldungZeile {
  id: string;
  inhalt: string;
  vollstaendig: number;
  gesperrt: number;
  versendet_am: string | null;
  versendet_von: string | null;
  versendet_an: string | null;
  pdf_schluessel: string | null;
  version: number;
}

interface UnterschriftZeile {
  slot: string;
  status: string;
  an_email: string | null;
  angefragt_von: string | null;
  angefragt_am: string | null;
  name: string | null;
  unterschrieben_am: string | null;
  signatur: string | null;
}

interface AngebotZeile {
  id: string;
  dateiname: string;
  groesse: number;
  quelle: string;
  mail_betreff: string | null;
  mail_absender: string | null;
  mail_datum: string | null;
  mail_text: string | null;
  hochgeladen_am: string;
  hochgeladen_von: string;
}

interface EreignisZeile {
  id: string;
  zeitpunkt: string;
  von: string;
  beschreibung: string;
}

/** Ein Vorgang mit Meldung, Unterschriften, Angeboten (nur Metadaten) und Protokoll. */
export async function leseVorgang(db: D1Database, id: string): Promise<Response> {
  const darstellung = await baueVorgangsdarstellung(db, id);
  if (!darstellung) return nichtGefunden();
  return jsonAntwort(darstellung.inhalt, darstellung.status, {
    ETag: starkesEtag(darstellung.version),
  });
}

export async function baueVorgangsdarstellung(
  db: D1Database,
  id: string,
  status = 200,
): Promise<{ inhalt: Record<string, unknown>; version: number; status: number } | null> {
  const vorgang = await db
    .prepare('SELECT * FROM vorgaenge WHERE id = ?')
    .bind(id)
    .first<VorgangZeile>();
  if (!vorgang) return null;
  const meldung = await db
    .prepare(
      `SELECT id, inhalt, vollstaendig, gesperrt, versendet_am, versendet_von, versendet_an,
              pdf_schluessel, version
       FROM schadensmeldungen WHERE vorgang_id = ?`,
    )
    .bind(id)
    .first<MeldungZeile>();
  const unterschriften = meldung
    ? await db
        .prepare(
          `SELECT slot, status, an_email, angefragt_von, angefragt_am, name, unterschrieben_am, signatur
           FROM meldung_unterschriften WHERE meldung_id = ?`,
        )
        .bind(meldung.id)
        .all<UnterschriftZeile>()
    : { results: [] as UnterschriftZeile[] };
  const angebote = await db
    .prepare(
      `SELECT id, dateiname, groesse, quelle, mail_betreff, mail_absender, mail_datum, mail_text,
              hochgeladen_am, hochgeladen_von
       FROM vorgang_angebote WHERE vorgang_id = ? ORDER BY hochgeladen_am`,
    )
    .bind(id)
    .all<AngebotZeile>();
  const ereignisse = await db
    .prepare(
      `SELECT id, zeitpunkt, von, beschreibung FROM vorgang_ereignisse
       WHERE vorgang_id = ? ORDER BY zeitpunkt DESC, id DESC LIMIT 100`,
    )
    .bind(id)
    .all<EreignisZeile>();

  const nachSlot = new Map(unterschriften.results.map((u) => [u.slot, u]));
  return {
    status,
    version: vorgang.version,
    inhalt: {
      vorgang: vorgangJson(vorgang),
      meldung: meldung
        ? {
            id: meldung.id,
            // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
            inhalt: JSON.parse(meldung.inhalt) as unknown,
            version: meldung.version,
            vollstaendig: meldung.vollstaendig === 1,
            gesperrt: meldung.gesperrt === 1,
            versendetAm: meldung.versendet_am,
            versendetVon: meldung.versendet_von,
            versendetAn: meldung.versendet_an
              ? (JSON.parse(meldung.versendet_an) as unknown)
              : null,
          }
        : null,
      unterschriften: SLOTS.map((slot: Slot) => {
        const u = nachSlot.get(slot);
        return {
          slot,
          status: u?.status ?? 'offen',
          anEmail: u?.an_email ?? null,
          angefragtVon: u?.angefragt_von ?? null,
          angefragtAm: u?.angefragt_am ?? null,
          name: u?.name ?? null,
          unterschriebenAm: u?.unterschrieben_am ?? null,
          signatur: u?.signatur ? (JSON.parse(u.signatur) as unknown) : null,
        };
      }),
      angebote: angebote.results.map((a) => ({
        id: a.id,
        dateiname: a.dateiname,
        groesse: a.groesse,
        quelle: a.quelle,
        mailBetreff: a.mail_betreff,
        mailAbsender: a.mail_absender,
        mailDatum: a.mail_datum,
        mailText: a.mail_text,
        hochgeladenAm: a.hochgeladen_am,
        hochgeladenVon: a.hochgeladen_von,
      })),
      ereignisse: ereignisse.results.map((e) => ({
        id: e.id,
        zeitpunkt: e.zeitpunkt,
        von: e.von,
        beschreibung: e.beschreibung,
      })),
    },
  };
}

interface AufgabeZeile {
  vorgang_id: string;
  slot: string;
  angefragt_von: string | null;
  angefragt_am: string | null;
  titel: string;
  fahrzeug_bezeichnung: string;
}

/** Offene Unterschriftsanfragen an die aufrufende Person; ein Aufruf für den Aufgabenbereich. */
export async function leseAufgaben(
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  email: string,
): Promise<Record<string, unknown>> {
  const ergebnis = await db
    .prepare(
      `SELECT v.id AS vorgang_id, u.slot, u.angefragt_von, u.angefragt_am, v.titel,
              f.bezeichnung AS fahrzeug_bezeichnung
       FROM meldung_unterschriften u
       JOIN schadensmeldungen m ON m.id = u.meldung_id
       JOIN vorgaenge v ON v.id = m.vorgang_id
       JOIN fahrzeuge f ON f.id = v.fahrzeug_id
       WHERE u.an_email = ? AND u.status = 'angefragt'
       ORDER BY u.angefragt_am`,
    )
    .bind(email)
    .all<AufgabeZeile>();
  // Ungeordnete Mails im Postfach: nur für Rollen, die es sehen dürfen (ohne Rolle null).
  let postfachOffen = 0;
  const sicht = await ermittlePostfachSicht(umgebung, email);
  if (!(sicht instanceof Response)) {
    const bedingung = sichtBedingung(sicht);
    const zeile = await db
      .prepare(
        `SELECT COUNT(*) AS anzahl FROM postfach_mails m LEFT JOIN fahrzeuge f ON f.id = m.fahrzeug_id
         WHERE m.status = 'offen' AND ${bedingung.sql}`,
      )
      .bind(...bedingung.werte)
      .first<{ anzahl: number }>();
    postfachOffen = zeile?.anzahl ?? 0;
  }
  return {
    postfachOffen,
    unterschriften: ergebnis.results.map((z) => ({
      vorgangId: z.vorgang_id,
      slot: z.slot,
      angefragtVon: z.angefragt_von,
      angefragtAm: z.angefragt_am,
      titel: z.titel,
      fahrzeugBezeichnung: z.fahrzeug_bezeichnung,
    })),
  };
}
