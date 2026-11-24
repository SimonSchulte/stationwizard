import { fehlerAntwort } from './antwort';
import { freigabeGruppen, leseRolle } from './rollen';
import type { VorgaengeKonfiguration } from './vorgaenge-gemeinsam';

/** Name des Sammelpostfachs: Mails an unbekannte Adressen landen dort. */
export const SAMMELPOSTFACH = 'angebote';
/** Namen, die kein Fahrzeugkürzel sein dürfen (Mailkonventionen und der Sammelkorb). */
export const RESERVIERTE_KUERZEL: ReadonlySet<string> = new Set([
  SAMMELPOSTFACH,
  'postmaster',
  'abuse',
  'admin',
  'noreply',
  'no-reply',
  'info',
  'www',
  'mail',
  'send',
  'rsend',
]);

export const KUERZEL_MUSTER = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/;

/** Rohmails bleiben höchstens so lange liegen, wenn sie niemand bearbeitet. */
export const AUFBEWAHRUNG_TAGE = 30;
export const MAIL_GROESSE_MAX = 25 * 1024 * 1024;
export const ANGEBOT_GROESSE_MAX = 10 * 1024 * 1024;
export const ANGEBOTE_JE_VORGANG_MAX = 10;
export const NOTIZ_TEXT_MAX = 2000;

/** Aus einer Bezeichnung ein Kürzel: kleingeschrieben, Umlaute aufgelöst, nur `a-z0-9-`. */
export function kuerzelAusBezeichnung(bezeichnung: string): string {
  const grund = bezeichnung
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
    .replace(/-+$/g, '');
  return grund.length >= 2 ? grund : 'fahrzeug';
}

export function istGueltigesKuerzel(wert: string): boolean {
  return KUERZEL_MUSTER.test(wert) && !RESERVIERTE_KUERZEL.has(wert);
}

export interface PostfachSicht {
  /** Mails ohne Fahrzeug (Sammelpostfach) sieht nur die Zugführung. */
  sammel: boolean;
  /** Fahrzeuggruppen, deren Mails sichtbar sind. */
  gruppen: readonly string[];
}

/**
 * Wer das Postfach sehen und bearbeiten darf: die Zugführung für alle Fahrzeuge, eine Gruppenführung
 * für die Fahrzeuge der eigenen Gruppe (gleiche Regel wie bei den Freigaben, `rollen.ts`). Ohne Rolle
 * oder ohne Konfiguration sieht niemand etwas.
 */
export async function ermittlePostfachSicht(
  umgebung: VorgaengeKonfiguration,
  email: string,
): Promise<PostfachSicht | Response> {
  if (!umgebung.BENUTZER_DB) {
    return fehlerAntwort(
      'ROLLEN_KONFIGURATION_FEHLT',
      'Die Rollenverwaltung ist noch nicht eingerichtet.',
      503,
    );
  }
  const zuordnung = await leseRolle(umgebung.BENUTZER_DB, email);
  const rolle = zuordnung?.rolle ?? null;
  return { sammel: rolle === 'zugfuehrung', gruppen: freigabeGruppen(rolle) };
}

/** SQL-Bedingung und Werte für die sichtbaren Mails (`m` = postfach_mails, `f` = fahrzeuge). */
export function sichtBedingung(sicht: PostfachSicht): { sql: string; werte: string[] } {
  const teile: string[] = [];
  if (sicht.sammel) teile.push('m.fahrzeug_id IS NULL');
  if (sicht.gruppen.length > 0) {
    teile.push(`f.gruppe IN (${sicht.gruppen.map(() => '?').join(', ')})`);
  }
  return teile.length === 0
    ? { sql: '0', werte: [] }
    : { sql: `(${teile.join(' OR ')})`, werte: [...sicht.gruppen] };
}

/** Entschlüsselt RFC-2047-Wörter (`=?utf-8?B?…?=`, `=?iso-8859-1?Q?…?=`) in Kopfzeilen. */
export function dekodiereKopfzeile(wert: string): string {
  return wert
    .replace(
      /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
      (_gesamt, zeichensatz: string, art: string, text: string) => {
        try {
          let bytes: Uint8Array;
          if (art.toLowerCase() === 'b') {
            bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
          } else {
            const roh = text
              .replaceAll('_', ' ')
              .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
              );
            bytes = Uint8Array.from(roh, (c) => c.charCodeAt(0));
          }
          return new TextDecoder(zeichensatz.toLowerCase()).decode(bytes);
        } catch {
          return text;
        }
      },
    )
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}
