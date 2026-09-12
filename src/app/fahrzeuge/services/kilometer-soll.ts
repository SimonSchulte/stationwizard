import {
  Eigentuemer,
  Fahrzeugstamm,
  Kilometerstand,
  MINDEST_KM_PRO_MONAT,
} from '../models/fahrzeug.model';

/**
 * Mindestlaufleistung je Kalenderjahr (siehe docs/konzept-fahrzeuge.md,
 * Abschnitt 3). Das Bezugsfenster ist starr 1.1.–31.12.; Zu- und Abgänge
 * werden in dieser Fassung nicht abgebildet, jedes Fahrzeug trägt also ein
 * volles Jahressoll. Bleibt bewusst eine eigene Funktion mit Fahrzeug und
 * Jahr als Eingabe, damit eine spätere monatsanteilige Rechnung (nach
 * Bestandszeitraum) eine lokale Änderung bleibt.
 */
export function sollKmProJahr(eigentuemer: Eigentuemer): number {
  return MINDEST_KM_PRO_MONAT[eigentuemer] * 12;
}

export interface JahresstartstandErgebnis {
  /** Stand am Jahresanfang, oder `null` ohne jede Ablesung. */
  stand: number | null;
  /**
   * `true`, wenn weder eine Ablesung aus dem Vorjahr noch eine auf den 1.1.
   * selbst datierte Ablesung vorliegt und stattdessen ersatzweise eine
   * spätere Ablesung des betrachteten Jahres verwendet wurde. Muss in der
   * Oberfläche sichtbar bleiben statt stillschweigend mit 0 zu rechnen.
   */
  unvollstaendig: boolean;
}

/**
 * Ermittelt den Stand, ab dem im gegebenen Jahr gezählt wird: die letzte
 * Ablesung des Vorjahres, sonst ersatzweise die erste Ablesung des
 * betrachteten Jahres selbst. Ist diese ersatzweise Ablesung genau auf den
 * 1.1. datiert, gilt sie als vollwertiger Jahresstartstand – wer den Stand
 * zum Jahresbeginn gezielt nachträgt (siehe Fahrzeugdetail, Abschnitt
 * „Kilometerstand"), bekommt keine „unvollständig"-Warnung mehr. Nur eine
 * spätere erste Ablesung bedeutet einen echten Informationsverlust.
 */
export function ermittleJahresstartstand(
  ablesungen: readonly Kilometerstand[],
  jahr: number,
): JahresstartstandErgebnis {
  const vorjahresablesungen = ablesungen
    .filter((a) => Number(a.abgelesenAm.slice(0, 4)) < jahr)
    .sort((a, b) => b.abgelesenAm.localeCompare(a.abgelesenAm));
  if (vorjahresablesungen.length > 0) {
    return { stand: vorjahresablesungen[0].stand, unvollstaendig: false };
  }
  const jahresablesungen = ablesungen
    .filter((a) => Number(a.abgelesenAm.slice(0, 4)) === jahr)
    .sort((a, b) => a.abgelesenAm.localeCompare(b.abgelesenAm));
  if (jahresablesungen.length > 0) {
    const erste = jahresablesungen[0];
    const istJahresanfang = erste.abgelesenAm === `${jahr}-01-01`;
    return { stand: erste.stand, unvollstaendig: !istJahresanfang };
  }
  return { stand: null, unvollstaendig: true };
}

/** Letzte Ablesung bis einschließlich des gegebenen Jahres, unabhängig vom Datum darin. */
export function ermittleAktuellenStand(
  ablesungen: readonly Kilometerstand[],
  jahr: number,
): number | null {
  const relevante = ablesungen
    .filter((a) => Number(a.abgelesenAm.slice(0, 4)) <= jahr)
    .sort((a, b) => b.abgelesenAm.localeCompare(a.abgelesenAm));
  return relevante.length > 0 ? relevante[0].stand : null;
}

export interface KilometerJahresbilanz {
  jahr: number;
  eigentuemer: Eigentuemer;
  sollKm: number;
  /** `null`, solange kein Stand vorliegt, aus dem sich `istKm` ableiten ließe. */
  istKm: number | null;
  /** `null` wie `istKm`; sonst `max(0, sollKm - istKm)`. */
  restKm: number | null;
  /** Siehe `JahresstartstandErgebnis.unvollstaendig`. */
  unvollstaendig: boolean;
}

/**
 * Jahresbilanz für ein Fahrzeug. Bei `eigentuemer === 'organisation'` ist
 * `sollKm` 0 und `restKm` bewusst ebenfalls 0 statt eines falsch positiven
 * Erfolgswerts – die Oberfläche muss diesen Fall gesondert ohne Ampel
 * darstellen (siehe Konzept, Abschnitt 3), nicht an diesem Rückgabewert.
 */
export function berechneJahresbilanz(
  fahrzeug: Pick<Fahrzeugstamm, 'eigentuemer'>,
  ablesungen: readonly Kilometerstand[],
  jahr: number,
): KilometerJahresbilanz {
  const sollKm = sollKmProJahr(fahrzeug.eigentuemer);
  const start = ermittleJahresstartstand(ablesungen, jahr);
  const aktuell = ermittleAktuellenStand(ablesungen, jahr);
  const istKm = start.stand !== null && aktuell !== null ? aktuell - start.stand : null;
  const restKm = istKm !== null ? Math.max(0, sollKm - istKm) : null;
  return {
    jahr,
    eigentuemer: fahrzeug.eigentuemer,
    sollKm,
    istKm,
    restKm,
    unvollstaendig: start.unvollstaendig,
  };
}
