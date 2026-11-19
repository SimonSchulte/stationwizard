import { lagerSchluessel } from './lager';

/**
 * Unscharfer Namensvergleich für Zuordnungen (Packlisten-Import): „Drehstromkabeltrommel 400V“ soll
 * „Drehstromkabeltrommeln 400V“ finden, „Küchenlager“ das „Lager Küche“. Reine Berechnung, kein Zustand.
 */

const FUELLWOERTER = new Set([
  'in',
  'im',
  'mit',
  'ohne',
  'und',
  'oder',
  'fur',
  'der',
  'die',
  'das',
  'aus',
  'von',
  'vom',
  'zu',
  'am',
]);

/** Kleinschreibung, ohne Umlaute und Satzzeichen, Plural-/Endungen abgeschnitten. */
function stamm(wort: string): string {
  let w = wort;
  for (const ende of ['ern', 'en', 'er', 'es', 'n', 'e', 's']) {
    if (w.length > ende.length + 3 && w.endsWith(ende)) {
      w = w.slice(0, -ende.length);
      break;
    }
  }
  return w;
}

function rohTeile(name: string): string[] {
  return lagerSchluessel(name)
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== '' && !FUELLWOERTER.has(t));
}

export function namensTeile(name: string): string[] {
  return rohTeile(name).map(stamm);
}

function trigramme(text: string): Set<string> {
  const gepolstert = `  ${text} `;
  const menge = new Set<string>();
  for (let i = 0; i + 3 <= gepolstert.length; i += 1) menge.add(gepolstert.slice(i, i + 3));
  return menge;
}

/** Ähnlichkeit 0 … 1; 1 bei gleicher Stammform, hoch, wenn alle Teile des einen im anderen vorkommen. */
export function aehnlichkeit(a: string, b: string): number {
  const ta = namensTeile(a);
  const tb = namensTeile(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const ga = ta.join('');
  const gb = tb.join('');
  if (ga === gb) return 1;
  // Enthalten: jeder (leicht gekürzte) Teil des einen Namens steht irgendwo im anderen („Küchenlager“ – „Lager Küche“).
  const enthalten = (roh: string[], gesamt: string): boolean =>
    roh.every((t) => t.length >= 2 && gesamt.includes(t.length >= 5 ? t.slice(0, -1) : t)) &&
    roh.join('').length >= 4;
  const ra = rohTeile(a);
  const rb = rohTeile(b);
  if (enthalten(ra, rb.join('')) || enthalten(rb, ra.join(''))) return 0.85;
  const x = trigramme(ga);
  const y = trigramme(gb);
  let gemeinsam = 0;
  for (const t of x) if (y.has(t)) gemeinsam += 1;
  return (2 * gemeinsam) / (x.size + y.size);
}

/** Schwelle, ab der ein Treffer vorbelegt wird; darunter bleibt es bei einer Rangfolge der Vorschläge. */
export const VORBELEGUNG_AB = 0.7;

/** Bester Eintrag mit mindestens `VORBELEGUNG_AB`; bei Gleichstand der erste. */
export function besterTreffer<T extends { name: string }>(
  name: string,
  kandidaten: readonly T[],
): T | undefined {
  let bester: T | undefined;
  let punkte = 0;
  for (const k of kandidaten) {
    const p = aehnlichkeit(name, k.name);
    if (p > punkte) {
      punkte = p;
      bester = k;
    }
  }
  return punkte >= VORBELEGUNG_AB ? bester : undefined;
}
