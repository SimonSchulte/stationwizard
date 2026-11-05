import {
  ABSCHNITT_FARBEN,
  AbschnittFarbe,
  VbAbschnitt,
  VbInhalt,
  VbLaufzettel,
  VbPosition,
  VbVorlage,
  Vorbereitung,
} from '../models/vb.model';
import { FACHGRUPPE_BEZEICHNUNG } from '../../kern/fachgruppen/fachgruppe';

/**
 * Reine, unveränderliche Bausteine zum Kopieren und Umbauen einer VB. Jede Funktion liefert
 * neue Objekte; die Eingaben bleiben unangetastet. Ids kommen aus `neueId` (Vorgabe
 * `crypto.randomUUID()`), damit Tests feste Ids einsetzen können.
 */
export type IdErzeuger = () => string;

const NEUE_ID: IdErzeuger = () => crypto.randomUUID();

/** Vorgabe der Laufzettel-Überschrift. */
export const LAUFZETTEL_VORGABE_UEBERSCHRIFT = 'Material verlasten';
export const ABSCHNITT_VORGABE_TITEL = 'Neuer Abschnitt';

export function leererInhalt(): VbInhalt {
  return { anweisungen: '', abschnitte: [] };
}

/**
 * Kopiert eine Vorlage zur Vorbereitung eines Einsatzes: neue Ids für alles, `herkunftId` ist
 * die Id des Gegenstücks in der Vorlage. Die Kopie ist eine Momentaufnahme der
 * `vorlageVersion`.
 */
export function kopiereVorlage(
  vorlage: VbVorlage,
  vorlageVersion: number,
  neueId: IdErzeuger = NEUE_ID,
): Vorbereitung {
  return {
    vorlageId: vorlage.id,
    vorlageVersion,
    inhalt: {
      anweisungen: vorlage.inhalt.anweisungen,
      abschnitte: vorlage.inhalt.abschnitte.map((abschnitt) => ({
        ...abschnitt,
        id: neueId(),
        herkunftId: abschnitt.id,
        laufzettel: abschnitt.laufzettel.map((laufzettel) => ({
          ...laufzettel,
          id: neueId(),
          herkunftId: laufzettel.id,
          positionen: laufzettel.positionen.map((position) => ({
            ...position,
            id: neueId(),
            herkunftId: position.id,
          })),
        })),
      })),
    },
  };
}

/**
 * Kopiert eine Vorbereitung zu einem Vorlageninhalt (für „Als neue Vorlage speichern“):
 * neue Ids, keine `herkunftId` (in Vorlagen immer `null`).
 */
export function inhaltAlsVorlage(inhalt: VbInhalt, neueId: IdErzeuger = NEUE_ID): VbInhalt {
  return {
    anweisungen: inhalt.anweisungen,
    abschnitte: inhalt.abschnitte.map((abschnitt) => ({
      ...abschnitt,
      id: neueId(),
      herkunftId: null,
      laufzettel: abschnitt.laufzettel.map((laufzettel) => ({
        ...laufzettel,
        id: neueId(),
        herkunftId: null,
        positionen: laufzettel.positionen.map((position) => ({
          ...position,
          id: neueId(),
          herkunftId: null,
        })),
      })),
    })),
  };
}

/** Die erste noch nicht verwendete Abschnittsfarbe, sonst reihum von vorn. */
export function naechsteAbschnittFarbe(inhalt: VbInhalt): AbschnittFarbe {
  const benutzt = new Set(inhalt.abschnitte.map((a) => a.farbe));
  return (
    ABSCHNITT_FARBEN.find((farbe) => !benutzt.has(farbe)) ??
    ABSCHNITT_FARBEN[inhalt.abschnitte.length % ABSCHNITT_FARBEN.length]
  );
}

export function neuerAbschnitt(
  farbe: AbschnittFarbe = ABSCHNITT_FARBEN[0],
  neueId: IdErzeuger = NEUE_ID,
): VbAbschnitt {
  return {
    id: neueId(),
    herkunftId: null,
    titel: ABSCHNITT_VORGABE_TITEL,
    farbe,
    fachgruppe: null,
    laufzettel: [],
  };
}

/**
 * Neuer, leerer Laufzettel. Hat der Abschnitt eine Fachgruppe, ist sie die Vorgabe, und der
 * Auftraggeber lautet „GF <Bezeichnung>“.
 */
export function neuerLaufzettel(
  abschnitt?: Pick<VbAbschnitt, 'fachgruppe'>,
  neueId: IdErzeuger = NEUE_ID,
): VbLaufzettel {
  const fachgruppe = abschnitt?.fachgruppe ?? null;
  return {
    id: neueId(),
    herkunftId: null,
    ueberschrift: LAUFZETTEL_VORGABE_UEBERSCHRIFT,
    lagerort: '',
    transportMit: '',
    auftraggeber: fachgruppe ? `GF ${FACHGRUPPE_BEZEICHNUNG[fachgruppe]}` : '',
    fachgruppe,
    positionen: [],
  };
}

/** Neue, leere Position (Material ist Pflicht und muss vor dem Speichern gefüllt werden). */
export function neuePosition(neueId: IdErzeuger = NEUE_ID): VbPosition {
  return { id: neueId(), herkunftId: null, anzahl: '', material: '' };
}

/** Kopie mit neuen Ids; ohne Gegenstück in der Vorlage (`herkunftId` überall `null`). */
export function laufzettelDuplizieren(
  laufzettel: VbLaufzettel,
  neueId: IdErzeuger = NEUE_ID,
): VbLaufzettel {
  return {
    ...laufzettel,
    id: neueId(),
    herkunftId: null,
    positionen: laufzettel.positionen.map((position) => ({
      ...position,
      id: neueId(),
      herkunftId: null,
    })),
  };
}

/**
 * Teilt einen Laufzettel: Die genannten Positionen wandern (mit ihren Ids) in einen neuen
 * Laufzettel mit denselben Kopffeldern; der Rest bleibt im Original. Unbekannte Ids werden
 * ignoriert.
 */
export function laufzettelTeilen(
  laufzettel: VbLaufzettel,
  positionIds: readonly string[],
  neueId: IdErzeuger = NEUE_ID,
): { original: VbLaufzettel; abgetrennt: VbLaufzettel } {
  const auswahl = new Set(positionIds);
  return {
    original: {
      ...laufzettel,
      positionen: laufzettel.positionen.filter((p) => !auswahl.has(p.id)),
    },
    abgetrennt: {
      ...laufzettel,
      id: neueId(),
      herkunftId: null,
      positionen: laufzettel.positionen.filter((p) => auswahl.has(p.id)),
    },
  };
}

/**
 * Hängt die Positionen von `quelle` an `ziel`. Leere Kopffelder des Ziels (Lagerort,
 * Transport, Auftraggeber, Fachgruppe) übernehmen den Wert der Quelle. Der Aufrufer entfernt
 * `quelle` aus dem Inhalt.
 */
export function laufzettelZusammenfuehren(ziel: VbLaufzettel, quelle: VbLaufzettel): VbLaufzettel {
  return {
    ...ziel,
    lagerort: ziel.lagerort || quelle.lagerort,
    transportMit: ziel.transportMit || quelle.transportMit,
    auftraggeber: ziel.auftraggeber || quelle.auftraggeber,
    fachgruppe: ziel.fachgruppe ?? quelle.fachgruppe,
    positionen: [...ziel.positionen, ...quelle.positionen],
  };
}
