import { dekodiereKopfzeile, MAIL_GROESSE_MAX, SAMMELPOSTFACH } from './postfach-gemeinsam';
import type { VorgaengeKonfiguration } from './vorgaenge-gemeinsam';

/**
 * Eingehende Mail (Cloudflare Email Routing, Catch-all → Worker, `email()`-Handler in `index.ts`).
 * Der Handler tut bewusst fast nichts: Größe prüfen, die Rohmail unverändert in R2 legen, eine Zeile
 * anlegen. Geparst wird im Browser (`postal-mime`), weil die CPU-Zeit des Free-Tarifs dafür nicht
 * reicht. Eine Mail ist nie eine Quelle für Kennzahlen oder Stufen, nur eine Liste zum Ansehen.
 */
export interface EingehendeMail {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly rawSize: number;
  readonly raw: ReadableStream<Uint8Array>;
  setReject(grund: string): void;
}

const KOPF_MAX = 300;

export async function verarbeiteEingehendeMail(
  mail: EingehendeMail,
  umgebung: VorgaengeKonfiguration,
): Promise<void> {
  const db = umgebung.FAHRZEUGE_DB;
  const bucket = umgebung.VORGAENGE_DATEIEN;
  if (!db || !bucket) {
    // Noch nicht eingerichtet: lieber ablehnen als annehmen und verlieren.
    mail.setReject('Das Postfach ist noch nicht eingerichtet.');
    return;
  }
  if (mail.rawSize > MAIL_GROESSE_MAX) {
    mail.setReject('Die Nachricht ist zu groß.');
    return;
  }

  const lokal = (mail.to.split('@')[0] ?? '').trim().toLowerCase();
  let fahrzeugId: string | null = null;
  if (lokal && lokal !== SAMMELPOSTFACH) {
    const treffer = await db
      .prepare('SELECT fahrzeug_id FROM postfach_adressen WHERE kuerzel = ?')
      .bind(lokal)
      .first<{ fahrzeug_id: string }>();
    fahrzeugId = treffer?.fahrzeug_id ?? null;
  }

  const roh = new Uint8Array(await new Response(mail.raw).arrayBuffer());
  const id = crypto.randomUUID();
  const schluessel = `postfach/${id}.eml`;
  const messageId = (mail.headers.get('message-id') ?? '').trim().slice(0, 300) || `ohne-${id}`;
  const betreff = dekodiereKopfzeile(mail.headers.get('subject') ?? '').slice(0, KOPF_MAX);

  // Doppelzustellung: dieselbe Message-ID nicht noch einmal anlegen, die Rohmail gar nicht erst speichern.
  const vorhanden = await db
    .prepare('SELECT id FROM postfach_mails WHERE message_id = ?')
    .bind(messageId)
    .first<{ id: string }>();
  if (vorhanden) return;

  await bucket.put(schluessel, roh, { httpMetadata: { contentType: 'message/rfc822' } });
  try {
    await db
      .prepare(
        `INSERT INTO postfach_mails
           (id, message_id, empfangen_am, absender, betreff, empfaenger, fahrzeug_id, groesse, r2_schluessel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        messageId,
        new Date().toISOString(),
        mail.from.slice(0, KOPF_MAX),
        betreff,
        mail.to.slice(0, KOPF_MAX),
        fahrzeugId,
        roh.byteLength,
        schluessel,
      )
      .run();
  } catch (ursache) {
    await bucket.delete(schluessel);
    // Ein Rennen mit derselben Message-ID ist kein Fehler.
    if (ursache instanceof Error && ursache.message.includes('UNIQUE')) return;
    throw ursache;
  }
}
