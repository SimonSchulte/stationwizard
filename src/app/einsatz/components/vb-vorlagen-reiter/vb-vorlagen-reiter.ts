import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { firstValueFrom } from 'rxjs';
import { DateiQuelle } from '../../../kern/dateien/datei-quelle';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Ladeanzeige, Leerzustand, MeldungsDienst } from '../../../kern/zustand/zustand';
import { VB_GRENZEN, VbVorlage } from '../../models/vb.model';
import { VbDruckDienst } from '../../services/vb-druck';
import { vbInhaltProbleme } from '../../services/vb-pruefung';
import { LaufzettelLayoutWahl } from '../../services/laufzettel-layout-wahl';
import { leseVbExcelDatei, titelAusDateiname } from '../../services/vb-excel-import';
import { VbVorlagenStoreService } from '../../services/vb-vorlagen-store.service';
import { MitVersion } from '../../storage/mit-version';
import { VbVorlageAnsicht } from '../vb-vorlage-ansicht/vb-vorlage-ansicht';
import {
  VbVorlageUploadDaten,
  VbVorlageUploadDialog,
} from '../vb-vorlage-upload-dialog/vb-vorlage-upload-dialog';

/**
 * Reiter „VB“ der Einsatz-Vorlagen: links die Liste, rechts die Ansicht der gewählten
 * Vorlage. Die Vorlage wird erst beim Auswählen und ungepuffert geladen, weil ihre Version für
 * das spätere `If-Match` (Umbenennen, Löschen) gebraucht wird. Bearbeitet wird im VB-Editor.
 */
