import { Injectable, signal } from '@angular/core';
import { AushangSortierung } from './laufzettel-layout';
import { STREIFEN_STANDARD, gueltigeStreifenZahl } from './laufzettel-platz';

/**
 * Gewählte Zahl der Laufzettelstreifen je A4-Querseite (3 bis 6). Editor-Warnungen
 * („6 / 23“, „zu voll“) und Druck lesen dieselbe Wahl, damit sie nie auseinanderlaufen.
 * Gilt nur für die Sitzung und wird nicht gespeichert.
 */
@Injectable({ providedIn: 'root' })
export class LaufzettelLayoutWahl {
  private readonly _streifenJeSeite = signal(STREIFEN_STANDARD);
  readonly streifenJeSeite = this._streifenJeSeite.asReadonly();

  private readonly _sortierung = signal<AushangSortierung>('lager');
  /** Reihenfolge der Laufzettel im Druck (Aushang): nach Lager oder nach Abschnitt. */
  readonly sortierung = this._sortierung.asReadonly();

  setzeSortierung(wert: AushangSortierung): void {
    this._sortierung.set(wert);
  }

  setze(wert: number): void {
    this._streifenJeSeite.set(gueltigeStreifenZahl(wert));
  }
}
