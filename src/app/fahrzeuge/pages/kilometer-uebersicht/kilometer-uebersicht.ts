import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { SystemkonfigurationStoreService } from '../../../systemkonfiguration/services/systemkonfiguration-store.service';
import { KmBerichtStoreService } from '../../services/km-bericht-store.service';

/**
 * Fuhrpark-weite Kilometerübersicht: Vorschau und Versand des
 * Kilometerstandsberichts. Empfänger, Betreff und Versandweg stehen in der
 * Systemkonfiguration unter „Email Versand" – hier wird nur noch gegen den
 * dort gespeicherten Stand gesendet, ohne ihn zu bearbeiten.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kilometer-uebersicht',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './kilometer-uebersicht.html',
  styleUrl: './kilometer-uebersicht.less',
})
export class KilometerUebersicht implements OnInit {
  private readonly konfiguration = inject(SystemkonfigurationStoreService);
  private readonly berichtStore = inject(KmBerichtStoreService);
  private readonly dialog = inject(DialogDienst);

  readonly bericht = this.berichtStore.bericht;
  readonly berichtLaedt = this.berichtStore.laedt;
  readonly berichtFehler = this.berichtStore.ladeFehler;
  readonly sendet = this.berichtStore.sendet;
  readonly sendeFehler = this.berichtStore.sendeFehler;
  readonly quittung = this.berichtStore.quittung;

  /** Der gespeicherte Stand entscheidet über den Versand, nicht ein Entwurf. */
  private readonly gespeicherteEinstellungen = this.konfiguration.gespeicherteEinstellungen;

  readonly gewaehlterWegVerfuegbar = computed(() => {
    const gespeichert = this.gespeicherteEinstellungen();
    return (
      gespeichert !== null && this.konfiguration.istVerfuegbar(gespeichert.kmBerichtVersandweg)
    );
  });

  readonly empfaengerGesetzt = computed(
    () => (this.gespeicherteEinstellungen()?.kmBerichtEmpfaenger ?? '') !== '',
  );

  readonly versandMoeglich = computed(
    () => this.empfaengerGesetzt() && this.gewaehlterWegVerfuegbar(),
  );

  /** Gleiche Darstellung wie im Mailtext (`worker/src/km-bericht.ts`). */
  zahl(wert: number | null): string {
    return wert === null ? '–' : wert.toLocaleString('de-DE');
  }

  datum(tag: string): string {
    const [jahr, monat, tagImMonat] = tag.split('-');
    return `${tagImMonat}.${monat}.${jahr}`;
  }

  /** Funkrufname und Kennzeichen; leere Teile fallen samt Trenner weg. */
  kennung(zeile: { funkrufname: string; kennzeichen: string }): string {
    return [zeile.funkrufname, zeile.kennzeichen].filter(Boolean).join(' · ');
  }

  abstand(tage: number | null): string {
    if (tage === null) return '';
    if (tage === 0) return 'heute';
    return tage === 1 ? 'vor 1 Tag' : `vor ${this.zahl(tage)} Tagen`;
  }

  ngOnInit(): void {
    void this.konfiguration.laden();
    void this.berichtStore.berichtLaden();
  }

  vorschauLaden(): void {
    void this.berichtStore.berichtLaden();
  }

  /**
   * Ein Versand verlässt die Anwendung und lässt sich nicht zurückholen;
   * deshalb immer erst die Bestätigung mit der konkreten Adresse.
   */
  async senden(): Promise<void> {
    const empfaenger = this.gespeicherteEinstellungen()?.kmBerichtEmpfaenger ?? '';
    if (!empfaenger) return;
    const anzahl = this.bericht()?.zeilen.length ?? 0;
    const bestaetigt = await this.dialog.bestaetigen(
      `Der Kilometerstandsbericht über ${anzahl} Fahrzeug(e) wird jetzt an ${empfaenger} gesendet. ` +
        'Ein Versand lässt sich nicht zurücknehmen.',
      'Bericht senden',
      'Jetzt senden',
    );
    if (bestaetigt) await this.berichtStore.senden();
  }
}
