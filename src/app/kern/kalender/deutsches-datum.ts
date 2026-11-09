import { Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MAT_NATIVE_DATE_FORMATS,
  NativeDateAdapter,
} from '@angular/material/core';

const DEUTSCH = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\s*$/;

/**
 * Datumsadapter für `mat-datepicker` mit deutscher Eingabe. `NativeDateAdapter` liest getippte
 * Texte über `Date.parse` und damit amerikanisch: „11.12.2026“ wurde zum 12. November. Hier gilt
 * Tag.Monat.Jahr (zweistellige Jahre als 20xx); ISO-Schreibweise bleibt lesbar, alles andere
 * ist ungültig und wird vom Feld als Fehler gemeldet.
 */
export class DeutscherDatumAdapter extends NativeDateAdapter {
  override parse(wert: unknown, parseFormat?: unknown): Date | null {
    if (typeof wert !== 'string') return super.parse(wert, parseFormat);
    const text = wert.trim();
    if (text === '') return null;
    const treffer = DEUTSCH.exec(text);
    if (treffer) {
      const tag = Number(treffer[1]);
      const monat = Number(treffer[2]);
      const jahr = treffer[3].length === 2 ? 2000 + Number(treffer[3]) : Number(treffer[3]);
      const datum = new Date(jahr, monat - 1, tag);
      const stimmt =
        datum.getFullYear() === jahr && datum.getMonth() === monat - 1 && datum.getDate() === tag;
      return stimmt ? datum : this.invalid();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [jahr, monat, tag] = text.split('-').map(Number);
      const datum = new Date(jahr, monat - 1, tag);
      return datum.getMonth() === monat - 1 ? datum : this.invalid();
    }
    return this.invalid();
  }
}

/** Anbieter für Komponenten mit `mat-datepicker`: deutsche Eingabe statt `MatNativeDateModule`. */
export function provideDeutschesDatum(): Provider[] {
  return [
    { provide: MAT_DATE_LOCALE, useValue: 'de-DE' },
    { provide: DateAdapter, useClass: DeutscherDatumAdapter, deps: [MAT_DATE_LOCALE] },
    { provide: MAT_DATE_FORMATS, useValue: MAT_NATIVE_DATE_FORMATS },
  ];
}
