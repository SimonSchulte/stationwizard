import { Injectable } from '@angular/core';
import { AbrufPuffer } from '../../kern/abruf-puffer';
import { Artikel, Lager } from '../models/stammdaten.model';

/** Wie lange eine gelesene Liste wiederverwendet werden darf. */
const GUELTIG_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class StammdatenAbrufPuffer {
  readonly lager = new AbrufPuffer<Lager[]>(GUELTIG_MS);
  readonly artikel = new AbrufPuffer<Artikel[]>(GUELTIG_MS);

  /** Nach jedem eigenen Schreibzugriff aufzurufen. */
  verwerfen(): void {
    this.lager.verwerfen();
    this.artikel.verwerfen();
  }
}
