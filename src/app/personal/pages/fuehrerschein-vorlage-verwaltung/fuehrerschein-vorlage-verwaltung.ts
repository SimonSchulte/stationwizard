import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import {
  FUEHRERSCHEIN_VORLAGE_MEDIENTYP,
  FuehrerscheinVorlageService,
  type FuehrerscheinVorlageMetadaten,
} from '../../services/fuehrerschein-vorlage.service';

const DATEINAME_MUSTER = /\.docx$/i;

/**
 * Verwaltungsseite zum Hinterlegen/Ersetzen der Word-Vorlage der
 * Führerscheinliste. Nur Ablage – das Füllen selbst passiert beim Download
 * in `fuehrerscheinliste.ts`.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fuehrerschein-vorlage-verwaltung',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatToolbarModule, RouterLink],
  templateUrl: './fuehrerschein-vorlage-verwaltung.html',
  styleUrl: './fuehrerschein-vorlage-verwaltung.less',
})
export class FuehrerscheinVorlageVerwaltung implements OnInit {
  private readonly vorlageDienst = inject(FuehrerscheinVorlageService);
  private readonly dialogDienst = inject(DialogDienst);

  readonly vorlage = signal<FuehrerscheinVorlageMetadaten | null>(null);
  readonly laedt = signal(false);
  readonly fehler = signal('');

  readonly gewaehlteDatei = signal<File | null>(null);
  readonly hochladeFehler = signal('');
  readonly ladeVorgang = signal(false);
  readonly erfolg = signal('');

  readonly herunterladeVorgang = signal(false);
  readonly herunterladenFehler = signal('');

  ngOnInit(): void {
    void this.laden();
  }

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      this.vorlage.set(await this.vorlageDienst.metadatenLaden());
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Der Vorlagenstatus konnte nicht geladen werden.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  dateiGewaehlt(ereignis: Event): void {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    this.hochladeFehler.set('');
    this.erfolg.set('');
    if (datei && !DATEINAME_MUSTER.test(datei.name)) {
      this.hochladeFehler.set('Nur .docx-Dateien werden angenommen.');
      this.gewaehlteDatei.set(null);
    } else {
      this.gewaehlteDatei.set(datei ?? null);
    }
    // Zurücksetzen, damit dieselbe Datei nach einer Korrektur erneut wählbar ist.
    eingabe.value = '';
  }

  async hochladen(): Promise<void> {
    const datei = this.gewaehlteDatei();
    if (!datei || this.ladeVorgang()) return;
    const bestehend = this.vorlage();
    if (bestehend?.vorhanden) {
      const bestaetigt = await this.dialogDienst.bestaetigen(
        `Die bestehende Vorlage „${bestehend.dateiname}" wird durch „${datei.name}" ersetzt. Bereits heruntergeladene Führerscheinlisten bleiben davon unberührt.`,
        'Vorlage ersetzen',
        'Ersetzen',
      );
      if (!bestaetigt) return;
    }
    this.ladeVorgang.set(true);
    this.hochladeFehler.set('');
    try {
      this.vorlage.set(await this.vorlageDienst.hochladen(datei));
      this.gewaehlteDatei.set(null);
      this.erfolg.set('Die Vorlage wurde gespeichert.');
    } catch (fehler) {
      this.hochladeFehler.set(
        fehler instanceof Error ? fehler.message : 'Die Vorlage konnte nicht gespeichert werden.',
      );
    } finally {
      this.ladeVorgang.set(false);
    }
  }

  async herunterladen(): Promise<void> {
    if (this.herunterladeVorgang()) return;
    this.herunterladeVorgang.set(true);
    this.herunterladenFehler.set('');
    try {
      const daten = await this.vorlageDienst.datenLaden();
      dateiHerunterladen(
        daten,
        this.vorlage()?.dateiname ?? 'fuehrerschein-vorlage.docx',
        FUEHRERSCHEIN_VORLAGE_MEDIENTYP,
      );
    } catch (fehler) {
      this.herunterladenFehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Die Vorlage konnte nicht heruntergeladen werden.',
      );
    } finally {
      this.herunterladeVorgang.set(false);
    }
  }
}
