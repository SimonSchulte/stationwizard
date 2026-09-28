import { istObjekt, istText } from './json-lesen';

/**
 * Fachlogik des Fahrzeugchecks, bewusst ohne Datenbank und ohne `Response`:
 * so ist sie vollständig ohne Attrappe prüfbar, und dieselben Regeln gelten
 * für den angemeldeten und den öffentlichen Weg.
 */

/** Verfallsdatum als Monat, `YYYY-MM`. Ein Tag wäre eine Scheingenauigkeit. */
const MONAT_MUSTER = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Ab wann ein Verfallsdatum als "läuft bald ab" gilt. */
export const WARNFRIST_TAGE = 90;

export type VerfallsdatumStatus = 'keines' | 'ok' | 'laeuft-ab' | 'abgelaufen';

/**
 * Ein Monatsdatum gilt bis zum **letzten Tag** des Monats. Gerechnet wird gegen
 * den Berliner Kalendertag als `YYYY-MM-DD`, nicht gegen eine UTC-Zeit: sonst
 * kippte der Status je nach Uhrzeit um einen Tag.
 */
export function verfallsdatumStatus(monat: string | null, heute: string): VerfallsdatumStatus {
  if (monat === null || monat === '') return 'keines';
  const treffer = MONAT_MUSTER.exec(monat);
  if (!treffer) return 'keines';
  const jahr = Number(treffer[1]);
  const monatszahl = Number(treffer[2]);
  // Tag 0 des Folgemonats ist der letzte Tag des gesuchten Monats.
  const monatsende = Date.UTC(jahr, monatszahl, 0);
  const [hj, hm, ht] = heute.split('-').map(Number);
  const heuteZahl = Date.UTC(hj ?? 0, (hm ?? 1) - 1, ht ?? 1);
  const tage = Math.round((monatsende - heuteZahl) / 86_400_000);
  if (tage < 0) return 'abgelaufen';
  if (tage <= WARNFRIST_TAGE) return 'laeuft-ab';
  return 'ok';
}

export function istMonatsformat(wert: unknown): wert is string {
  return istText(wert) && MONAT_MUSTER.test(wert);
}

/** Artikel der Vorlage, so weit der Check ihn braucht. */
export interface VorlagenArtikel {
  id: string;
  bezeichnung: string;
  sollMenge: number;
  einheit: string;
  herkunft: string;
  verfallsdatumPflicht: boolean;
}

export interface VorlagenFach {
  id: string;
  bezeichnung: string;
  artikel: VorlagenArtikel[];
}

/** Was der Client je Position schickt – bewusst wenig. */
interface PositionEingabe {
  artikelId: string;
  geprueft: boolean;
  istMenge: number;
  unbrauchbar: boolean;
  verfallsdaten: (string | null)[];
}

/**
 * Was gespeichert wird: die Eingabe **plus** die Momentaufnahme aus der
 * Vorlage. Bezeichnung, Sollmenge, Einheit und Herkunft kommen ausschließlich
 * aus der gespeicherten Vorlage, nie aus dem Anfragekörper – sonst könnte ein
 * Client sich ein beliebiges Soll zusammenstellen und der Bericht wäre wertlos.
 */
export interface Checkposition extends PositionEingabe {
  fachId: string;
  fach: string;
  bezeichnung: string;
  sollMenge: number;
  einheit: string;
  herkunft: string;
  verfallsdatumPflicht: boolean;
}

export interface Kennzahlen {
  gesamt: number;
  geprueft: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
  laeuftAb: number;
}

const ISTMENGE_MAX = 9999;

function pruefePositionEingabe(wert: unknown): PositionEingabe | null {
  if (
    !istObjekt(wert) ||
    !istText(wert['artikelId']) ||
    typeof wert['geprueft'] !== 'boolean' ||
    typeof wert['istMenge'] !== 'number' ||
    !Number.isInteger(wert['istMenge']) ||
    wert['istMenge'] < 0 ||
    wert['istMenge'] > ISTMENGE_MAX ||
    typeof wert['unbrauchbar'] !== 'boolean' ||
    !Array.isArray(wert['verfallsdaten'])
  ) {
    return null;
  }
  const verfallsdaten: (string | null)[] = [];
  for (const eintrag of wert['verfallsdaten']) {
    if (eintrag === null || eintrag === '') verfallsdaten.push(null);
    else if (istMonatsformat(eintrag)) verfallsdaten.push(eintrag);
    else return null;
  }
  return {
    artikelId: wert['artikelId'],
    geprueft: wert['geprueft'],
    istMenge: wert['istMenge'],
    unbrauchbar: wert['unbrauchbar'],
    verfallsdaten,
  };
}

export type PositionenFehler =
  | 'unlesbar'
  | 'unbekannter-artikel'
  | 'artikel-doppelt'
  | 'artikel-fehlt'
  | 'stueckzahl-passt-nicht';

/**
 * Prüft die eingereichten Positionen gegen die gespeicherte Vorlage. Sie müssen
 * **genau** deren Artikel abdecken – jeden einmal, keinen zusätzlich, keinen
 * weniger. Ein Check mit einer fremden oder fehlenden Position wäre kein
 * Nachweis über diesen Behälter.
 */
