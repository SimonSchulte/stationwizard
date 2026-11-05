import { Injectable } from '@angular/core';
import { Einsatz } from '../models/einsatz.model';
import { EfsEinsatzGruppe } from '../models/planung.model';

/**
 * ZWISCHENSTAND (Stub): Öffnet bzw. legt die PEP eines Einsatzes aus der Datenbank an und
 * zeigt sie im PEP-Editor. Die Umsetzung (Vorlagenwahl, EFS-Basis über
 * `EfsEinsatzGruppe`, Planung aus `pepInhaltZuPlanung()` in den Editor laden) folgt im
 * Editor-Umbau; bis dahin werfen beide Methoden.
 */
@Injectable({ providedIn: 'root' })
export class PepEditorOeffnenDienst {
  /** Öffnet die vorhandene PEP des Einsatzes im Editor. */
  async oeffnen(_einsatz: Einsatz): Promise<void> {
    throw new Error('noch nicht umgesetzt');
  }

  /** Legt die PEP an (Vorlage oder leer, bei HiOrg mit Einsatzkräften aus EFS) und öffnet sie. */
  async anlegen(_einsatz: Einsatz, _gruppe: EfsEinsatzGruppe | null): Promise<void> {
    throw new Error('noch nicht umgesetzt');
  }
}
