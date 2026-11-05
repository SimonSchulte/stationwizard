import { Injectable, signal } from '@angular/core';
import { Einsatz } from '../models/einsatz.model';

/**
 * Wohin der PEP-Editor speichert. Der Editor arbeitet immer an einer `Planung` im
 * `PlanungStoreService`; dieser Kontext sagt, was sie in der Datenbank ist:
 *
 * - `einsatz`: die PEP dieses Einsatzes (Planungs-Id = Einsatz-Id; Titel und Zeitraum gehören
 *   dem Einsatz und sind im Editor gesperrt),
 * - `vorlage`: eine PEP-Vorlage (`version` ist `null`, solange sie noch nicht angelegt ist),
 * - `null`: eine über „Datei öffnen“ geladene Datei ohne Einsatz.
 */
export type PepEditorZiel =
  | { art: 'einsatz'; einsatz: Einsatz }
  | { art: 'vorlage'; vorlageId: string; version: string | null };

/** Hält den Speicherort des geöffneten Plans; wird beim Verlassen des Editors geleert. */
@Injectable({ providedIn: 'root' })
export class PepEditorKontext {
  readonly ziel = signal<PepEditorZiel | null>(null);

  setzen(ziel: PepEditorZiel | null): void {
    this.ziel.set(ziel);
  }

  loeschen(): void {
    this.ziel.set(null);
  }
}
