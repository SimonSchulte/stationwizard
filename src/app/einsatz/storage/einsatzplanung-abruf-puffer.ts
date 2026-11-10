import { Injectable } from '@angular/core';
import { AbrufPuffer } from '../../kern/abruf-puffer';
import { EinsatzListenEintrag } from '../models/einsatz.model';
import { AufbauVorlageKopf } from '../models/aufbau.model';
import { PepVorlageKopf } from '../models/pep.model';

/** Wie lange eine gelesene Liste wiederverwendet werden darf. */
const GUELTIG_MS = 60_000;

/**
 * Puffert ausschließlich die Listen (Einsätze, PEP-Vorlagen, Aufbau-Vorlagen); versionierte Einzelabrufe bleiben ungepuffert
 * (ein alter ETag führte zu 412). Nach jedem eigenen Schreibzugriff zu verwerfen.
 * Schreiben eines Aufbaus oder einer PEP verwirft auch die Einsatzliste, denn sie trägt deren Kennzahlen.
 */
@Injectable({ providedIn: 'root' })
export class EinsatzplanungAbrufPuffer {
  readonly einsaetze = new AbrufPuffer<EinsatzListenEintrag[]>(GUELTIG_MS);
  readonly pepVorlagen = new AbrufPuffer<PepVorlageKopf[]>(GUELTIG_MS);
  readonly aufbauVorlagen = new AbrufPuffer<AufbauVorlageKopf[]>(GUELTIG_MS);

  verwerfenEinsaetze(): void {
    this.einsaetze.verwerfen();
  }

  verwerfenAufbauVorlagen(): void {
    this.aufbauVorlagen.verwerfen();
  }

  verwerfenPepVorlagen(): void {
    this.pepVorlagen.verwerfen();
  }
}
