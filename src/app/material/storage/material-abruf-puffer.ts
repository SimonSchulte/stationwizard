import { Injectable } from '@angular/core';
import { AbrufPuffer } from '../../kern/abruf-puffer';
import { BehaelterUebersicht } from '../models/behaelter.model';
import { PruefvorlageKopf } from '../models/pruefvorlage.model';

/** Wie lange eine gelesene Liste wiederverwendet werden darf. */
const GUELTIG_MS = 60_000;

/**
 * Ein gemeinsamer Puffer für das ganze Modul, weil die Listen voneinander
 * abhängen: ein neuer Check ändert auch die Behälterübersicht, eine geänderte
 * Vorlage die Vorlagenliste. Deshalb verwirft `verwerfen()` alles.
 *
 * Bewusst **nicht** gepuffert sind die Einzelabrufe mit ETag
 * (`ladeVorlage`, `ladeBehaelter`): eine veraltete Version aus dem Puffer
 * ließe das nächste Speichern mit einem unnötigen 412 scheitern.
 */
@Injectable({ providedIn: 'root' })
export class MaterialAbrufPuffer {
  readonly vorlagen = new AbrufPuffer<PruefvorlageKopf[]>(GUELTIG_MS);
  readonly behaelter = new AbrufPuffer<BehaelterUebersicht[]>(GUELTIG_MS);

  /** Nach jedem eigenen Schreibzugriff aufzurufen. */
  verwerfen(): void {
    this.vorlagen.verwerfen();
    this.behaelter.verwerfen();
  }
}