@Component({
  selector: 'app-vb-vorlagen-reiter',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    Leerzustand,
    Ladeanzeige,
    VbVorlageAnsicht,
  ],
  templateUrl: './vb-vorlagen-reiter.html',
  styleUrl: './vb-vorlagen-reiter.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VbVorlagenReiter implements OnInit {
  private readonly store = inject(VbVorlagenStoreService);
  private readonly dialog = inject(DialogDienst);
  private readonly matDialog = inject(MatDialog);
  private readonly druck = inject(VbDruckDienst);
  private readonly layout = inject(LaufzettelLayoutWahl);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly dateiEingabe = viewChild<ElementRef<HTMLInputElement>>('dateiEingabe');

  readonly vorlagen = this.store.vorlagen;
  readonly listeLaedt = this.store.laedt;

  readonly gewaehlteId = signal<string | null>(null);
  readonly stand = signal<MitVersion<VbVorlage> | null>(null);
  readonly ansichtLaedt = signal(false);
  readonly arbeitet = signal(false);

  ngOnInit(): void {
    void this.store.laden();
  }

  async waehlen(id: string): Promise<void> {
    this.gewaehlteId.set(id);
    this.stand.set(null);
    this.ansichtLaedt.set(true);
    const geladen = await this.store.vorlageLaden(id);
    // Eine inzwischen andere Auswahl behält ihren Stand.
    if (this.gewaehlteId() !== id) return;
    this.ansichtLaedt.set(false);
    if (geladen) this.stand.set(geladen);
    else this.meldungen.fehler(this.store.fehler() || 'Die Vorlage konnte nicht geladen werden.');
  }

  dateiWaehlen(): void {
    this.dateiEingabe()?.nativeElement.click();
  }

  async dateiGewaehlt(ereignis: Event): Promise<void> {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    eingabe.value = '';
    if (datei) await this.hochladen(datei);
  }

  /** Liest eine Excel-Packliste und legt nach der Vorschau eine VB-Vorlage daraus an. */
  async hochladen(datei: DateiQuelle): Promise<void> {
    if (this.arbeitet()) return;
    this.arbeitet.set(true);
    try {
      let ergebnis;
      try {
        ergebnis = await leseVbExcelDatei(
          await datei.arrayBuffer(),
          undefined,
          this.layout.streifenJeSeite(),
        );
      } catch (ursache) {
        this.meldungen.fehler(
          ursache instanceof Error ? ursache.message : 'Die Datei konnte nicht gelesen werden.',
        );
        return;
      }
      const daten: VbVorlageUploadDaten = { titel: titelAusDateiname(datei.name), ergebnis };
      const titel = await firstValueFrom(
        this.matDialog
          .open<VbVorlageUploadDialog, VbVorlageUploadDaten, string | null>(VbVorlageUploadDialog, {
            data: daten,
            width: '640px',
            maxWidth: '94vw',
            restoreFocus: true,
          })
          .afterClosed(),
        { defaultValue: null },
      );
      if (!titel) return;
      // Der Dialog lässt nur speichern, wenn die Vorabprüfung nichts meldet; hier zur Sicherheit.
      if (vbInhaltProbleme(ergebnis.inhalt).length > 0) return;
      const vorlage: VbVorlage = { id: crypto.randomUUID(), titel, inhalt: ergebnis.inhalt };
      if (await this.store.anlegen(vorlage)) {
        this.meldungen.erfolg(`„${titel}“ wurde als VB-Vorlage angelegt.`);
        await this.waehlen(vorlage.id);
      } else {
        this.meldungen.fehler(this.store.fehler() || 'Die Vorlage konnte nicht angelegt werden.');
      }
    } finally {
      this.arbeitet.set(false);
    }
  }

  drucken(): Promise<void> {
    return this.ausgeben('drucken');
  }

  herunterladen(): Promise<void> {
    return this.ausgeben('herunterladen');
  }

  private async ausgeben(weg: 'drucken' | 'herunterladen'): Promise<void> {
    const vorlage = this.stand()?.daten;
    if (!vorlage || this.arbeitet()) return;
    this.arbeitet.set(true);
    try {
      await this.druck[weg](
        { titel: vorlage.titel, beginn: null, ende: null, ort: null },
        vorlage.inhalt,
      );
    } catch {
      this.meldungen.fehler('Der Druck konnte nicht erstellt werden. Bitte erneut versuchen.');
    } finally {
      this.arbeitet.set(false);
    }
  }

  async umbenennen(): Promise<void> {
    const aktuell = this.stand();
    if (!aktuell || this.arbeitet()) return;
    const neuerTitel = await this.dialog.eingabe('', 'Vorlage umbenennen', 'Titel der Vorlage', {
      wert: aktuell.daten.titel,
      bestaetigenLabel: 'Umbenennen',
      maxLaenge: VB_GRENZEN.text,
    });
    if (neuerTitel === null || neuerTitel === aktuell.daten.titel) return;
    this.arbeitet.set(true);
    try {
      const { id } = aktuell.daten;
      const version = await this.store.speichern(
        { ...aktuell.daten, titel: neuerTitel },
        aktuell.version,
      );
      if (version !== null) {
        if (this.gewaehlteId() === id) {
          this.stand.set({ daten: { ...aktuell.daten, titel: neuerTitel }, version });
        }
        this.meldungen.erfolg('Die Vorlage wurde umbenannt.');
      } else if (this.store.konflikt()) {
        this.meldungen.fehler(
          'Die Vorlage wurde inzwischen geändert und nicht umbenannt. Bitte erneut öffnen und prüfen.',
        );
        await this.waehlen(id);
      } else {
        this.meldungen.fehler(this.store.fehler() || 'Die Vorlage konnte nicht umbenannt werden.');
      }
    } finally {
      this.arbeitet.set(false);
    }
  }

  async loeschen(): Promise<void> {
    const aktuell = this.stand();
    if (!aktuell || this.arbeitet()) return;
    const { id, titel } = aktuell.daten;
    const bestaetigt = await this.dialog.bestaetigen(
      `„${titel}“ wird endgültig gelöscht. Bereits aus dieser Vorlage angelegte Vorbereitungen ` +
        'bleiben unverändert erhalten, weil sie eine eigene Kopie tragen.',
      'VB-Vorlage löschen',
      'Endgültig löschen',
    );
    if (!bestaetigt) return;
    this.arbeitet.set(true);
    try {
      if (await this.store.loeschen(id, aktuell.version)) {
        if (this.gewaehlteId() === id) {
          this.gewaehlteId.set(null);
          this.stand.set(null);
        }
        this.meldungen.erfolg(`„${titel}“ wurde gelöscht.`);
      } else if (this.store.konflikt()) {
        this.meldungen.fehler(
          'Die Vorlage wurde inzwischen geändert und nicht gelöscht. Bitte erneut öffnen und prüfen.',
        );
        await this.waehlen(id);
      } else {
        this.meldungen.fehler(this.store.fehler() || 'Die Vorlage konnte nicht gelöscht werden.');
      }
    } finally {
      this.arbeitet.set(false);
    }
  }
}
