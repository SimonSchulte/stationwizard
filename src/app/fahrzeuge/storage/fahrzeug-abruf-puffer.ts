import { Injectable } from '@angular/core';
import { AbrufPuffer } from '../../kern/abruf-puffer';
import { Fahrzeugstamm, Kilometerstand } from '../models/fahrzeug.model';
import { KmBericht } from '../models/km-bericht.model';

/**
 * Wie lange ein gelesener Fahrzeugstand wiederverwendet werden darf. Kurz
 * genug, dass eine Erfassung aus einem anderen Browser spätestens nach einer
 * Minute sichtbar wird, lang genug, dass das übliche Hin und Her zwischen
 * Dashboard, Liste und Detailseite nicht jedes Mal dieselben Daten erneut
 * abruft.
 */
const GUELTIG_MS = 60_000;

/**
 * Gemeinsamer Lesepuffer des Fahrzeugmoduls. Bewusst ein eigener, von beiden
 * Adaptern geteilter Dienst statt je Adapter ein eigener Puffer: eine
 * erfasste Ablesung ändert nicht nur den Verlauf des Fahrzeugs, sondern auch
 * den Kilometerstandsbericht der Übersicht. Ein Schreibzugriff verwirft
 * deshalb immer alles - sonst zeigte die Übersicht nach einer Erfassung noch
 * eine Minute lang den alten Stand.
 *
 * Er puffert ausschließlich Listen ohne Version. `ladeFahrzeug()` bleibt
 * absichtlich ungepuffert: dessen ETag ist die Bedingung des nächsten
 * `If-Match`-Schreibzugriffs, ein gepufferter ETag führte zu einem
 * vermeidbaren 412.
 */
@Injectable({ providedIn: 'root' })
export class FahrzeugAbrufPuffer {
  readonly liste = new AbrufPuffer<Fahrzeugstamm[]>(GUELTIG_MS);
  readonly ablesungen = new AbrufPuffer<Kilometerstand[]>(GUELTIG_MS);
  readonly bericht = new AbrufPuffer<KmBericht>(GUELTIG_MS);

  /** Nach jedem eigenen Schreibzugriff aufzurufen. */
  verwerfen(): void {
    this.liste.verwerfen();
    this.ablesungen.verwerfen();
    this.bericht.verwerfen();
  }
}
