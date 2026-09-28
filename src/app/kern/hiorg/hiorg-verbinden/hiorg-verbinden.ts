import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { DialogDienst } from '../../dialog/dialog-dienst';
import { VerlassenSchutz } from '../../verlassen-schutz';
import {
  HiorgPersonalService,
  hiorgVerbindenAdresse,
  type HiorgRueckkehrZiel,
} from '../hiorg-personal.service';

/**
 * Stellt die Verbindung zur HiOrg-Server-API her – für Einsatzplanung und
 * Personalmodul gleich. Im manuellen Modus öffnet sich die HiOrg-Anmeldung in
 * einem neuen Tab (die App mit ungesicherten Änderungen bleibt offen), und die
 * Adresse der anschließenden Access-Fehlerseite wird hier eingefügt.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-hiorg-verbinden',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './hiorg-verbinden.html',
  styleUrl: './hiorg-verbinden.less',
})
export class HiorgVerbinden {
  private readonly hiorg = inject(HiorgPersonalService);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly verlassenSchutz = inject(VerlassenSchutz);
  private readonly dokument = inject(DOCUMENT);

  readonly ziel = input.required<HiorgRueckkehrZiel>();
  readonly verbunden = output<void>();

  readonly modus = this.hiorg.modus;
  readonly anmeldeAdresse = computed(() => hiorgVerbindenAdresse(this.ziel()));
  readonly geoeffnet = signal(false);
  readonly adresse = signal('');
  readonly sendet = signal(false);
  readonly fehler = signal('');

  async automatischVerbinden(): Promise<void> {
    // Die Anmeldung bei HiOrg verlässt die Seite; ungesicherte Planungen gingen verloren.
    if (
      this.verlassenSchutz.hatUngesicherteAenderungen() &&
      !(await this.dialogDienst.bestaetigen(
        'Für die Anmeldung beim HiOrg-Server wird die Seite verlassen. Ungesicherte Änderungen gehen dabei verloren. Bitte vorher speichern oder eine Kopie herunterladen.',
        'Mit HiOrg-Server verbinden',
        'Trotzdem verbinden',
      ))
    ) {
      return;
    }
    this.dokument.location.assign(this.anmeldeAdresse());
  }

  async abschliessen(): Promise<void> {
    const adresse = this.adresse().trim();
    if (!adresse || this.sendet()) return;
    this.sendet.set(true);
    this.fehler.set('');
    try {
      await this.hiorg.adresseEinreichen(adresse);
      this.adresse.set('');
      this.geoeffnet.set(false);
      this.verbunden.emit();
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Die Verbindung konnte nicht hergestellt werden.',
      );
    } finally {
      this.sendet.set(false);
    }
  }
}
