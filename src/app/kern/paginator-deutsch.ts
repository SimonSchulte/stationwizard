import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

/** Deutsche Beschriftungen für `mat-paginator` (Material liefert sonst nur Englisch). */
@Injectable()
export class PaginatorDeutsch extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Einträge pro Seite:';
  override nextPageLabel = 'Nächste Seite';
  override previousPageLabel = 'Vorherige Seite';
  override firstPageLabel = 'Erste Seite';
  override lastPageLabel = 'Letzte Seite';

  override getRangeLabel = (seite: number, seitengroesse: number, laenge: number): string => {
    if (laenge === 0 || seitengroesse === 0) return `0 von ${laenge}`;
    const start = seite * seitengroesse;
    const ende = Math.min(start + seitengroesse, laenge);
    return `${start + 1} – ${ende} von ${laenge}`;
  };
}
