import {
  Jahresblatt,
  KATEGORIEN,
  KatsThema,
  NACHWEIS_KEYS,
  TERMIN_TYPEN,
  Termin,
} from '../models/plan.model';
import { GespeichertesJahr, KalenderStand } from './kalender-storage';

/**
 * Prüft die Worker-Antwort, bevor sie ins Domänenmodell gelangt (CLAUDE.md:
 * unbekannte externe Daten prüfen, keine ungeprüften Casts). Der Worker prüft
 * beim Schreiben dieselben Regeln; hier genügt die Typform.
 */
type Objekt = Record<string, unknown>;

function istObjekt(wert: unknown): wert is Objekt {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

function istTextOderNull(wert: unknown): wert is string | null {
  return wert === null || istText(wert);
}

const TEXTFELDER = [
  'id',
  'beginnZeit',
  'endeZeit',
  'hinweis',
  'thema',
  'ausbilder',
  'katsTitel',
  'hgmInhalt',
  'hgmTitel',
  'material',
  'anforderungen',
  'notizen',
] as const;

export function istTermin(wert: unknown): wert is Termin {
  if (!istObjekt(wert)) return false;
  if (!TEXTFELDER.every((feld) => istText(wert[feld]))) return false;
  const kategorie = wert['kategorie'];
  const typ = wert['typ'];
  const nachweise = wert['nachweise'];
  return (
    istTextOderNull(wert['datum']) &&
    istTextOderNull(wert['datumBis']) &&
    istTextOderNull(wert['katsThemaId']) &&
    typeof wert['katsPflicht'] === 'boolean' &&
    (kategorie === '' || (KATEGORIEN as readonly unknown[]).includes(kategorie)) &&
    (TERMIN_TYPEN as readonly unknown[]).includes(typ) &&
    Array.isArray(nachweise) &&
    nachweise.every((n) => (NACHWEIS_KEYS as readonly unknown[]).includes(n))
  );
}

function istKatsThema(wert: unknown): wert is KatsThema {
  return (
    istObjekt(wert) &&
    istText(wert['id']) &&
    istText(wert['nummer']) &&
    istText(wert['titel']) &&
    istText(wert['beschreibung']) &&
    typeof wert['pflicht'] === 'boolean'
  );
}

function alsVersion(wert: unknown): string | null {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= 1 ? `"${wert}"` : null;
}

function leseJahr(wert: unknown): GespeichertesJahr | null {
  if (!istObjekt(wert)) return null;
  const { jahr, titel, termine, ideen, katsThemen } = wert;
  const version = alsVersion(wert['version']);
  if (
    typeof jahr !== 'number' ||
    !Number.isInteger(jahr) ||
    !istText(titel) ||
    !Array.isArray(termine) ||
    !termine.every(istTermin) ||
    !Array.isArray(ideen) ||
    !ideen.every(istTermin) ||
    !Array.isArray(katsThemen) ||
    !katsThemen.every(istKatsThema) ||
    !version
  ) {
    return null;
  }
  const blatt: Jahresblatt = { jahr, titel, termine, ideen, katsThemen };
  return { blatt, version };
}

/** Liest `GET /api/kalender` bzw. die Migrationsantwort; `null` bei ungültiger Form. */
export function leseKalenderStand(wert: unknown): KalenderStand | null {
  if (!istObjekt(wert) || !Array.isArray(wert['jahre'])) return null;
  const jahre: GespeichertesJahr[] = [];
  for (const eintrag of wert['jahre']) {
    const jahr = leseJahr(eintrag);
    if (!jahr) return null;
    jahre.push(jahr);
  }
  return { jahre };
}
