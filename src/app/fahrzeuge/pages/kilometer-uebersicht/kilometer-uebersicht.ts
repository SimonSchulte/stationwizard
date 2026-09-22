import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { SystemkonfigurationStoreService } from '../../../systemkonfiguration/services/systemkonfiguration-store.service';
import { BerichtZeile } from '../../models/km-bericht.model';
import { KmBerichtStoreService } from '../../services/km-bericht-store.service';
import {
  ermittleKilometerAmpel,
  KILOMETER_AMPEL_SCHWELLENWERTE_STANDARD,
  KilometerAmpel,
  restmonateImJahr,
} from '../../services/kilometer-soll';

interface AnzeigeZeile {
  zeile: BerichtZeile;
  ampel: KilometerAmpel | null;
}

/**
 * Fuhrpark-weite Kilometerübersicht: Vorschau und Versand des
 * Kilometerstandsberichts. Empfänger, Betreff und Versandweg stehen in der
 * Systemkonfiguration unter „Email Versand" – hier wird nur noch gegen den
 * dort gespeicherten Stand gesendet, ohne ihn zu bearbeiten.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kilometer-uebersicht',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule],
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

  /**
   * Standardmäßig nur Fahrzeuge mit vorgeschriebener Laufleistung
   * (`sollKm > 0`) – der Bericht dient der Kontrolle dieser Vorgabe,
   * Fahrzeuge der Organisation ohne Vorgabe würden ihn nur unnötig füllen.
   */
  readonly alleFahrzeugeAnzeigen = signal(false);

  private readonly ampelSchwellenwerte = computed(() => {
    const einstellungen = this.gespeicherteEinstellungen();
    return einstellungen
      ? {
          gelbMonate: einstellungen.kmAmpelSchwellenwertGelbMonate,
          rotMonate: einstellungen.kmAmpelSchwellenwertRotMonate,
        }
      : KILOMETER_AMPEL_SCHWELLENWERTE_STANDARD;
  });

  readonly angezeigteZeilen = computed<AnzeigeZeile[]>(() => {
    const bericht = this.bericht();
    if (!bericht) return [];
    const schwellenwerte = this.ampelSchwellenwerte();
    const restMonate = restmonateImJahr(bericht.stichtag, bericht.jahr);
    return bericht.zeilen
      .filter((zeile) => this.alleFahrzeugeAnzeigen() || zeile.sollKm > 0)
      .map((zeile) => ({
        zeile,
        ampel: ermittleKilometerAmpel(zeile, restMonate, schwellenwerte),
      }));
  });

  readonly angezeigteOhneAblesung = computed(
    () => this.angezeigteZeilen().filter((eintrag) => eintrag.zeile.letzterStand === null).length,
  );

  readonly angezeigteUnterSoll = computed(
    () =>
      this.angezeigteZeilen().filter(
        (eintrag) => eintrag.zeile.sollKm > 0 && (eintrag.zeile.restKm ?? eintrag.zeile.sollKm) > 0,
      ).length,
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
