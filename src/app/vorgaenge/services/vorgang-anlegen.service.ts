import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { heuteIso } from '../../kern/kalender/datum';
import { MeldungsDienst } from '../../kern/zustand/meldungs-dienst';
import { SystemkonfigurationStoreService } from '../../systemkonfiguration/services/systemkonfiguration-store.service';
import { neueMeldung } from '../models/schadensmeldung.model';
import { VorgangStoreService } from './vorgang-store.service';

export interface FahrzeugKurz {
  id: string;
  bezeichnung: string;
  kennzeichen: string;
}

/** Legt einen Vorgang „Fahrzeug/Material defekt“ mit vorbelegter Meldung an und öffnet die Meldung. */
@Injectable({ providedIn: 'root' })
export class VorgangAnlegenService {
  private readonly store = inject(VorgangStoreService);
  private readonly dialog = inject(DialogDienst);
  private readonly konfiguration = inject(SystemkonfigurationStoreService);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly router = inject(Router);

  async neuFuerFahrzeug(fahrzeug: FahrzeugKurz): Promise<void> {
    const titel = await this.dialog.eingabe(
      'Der Vorgang beginnt mit der Schadens- und Verlustmeldung. Wie soll er heißen?',
      'Neuer Vorgang „Fahrzeug/Material defekt“',
      'Titel',
      { wert: `${fahrzeug.bezeichnung}: `, maxLaenge: 120, bestaetigenLabel: 'Anlegen' },
    );
    if (!titel) return;
    await this.konfiguration.laden();
    const einheit = this.konfiguration.gespeicherteEinstellungen()?.vorgangEinheit ?? '';
    const id = await this.store.anlegen(
      fahrzeug.id,
      titel,
      neueMeldung({
        bezeichnung: fahrzeug.bezeichnung,
        kennzeichen: fahrzeug.kennzeichen,
        einheit,
        heute: heuteIso(),
      }),
    );
    if (id) await this.router.navigate(['/vorgaenge', id, 'meldung']);
    else
      this.meldungen.fehler(
        this.store.aktionFehler() || 'Der Vorgang konnte nicht angelegt werden.',
      );
  }
}
