import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag } from './etag';
import { istObjekt, istText, UUID_REGEX } from './json-lesen';
import { leseRolle } from './rollen';
import { baueVorgangsdarstellung } from './vorgaenge-lesen';
import {
  erwarteteVersion,
  GENEHMIGUNG_ROLLEN,
  konflikt,
  nichtGefunden,
  TITEL_MAX,
  ungueltig,
  versionskonflikt,
  VORGANG_ART,
  VORGANG_KOERPER_GRENZE,
  VORGANG_STUFEN,
  type GeprueftesBenutzerkonto,
  type VorgaengeKonfiguration,
} from './vorgaenge-gemeinsam';
import { fehlendePflichtangaben, pruefeSchadensmeldung } from './vorgaenge-meldung-pruefung';
import { pruefeStufenwechsel } from './vorgaenge-stufen';
import { leseJsonKoerper } from './json-lesen';

function lesePruefeKoerper(anfrage: Request) {
  return leseJsonKoerper(anfrage, VORGANG_KOERPER_GRENZE, {
    inhaltstyp: 'VORGANG_INHALTSTYP_UNGUELTIG',
    zuGross: 'VORGANG_DATEI_ZU_GROSS',
    unlesbar: 'VORGANG_DATEI_UNLESBAR',
  });
}

