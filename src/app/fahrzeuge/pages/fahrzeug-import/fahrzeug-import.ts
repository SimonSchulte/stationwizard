import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import { BEFUND_LABEL, ImportBefund, berichtCsv, vorlageCsv } from '../../services/fahrzeug-import';
import { FahrzeugImportStoreService } from '../../services/fahrzeug-import-store.service';

const CSV_MEDIENTYP = 'text/csv;charset=utf-8';

/**
 * Stammdatenimport aus einer CSV-Datei: Vorlage holen, Datei wählen, Vorschau
 * prüfen, anlegen, Bericht sichern. Die Seite hängt im Verwaltungsbereich, die
 * Fachlogik bleibt im Fahrzeugmodul.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fahrzeug-import',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, MatToolbarModule],
  templateUrl: './fahrzeug-import.html',
  styleUrl: './fahrzeug-import.less',
})
export class FahrzeugImport {
  private readonly store = inject(FahrzeugImportStoreService);
  private readonly dialogDienst = inject(DialogDienst);

  readonly BEFUND_LABEL = BEFUND_LABEL;

  readonly dateiname = this.store.dateiname;
  readonly liestEin = this.store.liestEin;
  readonly fehler = this.store.fehler;
  readonly vorschau = this.store.vorschau;
  readonly laeuftGerade = this.store.laeuftGerade;
  readonly erledigt = this.store.erledigt;
  readonly gesamt = this.store.gesamt;
  readonly bereit = this.store.bereit;
  readonly ergebnisse = this.store.ergebnisse;
  readonly angelegteAnzahl = this.store.angelegteAnzahl;

  readonly zeilen = computed(() => this.vorschau().zeilen);

  readonly anzahlJeBefund = computed(() => {
    const zaehler: Record<ImportBefund, number> = {
      uebernehmen: 0,
      fehler: 0,
      'dublette-datei': 0,
      'dublette-bestand': 0,
    };
    for (const zeile of this.zeilen()) zaehler[zeile.befund] += 1;
    return zaehler;
  });

  readonly fortschritt = computed(() => {
    const gesamt = this.gesamt();
    return gesamt === 0 ? 0 : Math.round((this.erledigt() / gesamt) * 100);
  });

  vorlageHerunterladen(): void {
    dateiHerunterladen(vorlageCsv(), 'fahrzeuge-vorlage.csv', CSV_MEDIENTYP);
  }

  dateiGewaehlt(ereignis: Event): void {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    if (datei) void this.store.dateiEinlesen(datei);
    // Zurücksetzen, damit dieselbe Datei nach einer Korrektur erneut wählbar ist.
    eingabe.value = '';
  }

  async importStarten(): Promise<void> {
    const anzahl = this.gesamt();
    const bestaetigt = await this.dialogDienst.bestaetigen(
      `${anzahl} Fahrzeug(e) werden neu angelegt. Bereits vorhandene Kennzeichen werden dabei abgewiesen, nicht aktualisiert.`,
      'Fahrzeuge importieren',
      'Jetzt anlegen',
    );
    if (!bestaetigt) return;
    await this.store.importStarten();
  }

  berichtHerunterladen(): void {
    dateiHerunterladen(
      berichtCsv(this.ergebnisse()),
      'fahrzeuge-import-bericht.csv',
      CSV_MEDIENTYP,
    );
  }

  neueDatei(): void {
    this.store.zuruecksetzen();
  }
}
