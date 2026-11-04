import { Injectable } from '@angular/core';
import { AbrufPuffer } from '../../kern/abruf-puffer';
import { EinsatzListenEintrag } from '../models/einsatz.model';
import { VbVorlageKopf } from '../models/vb.model';

/** Wie lange eine gelesene Liste wiederverwendet werden darf. */
const GUELTIG_MS = 60_000;

/**
 * Puffert ausschließlich die beiden Listen; versionierte Einzelabrufe bleiben ungepuffert
 * (ein alter ETag führte zu 412). Nach jedem eigenen Schreibzugriff zu verwerfen.
 * Schreiben einer Vorbereitung verwirft auch die Einsatzliste, denn sie trägt die VB-Kennzahlen.
 */
@Injectable({ providedIn: 'root' })
export class EinsatzplanungAbrufPuffer {
  readonly einsaetze = new AbrufPuffer<EinsatzListenEintrag[]>(GUELTIG_MS);
  readonly vorlagen = new AbrufPuffer<VbVorlageKopf[]>(GUELTIG_MS);

  verwerfenEinsaetze(): void {
    this.einsaetze.verwerfen();
  }

  verwerfenVorlagen(): void {
    this.vorlagen.verwerfen();
  }
}