/** Protokolleintrag; die Beschreibung entsteht im Worker, nie aus einer Client-Eingabe. */
export function ereignis(
  db: D1Database,
  vorgangId: string,
  von: string,
  beschreibung: string,
): D1PreparedStatement {
  return db
    .prepare(
      'INSERT INTO vorgang_ereignisse (id, vorgang_id, zeitpunkt, von, beschreibung) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), vorgangId, new Date().toISOString(), von, beschreibung);
}

function istTitel(wert: unknown): wert is string {
  if (!istText(wert)) return false;
  const titel = wert.trim();
  if (titel.length === 0 || titel.length > TITEL_MAX) return false;
  for (const zeichen of titel) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/** Zugführung-Prüfung für Aufrufe, die ohne Rollenbindung auch ohne Konfiguration laufen dürfen. */
export async function istZugfuehrung(
  umgebung: VorgaengeKonfiguration,
  email: string,
): Promise<boolean> {
  if (!umgebung.BENUTZER_DB) return false;
  const zuordnung = await leseRolle(umgebung.BENUTZER_DB, email);
  return zuordnung?.rolle !== null && GENEHMIGUNG_ROLLEN.includes(zuordnung?.rolle ?? '');
}

/** `POST /api/vorgaenge`: Vorgang samt Schadensmeldung anlegen; nur mit `If-None-Match: *`. */
export async function legeVorgangAn(
  anfrage: Request,
  db: D1Database,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*' || anfrage.headers.has('If-Match')) {
    return fehlerAntwort(
      'VORGANG_VORBEDINGUNG_UNGUELTIG',
      'Neuanlage nur mit If-None-Match: *.',
      400,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage);
  if (koerper instanceof Response) return koerper;
  const wert = koerper.inhalt;
  if (!istObjekt(wert) || Object.keys(wert).sort().join(',') !== 'fahrzeugId,meldung,titel') {
    return ungueltig('Ungültiger Vorgang.');
  }
  const fahrzeugId = wert['fahrzeugId'];
  if (!istText(fahrzeugId) || !UUID_REGEX.test(fahrzeugId))
    return ungueltig('Ungültiges Fahrzeug.');
  if (!istTitel(wert['titel'])) return ungueltig('Ungültiger Titel.');
  const meldung = pruefeSchadensmeldung(wert['meldung']);
  if (!meldung) return ungueltig('Ungültige Schadensmeldung.');

  const fahrzeug = await db
    .prepare('SELECT id FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ id: string }>();
  if (!fahrzeug) {
    return fehlerAntwort('VORGANG_FAHRZEUG_UNBEKANNT', 'Dieses Fahrzeug gibt es nicht.', 404);
  }

  const vorgangId = crypto.randomUUID();
  const jetzt = new Date().toISOString();
  const stufe = fehlendePflichtangaben(meldung).length === 0 ? 0 : -1;
  await db.batch([
    db
      .prepare(
        `INSERT INTO vorgaenge
           (id, art, fahrzeug_id, titel, stufe, angelegt_am, angelegt_von, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        vorgangId,
        VORGANG_ART,
        fahrzeugId,
        wert['titel'].trim(),
        stufe,
        jetzt,
        identitaet.email,
        jetzt,
        identitaet.email,
      ),
    db
      .prepare(
        `INSERT INTO schadensmeldungen (id, vorgang_id, inhalt, vollstaendig, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        vorgangId,
        JSON.stringify(meldung),
        stufe === 0 ? 1 : 0,
        jetzt,
        identitaet.email,
      ),
    ereignis(db, vorgangId, identitaet.email, 'Vorgang angelegt.'),
  ]);
  const darstellung = await baueVorgangsdarstellung(db, vorgangId, 201);
  if (!darstellung) return nichtGefunden();
  return jsonAntwort(darstellung.inhalt, 201, { ETag: starkesEtag(darstellung.version) });
}

interface MeldungKontext {
  vorgang_id: string;
  stufe: number;
  meldung_id: string;
  gesperrt: number;
  version: number;
}

/** `PUT …/meldung`: Inhalt speichern; gesperrt nach der ersten Unterschrift. */
export async function speichereMeldung(
  anfrage: Request,
  db: D1Database,
  vorgangId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const erwartet = erwarteteVersion(anfrage);
  if (erwartet instanceof Response) return erwartet;
  const koerper = await lesePruefeKoerper(anfrage);
  if (koerper instanceof Response) return koerper;
  const inhalt = pruefeSchadensmeldung(koerper.inhalt);
  if (!inhalt) return ungueltig('Ungültige Schadensmeldung.');

  const kontext = await db
    .prepare(
      `SELECT v.id AS vorgang_id, v.stufe, m.id AS meldung_id, m.gesperrt, m.version
       FROM vorgaenge v JOIN schadensmeldungen m ON m.vorgang_id = v.id WHERE v.id = ?`,
    )
    .bind(vorgangId)
    .first<MeldungKontext>();
  if (!kontext) return nichtGefunden();
  if (kontext.version !== erwartet) return versionskonflikt();
  if (kontext.gesperrt === 1 || kontext.stufe >= 2) {
    return konflikt(
      'VORGANG_MELDUNG_GESPERRT',
      'Die Meldung ist unterschrieben und lässt sich nicht mehr ändern. Zuerst die Unterschriften entfernen.',
    );
  }

  const vollstaendig = fehlendePflichtangaben(inhalt).length === 0;
  const jetzt = new Date().toISOString();
  const anweisungen: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE schadensmeldungen
         SET inhalt = ?, vollstaendig = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ? AND gesperrt = 0`,
      )
      .bind(
        JSON.stringify(inhalt),
        vollstaendig ? 1 : 0,
        jetzt,
        identitaet.email,
        kontext.meldung_id,
        erwartet,
      ),
  ];
  // Stufe 0 ist automatisch: vollständig → erreicht, wieder unvollständig → zurück auf -1.
  const neueStufe = kontext.stufe <= 0 ? (vollstaendig ? 0 : -1) : kontext.stufe;
  if (neueStufe !== kontext.stufe) {
    anweisungen.push(
      db
        .prepare(
          `UPDATE vorgaenge SET stufe = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
           WHERE id = ?`,
        )
        .bind(neueStufe, jetzt, identitaet.email, vorgangId),
      ereignis(
        db,
        vorgangId,
        identitaet.email,
        neueStufe === 0
          ? `Stufe erreicht: ${VORGANG_STUFEN[0]}.`
          : 'Schadensmeldung ist wieder unvollständig.',
      ),
    );
  }
  const ergebnisse = await db.batch(anweisungen);
  if ((ergebnisse[0]?.meta.changes ?? 0) === 0) return versionskonflikt();

  const darstellung = await baueVorgangsdarstellung(db, vorgangId);
  if (!darstellung) return nichtGefunden();
  return jsonAntwort(darstellung.inhalt, 200, { ETag: starkesEtag(darstellung.version) });
}

/** `POST …/stufe`: nächster oder vorheriger Schritt, mit den Bedingungen aus `pruefeStufenwechsel()`. */
export async function wechsleStufe(
  anfrage: Request,
  db: D1Database,
  umgebung: VorgaengeKonfiguration,
  vorgangId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const erwartet = erwarteteVersion(anfrage);
  if (erwartet instanceof Response) return erwartet;
  const koerper = await lesePruefeKoerper(anfrage);
  if (koerper instanceof Response) return koerper;
  const wert = koerper.inhalt;
  if (!istObjekt(wert) || Object.keys(wert).sort().join(',') !== 'nach') {
    return ungueltig('Ungültige Stufe.');
  }

  const vorgang = await db
    .prepare(
      `SELECT v.stufe, v.version,
              (SELECT COUNT(*) FROM vorgang_angebote a WHERE a.vorgang_id = v.id) AS angebote
       FROM vorgaenge v WHERE v.id = ?`,
    )
    .bind(vorgangId)
    .first<{ stufe: number; version: number; angebote: number }>();
  if (!vorgang) return nichtGefunden();
  if (vorgang.version !== erwartet) return versionskonflikt();

  const darfFreigeben = await istZugfuehrung(umgebung, identitaet.email);
  const ablehnung = pruefeStufenwechsel(vorgang, wert['nach'], darfFreigeben);
  if (ablehnung) return fehlerAntwort(ablehnung.code, ablehnung.nachricht, ablehnung.status);

  const nach = wert['nach'] as number;
  const jetzt = new Date().toISOString();
  const ergebnisse = await db.batch([
    db
      .prepare(
        `UPDATE vorgaenge
         SET stufe = ?, geplant_am = ?, abgeschlossen_am = ?, geaendert_am = ?, geaendert_von = ?,
             version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(nach, null, nach === 5 ? jetzt : null, jetzt, identitaet.email, vorgangId, erwartet),
    ereignis(
      db,
      vorgangId,
      identitaet.email,
      nach > vorgang.stufe
        ? `Stufe erreicht: ${VORGANG_STUFEN[nach]}.`
        : `Zurück auf Stufe: ${VORGANG_STUFEN[nach]}.`,
    ),
  ]);
  if ((ergebnisse[0]?.meta.changes ?? 0) === 0) return versionskonflikt();
  const darstellung = await baueVorgangsdarstellung(db, vorgangId);
  if (!darstellung) return nichtGefunden();
  return jsonAntwort(darstellung.inhalt, 200, { ETag: starkesEtag(darstellung.version) });
}
