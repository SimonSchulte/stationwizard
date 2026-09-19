import {
  InjectionToken,
  type Type,
  type EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';

/**
 * Fachübergreifender Vertrag für den Bereich „Offene Aufgaben".
 *
 * Er liegt unter `kern/`, weil ihn mehrere Fachmodule bedienen sollen, und
 * kennt bewusst keinen einzigen Fachtyp: jede Quelle liefert fertige
 * Anzeigetexte und ein Ziel. Damit vereinheitlicht dieser Vertrag nichts
 * Fachliches – `kern/` weiß nichts von Fahrzeugen, Ausbildung oder Einsatz.
 *
 * Heute gibt es genau eine Quelle (öffentliche Kilometermeldungen). Die
 * angekündigten Mail- und Popup-Benachrichtigungen sowie weitere Aufgabenarten
 * sind damit eine weitere Quelle, kein Umbau.
 */
export interface Aufgabe {
  /** Über alle Quellen hinweg eindeutig; üblicherweise `${quelle}:${fachId}`. */
  id: string;
  /** Kennung der Quelle, für die Gruppierung in der Übersicht. */
  quelle: string;
  titel: string;
  beschreibung: string;
  /** ISO-Zeitstempel des Eingangs; sortiert quellenübergreifend, älteste zuerst. */
  eingegangenAm: string;
  routerLink: readonly unknown[];
  /** `hinweis` hebt eine Aufgabe hervor, die eine genauere Prüfung verdient. */
  dringlichkeit: 'normal' | 'hinweis';
}

export interface Aufgabenquelle {
  readonly kennung: string;
  /** Überschrift der Gruppe in der Übersicht, zum Beispiel „Kilometermeldungen". */
  readonly bezeichnung: string;
  ladeAufgaben(): Promise<Aufgabe[]>;
}

export const AUFGABENQUELLE = new InjectionToken<readonly Aufgabenquelle[]>('Aufgabenquelle');

/** Meldet eine Fachquelle an; mehrfach aufrufbar. */
export function provideAufgabenquelle(typ: Type<Aufgabenquelle>): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AUFGABENQUELLE, useExisting: typ, multi: true }]);
}
