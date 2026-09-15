import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { KmBerichtStoreService } from '../../../fahrzeuge/services/km-bericht-store.service';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import {
  VERSANDWEGE,
  VERSANDWEG_HINWEIS,
  VERSANDWEG_LABEL,
  Versandweg,
} from '../../models/systemkonfiguration.model';
import { SystemkonfigurationStoreService } from '../../services/systemkonfiguration-store.service';

/**
 * Systemkonfiguration: einziger Ort, an dem Betriebseinstellungen gesetzt
 * werden. Der Versand des Kilometerstandsberichts wird hier ausgelöst, die
 * Berichtsfachlichkeit selbst bleibt im Fahrzeugmodul.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-systemkonfiguration',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  templateUrl: './systemkonfiguration.html',
  styleUrl: './systemkonfiguration.less',
})
export class Systemkonfiguration implements OnInit {
  private readonly store = inject(SystemkonfigurationStoreService);
  private readonly berichtStore = inject(KmBerichtStoreService);
  private readonly dialog = inject(DialogDienst);

  readonly versandwege = VERSANDWEGE;
  readonly versandwegLabel = VERSANDWEG_LABEL;
  readonly versandwegHinweis = VERSANDWEG_HINWEIS;

  readonly entwurf = this.store.entwurf;
  readonly laedt = this.store.laedt;
  readonly ladeFehler = this.store.ladeFehler;
  readonly speichert = this.store.speichert;
  readonly speicherFehler = this.store.speicherFehler;
  readonly gespeichert = this.store.gespeichert;
  readonly ungespeichert = this.store.ungespeichert;

  readonly bericht = this.berichtStore.bericht;
  readonly berichtLaedt = this.berichtStore.laedt;
  readonly berichtFehler = this.berichtStore.ladeFehler;
  readonly sendet = this.berichtStore.sendet;
  readonly sendeFehler = this.berichtStore.sendeFehler;
  readonly quittung = this.berichtStore.quittung;

  /** Der gespeicherte Stand entscheidet über den Versand, nicht der Entwurf. */
  private readonly gespeicherteEinstellungen = this.store.gespeicherteEinstellungen;

  readonly gewaehlterWegVerfuegbar = computed(() => {
    const gespeichert = this.gespeicherteEinstellungen();
    return gespeichert !== null && this.store.istVerfuegbar(gespeichert.kmBerichtVersandweg);
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
    void this.store.laden();
    void this.berichtStore.berichtLaden();
  }

  empfaengerAendern(wert: string): void {
    this.store.entwurfAendern({ kmBerichtEmpfaenger: wert });
  }

  betreffAendern(wert: string): void {
    this.store.entwurfAendern({ kmBerichtBetreff: wert });
  }

  versandwegAendern(wert: Versandweg): void {
    this.store.entwurfAendern({ kmBerichtVersandweg: wert });
  }

  istVerfuegbar(weg: Versandweg): boolean {
    return this.store.istVerfuegbar(weg);
  }

  speichern(): void {
    void this.store.speichern();
  }

  verwerfen(): void {
    this.store.entwurfVerwerfen();
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
