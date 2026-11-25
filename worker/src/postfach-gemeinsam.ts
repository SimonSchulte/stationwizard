import { fehlerAntwort } from './antwort';
import { freigabeGruppen, leseRolle } from './rollen';
import type { VorgaengeKonfiguration } from './vorgaenge-gemeinsam';

/** Name des Sammelpostfachs: Mails an unbekannte Adressen landen dort. */
export const SAMMELPOSTFACH = 'angebote';
/** Namen, die keine Fahrzeugadresse sein dürfen (Mailkonventionen und der Sammelkorb). */
export const RESERVIERTE_ADRESSEN: ReadonlySet<string> = new Set([
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

/** Lokaler Teil einer Fahrzeugadresse: 2 bis 40 Zeichen aus `a-z0-9-`, Rand ohne Bindestrich. */
export const ADRESSE_MUSTER = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;

/** Rohmails bleiben höchstens so lange liegen, wenn sie niemand bearbeitet. */
export const AUFBEWAHRUNG_TAGE = 30;
export const MAIL_GROESSE_MAX = 25 * 1024 * 1024;
export const ANGEBOT_GROESSE_MAX = 10 * 1024 * 1024;
export const ANGEBOTE_JE_VORGANG_MAX = 10;
export const NOTIZ_TEXT_MAX = 2000;

/** Aus einem Text den lokalen Teil einer Adresse: kleingeschrieben, Umlaute aufgelöst, nur `a-z0-9-`. */
export function adresseAusText(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Funkrufnamen beginnen mit der Ortskennzahl „72“ (auch „JUH BI 72“); sie gehört nicht in die Adresse. */
export function funkrufOhneKennzahl(funkrufname: string): string {
  return funkrufname.trim().replace(/^(?:juh\s+bi\s+)?72\s+/i, '');
}

export type AdressArt = 'kennzeichen' | 'funkruf';

export interface FahrzeugAdressen {
  fahrzeugId: string;
  fahrzeugBezeichnung: string;
  /** Nur gültige, eindeutige Adressen (lokaler Teil, ohne Domain). */
  adressen: { art: AdressArt; lokal: string }[];
}

export interface AdressQuelle {
  id: string;
  bezeichnung: string;
  kennzeichen: string;
  funkrufname: string;
}

/**
 * Leitet je Fahrzeug die Adressen aus Kennzeichen und Funkrufname ab. Nichts davon wird gespeichert:
 * ändert sich ein Kennzeichen, ändert sich die Adresse mit. Eine Adresse, die ungültig oder reserviert
 * ist oder mehreren Fahrzeugen zugleich zustünde, wird weggelassen, statt eine Mail falsch zuzuordnen.
 */
export function leiteAdressenAb(fahrzeuge: readonly AdressQuelle[]): FahrzeugAdressen[] {
  const kandidaten = fahrzeuge.map((f) => ({
    fahrzeug: f,
    adressen: [
      { art: 'kennzeichen' as const, lokal: adresseAusText(f.kennzeichen) },
      { art: 'funkruf' as const, lokal: adresseAusText(funkrufOhneKennzahl(f.funkrufname)) },
    ].filter((a) => ADRESSE_MUSTER.test(a.lokal) && !RESERVIERTE_ADRESSEN.has(a.lokal)),
  }));
  const besitzer = new Map<string, Set<string>>();
  for (const k of kandidaten) {
    for (const a of k.adressen) {
      besitzer.set(a.lokal, (besitzer.get(a.lokal) ?? new Set()).add(k.fahrzeug.id));
    }
  }
  return kandidaten.map((k) => {
    const gesehen = new Set<string>();
    return {
      fahrzeugId: k.fahrzeug.id,
      fahrzeugBezeichnung: k.fahrzeug.bezeichnung,
      adressen: k.adressen.filter((a) => {
        // Mehrere Fahrzeuge oder zweimal dieselbe Adresse am selben Fahrzeug (Kennzeichen = Funkruf).
        if ((besitzer.get(a.lokal)?.size ?? 0) !== 1 || gesehen.has(a.lokal)) return false;
        gesehen.add(a.lokal);
        return true;
      }),
    };
  });
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
