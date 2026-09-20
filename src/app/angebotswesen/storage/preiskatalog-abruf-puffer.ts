import { Injectable } from '@angular/core';
import { AbrufPuffer } from '../../kern/abruf-puffer';
import { PreiskatalogEintrag } from '../models/preiskatalog.model';

/** Wie lange eine gelesene Preiskatalog-Liste wiederverwendet werden darf. */
const GUELTIG_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class PreiskatalogAbrufPuffer {
  readonly liste = new AbrufPuffer<PreiskatalogEintrag[]>(GUELTIG_MS);

  /** Nach jedem eigenen Schreibzugriff aufzurufen. */
  verwerfen(): void {
    this.liste.verwerfen();
  }
}
