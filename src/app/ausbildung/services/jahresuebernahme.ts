import { Jahresblatt, KatsThema, Termin, neueId } from '../models/plan.model';

/**
 * Übernahme von Ideen und KatS-Themen aus einem Jahr in ein anderes. Reine
 * Berechnung ohne Zustand; die Seite entscheidet über die Auswahl, der
 * `KalenderDatenService` hängt das Ergebnis an das Zieljahr an.
 *
 * Übernommen wird immer eine **Kopie** mit neuer Id – das Quelljahr bleibt
 * unverändert, und beide Jahre können danach unabhängig gepflegt werden.
 */
export interface UebernahmeAuswahl {
  ideenIds: ReadonlySet<string>;
  katsThemaIds: ReadonlySet<string>;
}

export interface UebernahmeErgebnis {
  ideen: Termin[];
  katsThemen: KatsThema[];
}

function normalisiert(text: string): string {
  return text.trim().toLocaleLowerCase('de');
}

/** Ein KatS-Thema gilt als dasselbe, wenn Nummer und Titel übereinstimmen. */
function themaSchluessel(thema: KatsThema): string {
  return `${normalisiert(thema.nummer)}|${normalisiert(thema.titel)}`;
}

/** Eine Idee gilt als dieselbe, wenn Thema, Kategorie und Ausbilder übereinstimmen. */
function ideeSchluessel(idee: Termin): string {
  return `${normalisiert(idee.thema)}|${idee.kategorie}|${normalisiert(idee.ausbilder)}`;
}

/** Ideen des Quelljahres, die im Zieljahr bereits vorkommen (inhaltsgleich). */
export function vorhandeneIdeen(quelle: Jahresblatt, ziel: Jahresblatt): Set<string> {
  const imZiel = new Set(ziel.ideen.filter((i) => i.thema.trim()).map(ideeSchluessel));
  return new Set(
    quelle.ideen.filter((i) => i.thema.trim() && imZiel.has(ideeSchluessel(i))).map((i) => i.id),
  );
}

/** KatS-Themen des Quelljahres, die im Zieljahr bereits vorkommen (gleiche Nummer und Titel). */
export function vorhandeneKatsThemen(quelle: Jahresblatt, ziel: Jahresblatt): Set<string> {
  const imZiel = new Set(ziel.katsThemen.map(themaSchluessel));
  return new Set(quelle.katsThemen.filter((t) => imZiel.has(themaSchluessel(t))).map((t) => t.id));
}

/**
 * Erzeugt die Kopien für das Zieljahr.
 *
 * - Ideen verweisen auf ein KatS-Thema des Quelljahres. Wird dieses Thema mit
 *   übernommen oder gibt es im Zieljahr schon ein gleiches, zeigt die Kopie
 *   darauf; andernfalls verliert sie nur den Verweis, behält aber Titel und
 *   Pflichtkennzeichen (`katsTitel`, `katsPflicht`).
 * - Ein KatS-Thema, das im Zieljahr bereits vorkommt, wird nicht ein zweites Mal
 *   angelegt, auch wenn es ausgewählt ist.
 */
export function berechneUebernahme(
  quelle: Jahresblatt,
  ziel: Jahresblatt,
  auswahl: UebernahmeAuswahl,
): UebernahmeErgebnis {
  const zielThemen = new Map(ziel.katsThemen.map((t) => [themaSchluessel(t), t.id]));
  const themaZuordnung = new Map<string, string>();
  const katsThemen: KatsThema[] = [];

  for (const thema of quelle.katsThemen) {
    const vorhanden = zielThemen.get(themaSchluessel(thema));
    if (vorhanden) {
      themaZuordnung.set(thema.id, vorhanden);
    } else if (auswahl.katsThemaIds.has(thema.id)) {
      const kopie = { ...thema, id: neueId() };
      themaZuordnung.set(thema.id, kopie.id);
      katsThemen.push(kopie);
    }
  }

  const ideen = quelle.ideen
    .filter((idee) => auswahl.ideenIds.has(idee.id))
    .map((idee) => ({
      ...idee,
      id: neueId(),
      nachweise: [...idee.nachweise],
      katsThemaId: idee.katsThemaId ? (themaZuordnung.get(idee.katsThemaId) ?? null) : null,
    }));

  return { ideen, katsThemen };
}
