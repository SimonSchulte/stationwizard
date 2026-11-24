import { Injectable, inject } from '@angular/core';
import type { Aufgabe, Aufgabenquelle } from '../../kern/aufgaben/aufgabenquelle';
import { anzeigenameAusEmail } from '../../kern/text/anzeigename';
import { SLOT_BEZEICHNUNG } from '../models/vorgang.model';
import { ApiVorgangStorage } from '../storage/api-vorgang-storage';
import { PostfachZaehler } from './postfach-zaehler';

/**
 * Meldet Unterschriftsanfragen an die angemeldete Person als Aufgaben an und liefert nebenbei die Zahl
 * offener Postfachmails (derselbe Aufruf). Bewusst schlank, weil die
 * Quelle in `app.config.ts` im Initialbündel liegt: nur Speicher, Modell und eine Textfunktion.
 */
@Injectable({ providedIn: 'root' })
export class VorgangAufgabenquelle implements Aufgabenquelle {
  readonly kennung = 'vorgang-unterschrift';
  readonly bezeichnung = 'Unterschriften';

  private readonly storage = inject(ApiVorgangStorage);
  private readonly zaehler = inject(PostfachZaehler);

  async ladeAufgaben(): Promise<Aufgabe[]> {
    const { unterschriften, postfachOffen } = await this.storage.aufgaben();
    const aufgaben: Aufgabe[] = unterschriften.map((a) => ({
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
    // Das Postfach ist keine Aufgabe in der Liste, sondern ein eigenes Symbol der Kopfleiste.
    this.zaehler.offen.set(postfachOffen);
    return aufgaben;
  }
}