export function pruefePositionen(
  wert: unknown,
  faecher: readonly VorlagenFach[],
): { positionen: Checkposition[] } | { fehler: PositionenFehler } {
  if (!Array.isArray(wert)) return { fehler: 'unlesbar' };

  const nachId = new Map<string, { fach: VorlagenFach; artikel: VorlagenArtikel }>();
  for (const fach of faecher) {
    for (const artikel of fach.artikel) nachId.set(artikel.id, { fach, artikel });
  }

  const gesehen = new Set<string>();
  const positionen: Checkposition[] = [];
  for (const roh of wert) {
    const eingabe = pruefePositionEingabe(roh);
    if (!eingabe) return { fehler: 'unlesbar' };
    const treffer = nachId.get(eingabe.artikelId);
    if (!treffer) return { fehler: 'unbekannter-artikel' };
    if (gesehen.has(eingabe.artikelId)) return { fehler: 'artikel-doppelt' };
    gesehen.add(eingabe.artikelId);
    // Ein Verfallsdatum je Stück: die Liste muss genau so lang sein wie das
    // Soll, sonst ließe sich nicht sagen, welches Stück gemeint ist.
    if (eingabe.verfallsdaten.length !== treffer.artikel.sollMenge) {
      return { fehler: 'stueckzahl-passt-nicht' };
    }
    positionen.push({
      ...eingabe,
      fachId: treffer.fach.id,
      fach: treffer.fach.bezeichnung,
      bezeichnung: treffer.artikel.bezeichnung,
      sollMenge: treffer.artikel.sollMenge,
      einheit: treffer.artikel.einheit,
      herkunft: treffer.artikel.herkunft,
      verfallsdatumPflicht: treffer.artikel.verfallsdatumPflicht,
    });
  }

  if (gesehen.size !== nachId.size) return { fehler: 'artikel-fehlt' };
  return { positionen };
}

/**
 * Die Kennzahlen entstehen ausschließlich hier, nie aus einer Client-Angabe –
 * dieselbe Linie wie bei `erfasstVon`/`erfasstAm` und der Beschreibung im
 * Änderungsprotokoll.
 */
export function zaehleKennzahlen(positionen: readonly Checkposition[], heute: string): Kennzahlen {
  let geprueft = 0;
  let fehlmengen = 0;
  let unbrauchbar = 0;
  let abgelaufen = 0;
  let laeuftAb = 0;
  for (const position of positionen) {
    if (position.geprueft) geprueft += 1;
    if (position.istMenge < position.sollMenge) fehlmengen += 1;
    if (position.unbrauchbar) unbrauchbar += 1;
    for (const datum of position.verfallsdaten) {
      const status = verfallsdatumStatus(datum, heute);
      if (status === 'abgelaufen') abgelaufen += 1;
      else if (status === 'laeuft-ab') laeuftAb += 1;
    }
  }
  return { gesamt: positionen.length, geprueft, fehlmengen, unbrauchbar, abgelaufen, laeuftAb };
}

/** Obergrenze für die Bemerkung eines Entwurfs; wie beim fertigen Check. */
const ENTWURF_BEMERKUNG_MAX = 2000;

/** Der Zwischenstand, wie er in `check_entwuerfe.inhalt` liegt. */
export interface Entwurf {
  verfallsdatumErfasst: boolean;
  bemerkung: string;
  positionen: Record<string, PositionEingabe>;
}

export type EntwurfFehler = 'unlesbar' | 'unbekannter-artikel' | 'stueckzahl-passt-nicht';

/**
 * Prüft einen Zwischenstand gegen die gespeicherte Vorlage.
 *
 * Bewusst **laxer** als `pruefePositionen()`: ein Entwurf ist unfertig, also
 * darf er nicht jeden Artikel der Vorlage enthalten müssen. Streng bleibt, was
 * die Zuordnung sichert – jede genannte Artikel-Id muss es in der Vorlage
 * geben, und die Liste der Verfallsdaten muss zur Sollmenge passen. Eine
 * unbekannte Id wird abgewiesen, bevor irgendetwas geschrieben wird.
 *
 * Es entsteht hier **keine** Momentaufnahme aus der Vorlage: ein Entwurf ist
 * Arbeitsstand, kein Nachweis. Bezeichnung, Sollmenge, Einheit und Herkunft
 * kommen erst beim Einreichen dazu, und dann wie gehabt aus der Vorlage.
 */
export function pruefeEntwurf(
  wert: unknown,
  faecher: readonly VorlagenFach[],
): { entwurf: Entwurf } | { fehler: EntwurfFehler } {
  if (
    !istObjekt(wert) ||
    typeof wert['verfallsdatumErfasst'] !== 'boolean' ||
    !istText(wert['bemerkung']) ||
    wert['bemerkung'].length > ENTWURF_BEMERKUNG_MAX ||
    !istObjekt(wert['positionen'])
  ) {
    return { fehler: 'unlesbar' };
  }

  const nachId = new Map<string, VorlagenArtikel>();
  for (const fach of faecher) {
    for (const artikel of fach.artikel) nachId.set(artikel.id, artikel);
  }

  const positionen: Record<string, PositionEingabe> = {};
  for (const [artikelId, roh] of Object.entries(wert['positionen'])) {
    const artikel = nachId.get(artikelId);
    if (!artikel) return { fehler: 'unbekannter-artikel' };
    const eingabe = pruefePositionEingabe(roh);
    if (!eingabe) return { fehler: 'unlesbar' };
    // Der Schlüssel führt: eine abweichende `artikelId` im Wert wäre ein
    // Zuordnungsfehler und nicht stillschweigend zu heilen.
    if (eingabe.artikelId !== artikelId) return { fehler: 'unlesbar' };
    if (eingabe.verfallsdaten.length !== artikel.sollMenge) {
      return { fehler: 'stueckzahl-passt-nicht' };
    }
    positionen[artikelId] = eingabe;
  }

  return {
    entwurf: {
      verfallsdatumErfasst: wert['verfallsdatumErfasst'],
      bemerkung: wert['bemerkung'],
      positionen,
    },
  };
}
