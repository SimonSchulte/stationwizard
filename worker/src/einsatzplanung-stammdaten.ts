import { fehlerAntwort } from './antwort';
import { istNichtleererText, istObjekt, istText, UUID_REGEX } from './json-lesen';

/**
 * Gemeinsames der Stammdaten Lager und Artikel (Konzept `docs/konzept-packeinheiten.md`):
 * Grenzen, Vergleichsform, Eingabeprüfung und feste Fehlercodes.
 */

export const STAMMDATEN_KOERPER_GRENZE = 8 * 1024;
export const MAX_LAGER = 100;
export const MAX_ARTIKEL = 2000;
export const NAME_MAX = 100;
export const MAX_KISTEN = 300;
export const MAX_KISTEN_POSITIONEN = 100;
export const BEMERKUNG_MAX = 200;
export const MENGE_MAX = 1_000_000;
/** Eine Kiste mit 100 Positionen bleibt weit unter dieser Grenze. */
export const KISTEN_KOERPER_GRENZE = 64 * 1024;

/** Feste Mengeneinheiten eines Artikels; gemeinsam mit `src/app/einsatz/models/stammdaten.model.ts` ändern. */
export const ARTIKEL_EINHEITEN: ReadonlySet<string> = new Set([
  'Stück',
  'Liter',
  'Packung',
  'Kiste',
  'Flasche',
  'Rolle',
  'Satz',
  'Paar',
  'Meter',
  'Kilogramm',
]);

/** Name ohne Randleerzeichen und mit einfachen Leerzeichen, wie er gespeichert wird. */
export function bereinigterName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Vergleichsform: wie `bereinigterName`, dazu ohne Groß-/Kleinschreibung. */
export function namenVergleich(name: string): string {
  return bereinigterName(name).toLocaleLowerCase('de');
}

function nurFelder(wert: Record<string, unknown>, erlaubt: readonly string[]): boolean {
  return Object.keys(wert).every((schluessel) => erlaubt.includes(schluessel));
}

export interface LagerEingabe {
  id: string;
  name: string;
}

export function pruefeLagerEingabe(wert: unknown): LagerEingabe | null {
  if (!istObjekt(wert) || !nurFelder(wert, ['id', 'name'])) return null;
  if (!istNichtleererText(wert['id']) || !UUID_REGEX.test(wert['id'])) return null;
  if (!istText(wert['name'])) return null;
  const name = bereinigterName(wert['name']);
  if (name === '' || name.length > NAME_MAX) return null;
  return { id: wert['id'].toLowerCase(), name };
}

export interface ArtikelEingabe {
  id: string;
  name: string;
  einheit: string;
  lagerId: string | null;
}

export function pruefeArtikelEingabe(wert: unknown): ArtikelEingabe | null {
  if (!istObjekt(wert) || !nurFelder(wert, ['id', 'name', 'einheit', 'lagerId'])) return null;
  if (!istNichtleererText(wert['id']) || !UUID_REGEX.test(wert['id'])) return null;
  if (!istText(wert['name'])) return null;
  const name = bereinigterName(wert['name']);
  if (name === '' || name.length > NAME_MAX) return null;
  if (!istText(wert['einheit']) || !ARTIKEL_EINHEITEN.has(wert['einheit'])) return null;
  const lagerId = wert['lagerId'];
  if (lagerId !== null && (!istNichtleererText(lagerId) || !UUID_REGEX.test(lagerId))) return null;
  return {
    id: wert['id'].toLowerCase(),
    name,
    einheit: wert['einheit'],
    lagerId: lagerId === null ? null : lagerId.toLowerCase(),
  };
}

export function stammdatenNameVergeben(nachricht: string): Response {
  return fehlerAntwort('EINSATZPLANUNG_NAME_VERGEBEN', nachricht, 409);
}

export function stammdatenInNutzung(nachricht: string): Response {
  return fehlerAntwort('EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG', nachricht, 409);
}

export function stammdatenGrenze(nachricht: string): Response {
  return fehlerAntwort('EINSATZPLANUNG_GRENZE_ERREICHT', nachricht, 409);
}

/** Eindeutigkeitsverletzung des Namens (Index `name_vergleich`) statt der Kennung. */
export function istNamensKollision(ursache: unknown): boolean {
  return (
    ursache instanceof Error &&
    ursache.message.includes('UNIQUE') &&
    ursache.message.includes('name_vergleich')
  );
}

export function istFremdschluesselFehler(ursache: unknown): boolean {
  return ursache instanceof Error && ursache.message.includes('FOREIGN KEY');
}

export function istKennungsKollision(ursache: unknown): boolean {
  return (
    ursache instanceof Error &&
    ursache.message.includes('UNIQUE') &&
    !ursache.message.includes('name_vergleich')
  );
}

export interface KistenPositionEingabe {
  artikelId: string;
  menge: number;
  bemerkung: string;
}

export interface KisteEingabe {
  id: string;
  name: string;
  lagerId: string | null;
  inhalt: KistenPositionEingabe[];
}

/** Menge: Zahl größer 0, höchstens drei Nachkommastellen, nicht über `MENGE_MAX`. */
export function istMenge(wert: unknown): wert is number {
  if (typeof wert !== 'number' || !Number.isFinite(wert) || wert <= 0 || wert > MENGE_MAX) {
    return false;
  }
  const tausendstel = wert * 1000;
  return Math.abs(tausendstel - Math.round(tausendstel)) < 1e-6;
}

export function pruefeKisteEingabe(wert: unknown): KisteEingabe | null {
  if (!istObjekt(wert) || !nurFelder(wert, ['id', 'name', 'lagerId', 'inhalt'])) return null;
  if (!istNichtleererText(wert['id']) || !UUID_REGEX.test(wert['id'])) return null;
  if (!istText(wert['name'])) return null;
  const name = bereinigterName(wert['name']);
  if (name === '' || name.length > NAME_MAX) return null;
  const lagerId = wert['lagerId'];
  if (lagerId !== null && (!istNichtleererText(lagerId) || !UUID_REGEX.test(lagerId))) return null;
  const inhalt = wert['inhalt'];
  if (!Array.isArray(inhalt) || inhalt.length > MAX_KISTEN_POSITIONEN) return null;
  const gesehen = new Set<string>();
  const positionen: KistenPositionEingabe[] = [];
  for (const eintrag of inhalt) {
    if (!istObjekt(eintrag) || !nurFelder(eintrag, ['artikelId', 'menge', 'bemerkung']))
      return null;
    const artikelId = eintrag['artikelId'];
    if (!istNichtleererText(artikelId) || !UUID_REGEX.test(artikelId)) return null;
    if (!istMenge(eintrag['menge'])) return null;
    const bemerkung = eintrag['bemerkung'];
    if (!istText(bemerkung) || bemerkung.length > BEMERKUNG_MAX) return null;
    const schluessel = artikelId.toLowerCase();
    if (gesehen.has(schluessel)) return null;
    gesehen.add(schluessel);
    positionen.push({
      artikelId: schluessel,
      menge: eintrag['menge'],
      bemerkung: bemerkung.trim(),
    });
  }
  return {
    id: wert['id'].toLowerCase(),
    name,
    lagerId: lagerId === null ? null : lagerId.toLowerCase(),
    inhalt: positionen,
  };
}
