import { Injectable, inject } from '@angular/core';
import type { Aufgabe, Aufgabenquelle } from '../../kern/aufgaben/aufgabenquelle';
import { anzeigenameAusEmail } from '../../kern/text/anzeigename';
import { SLOT_BEZEICHNUNG } from '../models/vorgang.model';
import { ApiVorgangStorage } from '../storage/api-vorgang-storage';

/**
 * Meldet Unterschriftsanfragen an die angemeldete Person als Aufgaben an. Bewusst schlank, weil die
 * Quelle in `app.config.ts` im Initialbündel liegt: nur Speicher, Modell und eine Textfunktion.
 */
@Injectable({ providedIn: 'root' })
export class VorgangAufgabenquelle implements Aufgabenquelle {
  readonly kennung = 'vorgang-unterschrift';
  readonly bezeichnung = 'Unterschriften';

  private readonly storage = inject(ApiVorgangStorage);

  async ladeAufgaben(): Promise<Aufgabe[]> {
    const offene = await this.storage.aufgaben();
    return offene.map((a) => ({
      id: `${this.kennung}:${a.vorgangId}:${a.slot}`,
      quelle: this.kennung,
      titel: 'Schadensmeldung unterschreiben',
      beschreibung:
        `${a.fahrzeugBezeichnung} · ${SLOT_BEZEICHNUNG[a.slot]}` +
        (a.angefragtVon ? ` · angefragt von ${anzeigenameAusEmail(a.angefragtVon)}` : ''),
      eingegangenAm: a.angefragtAm ?? '',
      routerLink: ['/vorgaenge', a.vorgangId, 'meldung'],
      dringlichkeit: 'normal',
    }));
  }
}
