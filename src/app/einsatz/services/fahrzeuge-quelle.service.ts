import { Injectable, computed, inject } from '@angular/core';
import { FahrzeugStoreService } from '../../fahrzeuge/services/fahrzeug-store.service';
import { Fahrzeug } from '../models/planung.model';

/**
 * Schmaler Lesezugriff des Einsatzplaners auf das Fahrzeugmodul (siehe
 * docs/konzept-fahrzeuge.md, Abschnitt 2 „Verhältnis zum Bestand"). Übersetzt
 * `Fahrzeugstamm` in das bestehende, unveränderte Einsatz-Fahrzeugmodell –
 * keine Vereinheitlichung der beiden Fachmodelle. `hiorgId` bleibt leer: das
 * Fahrzeugmodul führt derzeit keine HiOrg-Kennung; eine spätere Übernahme
 * aus EFS braucht zuerst einen fachlichen Nachweis (siehe Konzept,
 * Abschnitt 9). `seriennummer` wird auf die optionale Fahrgestellnummer
 * abgebildet – beides bezeichnet fachlich dieselbe Fahrzeugkennung.
 */
@Injectable({ providedIn: 'root' })
export class FahrzeugeQuelleService {
  private readonly store = inject(FahrzeugStoreService);
  private geladen = false;

  readonly fahrzeuge = computed<Fahrzeug[]>(() =>
    this.store.fahrzeuge().map((f) => ({
      seriennummer: f.fahrgestellnummer ?? '',
      funkruf: f.funkrufname,
      hiorgId: '',
    })),
  );

  /** Löst das Laden einmalig aus; spätere Aufrufe sind ein günstiger No-op. */
  sicherstellenGeladen(): void {
    if (this.geladen) return;
    this.geladen = true;
    void this.store.listeLaden();
  }
}
