import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Ladeanzeige, Leerzustand, MeldungsDienst } from '../../../kern/zustand/zustand';
import { AufbauVorlageKopf } from '../../models/aufbau.model';
import { AufbauVorlagenStoreService } from '../../services/aufbau-vorlagen-store.service';

/**
 * Reiter „Aufbau“ der Einsatz-Vorlagen: Liste mit Kennzahlen, Bearbeiten im Aufbau-Editor und
 * Löschen. Der Inhalt wird hier nie geladen; die Liste kommt in einem Aufruf.
 */
@Component({
  selector: 'app-aufbau-vorlagen-reiter',
  imports: [
    Ladeanzeige,
    Leerzustand,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    RouterLink,
  ],
  templateUrl: './aufbau-vorlagen-reiter.html',
  styleUrl: './aufbau-vorlagen-reiter.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AufbauVorlagenReiter implements OnInit {
  private readonly store = inject(AufbauVorlagenStoreService);
  private readonly dialog = inject(DialogDienst);
  private readonly meldungen = inject(MeldungsDienst);

  protected readonly vorlagen = this.store.vorlagen;
  protected readonly laedt = this.store.laedt;
  protected readonly fehler = this.store.fehler;
  protected readonly arbeitet = signal(false);

  ngOnInit(): void {
    void this.store.laden();
  }

  protected async loeschen(vorlage: AufbauVorlageKopf): Promise<void> {
    if (this.arbeitet()) return;
    const bestaetigt = await this.dialog.bestaetigen(
      `„${vorlage.titel}“ wird endgültig gelöscht. Bereits daraus angelegte Aufbauten bleiben unverändert.`,
      'Aufbau-Vorlage löschen',
      'Endgültig löschen',
    );
    if (!bestaetigt) return;
    this.arbeitet.set(true);
    try {
      if (await this.store.loeschen(vorlage.id, `"${vorlage.version}"`)) {
        this.meldungen.erfolg(`„${vorlage.titel}“ wurde gelöscht.`);
      } else if (this.store.konflikt()) {
        this.meldungen.fehler(
          'Die Vorlage wurde inzwischen geändert und nicht gelöscht. Die Liste ist neu geladen.',
        );
      } else {
        this.meldungen.fehler(this.store.fehler() || 'Die Vorlage konnte nicht gelöscht werden.');
      }
    } finally {
      this.arbeitet.set(false);
    }
  }
}
