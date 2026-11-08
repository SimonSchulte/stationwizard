import { Injectable, signal } from '@angular/core';
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

  setze(wert: number): void {
    this._streifenJeSeite.set(gueltigeStreifenZahl(wert));
  }
}
