import { Injectable } from '@angular/core';
import { AbrufPuffer } from '../../kern/abruf-puffer';
import { Angebot } from '../models/angebot.model';

/** Wie lange eine gelesene Angebotsliste wiederverwendet werden darf. */
const GUELTIG_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class AngebotAbrufPuffer {
  /** Puffert ausschließlich die Liste ohne Version; `ladeAngebot()` bleibt ungepuffert (siehe `FahrzeugAbrufPuffer`). */
  readonly liste = new AbrufPuffer<Angebot[]>(GUELTIG_MS);

  /** Nach jedem eigenen Schreibzugriff aufzurufen. */
  verwerfen(): void {
    this.liste.verwerfen();
  }
}
