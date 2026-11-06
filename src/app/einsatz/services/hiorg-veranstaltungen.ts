import type { HiorgArt, HiorgEintrag } from '../../ausbildung/models/hiorg-kalender.model';
import type { HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';

/** Monate, die der Feed ab dem laufenden Monat nach vorn abgefragt wird (Fenster: 12 Monate). */
export const VORAUS_MONATE = 11;
/** Monate, die der Feed ab dem laufenden Monat zurück abgefragt wird. */
export const ZURUECK_MONATE = 6;

/** `JJJJ-MM` des Monats, der `abstand` Monate vom Monat des ISO-Datums `heute` entfernt liegt. */
export function monatMitAbstand(heute: string, abstand: number): string {
  const monate = Number(heute.slice(0, 4)) * 12 + (Number(heute.slice(5, 7)) - 1) + abstand;
  const jahr = Math.floor(monate / 12);
  const monat = (monate % 12) + 1;
  return `${jahr}-${String(monat).padStart(2, '0')}`;
}

/** Zulässiges Zeichenmuster von `Einsatz.hiorgVeranstaltungId`. */
const UNZULAESSIG = /[^A-Za-z0-9_-]/g;

/**
 * Schlüssel der Veranstaltung, mit dem ein Einsatz auf sie verweist. Die Art gehört dazu, weil
 * Dienste und Termine im Feed getrennte Id-Räume haben könnten.
 */
export function veranstaltungsId(art: HiorgArt, feedId: string): string {
  return `${art}-${feedId.replace(UNZULAESSIG, '_')}`.slice(0, 64);
}

/** Art aus einer gespeicherten Veranstaltungs-Id; `null` bei Altbestand ohne Art-Präfix. */
export function artAusVeranstaltungsId(id: string | null): HiorgArt | null {
  if (id === null) return null;
  if (id.startsWith('dienst-')) return 'dienst';
  if (id.startsWith('termin-')) return 'termin';
  return null;
}

function beginnLokal(eintrag: HiorgEintrag): string {
  return `${eintrag.beginn}T${eintrag.beginnZeit || '00:00'}`;
}

function endeLokal(eintrag: HiorgEintrag): string {
  return `${eintrag.ende}T${eintrag.endeZeit || '23:59'}`;
}

/**
 * Führt Feed-Einträge zu Veranstaltungen zusammen (gleiche Art und `id` → eine Veranstaltung mit
 * mehreren Schichten). Doppelte Einträge, die sich auch in der `schluessel` gleichen – etwa durch
 * die überlappenden Abrufe nach vorn und zurück –, zählen nur einmal. Ergebnis nach Beginn.
 */
export function gruppiereVeranstaltungen(eintraege: readonly HiorgEintrag[]): HiorgVeranstaltung[] {
  const gesehen = new Set<string>();
  const jeId = new Map<string, HiorgEintrag[]>();
  for (const eintrag of eintraege) {
    if (gesehen.has(eintrag.schluessel)) continue;
    gesehen.add(eintrag.schluessel);
    const id = veranstaltungsId(eintrag.art, eintrag.id);
    const liste = jeId.get(id);
    if (liste) liste.push(eintrag);
    else jeId.set(id, [eintrag]);
  }

  const ergebnis: HiorgVeranstaltung[] = [];
  for (const [id, liste] of jeId) {
    const schichten = [...liste].sort((a, b) => beginnLokal(a).localeCompare(beginnLokal(b)));
    const letzte = schichten.reduce((a, b) => (endeLokal(b) > endeLokal(a) ? b : a));
    ergebnis.push({
      veranstaltungId: id,
      art: schichten[0].art,
      titel: schichten[0].name,
      beginn: beginnLokal(schichten[0]),
      ende: endeLokal(letzte),
      schichten,
    });
  }
  return ergebnis.sort((a, b) => a.beginn.localeCompare(b.beginn));
}
