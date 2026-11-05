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
import { PEP_GRENZEN, PepVorlage } from '../../models/pep.model';
import { planungZuPepVorlageInhalt } from '../../services/pep-abbildung';
import { lesePepDatei } from '../../services/pep-datei';
import { PepVorlagenStoreService } from '../../services/pep-vorlagen-store.service';
import { MitVersion } from '../../storage/mit-version';
import { PepVorlageAnsicht } from '../pep-vorlage-ansicht/pep-vorlage-ansicht';
import {
  PepVorlageUploadDaten,
  PepVorlageUploadDialog,
} from '../pep-vorlage-upload-dialog/pep-vorlage-upload-dialog';

/**
 * Reiter „PEP“ der Einsatz-Vorlagen: links die Liste, rechts die Ansicht der gewählten
 * Vorlage. Die Vorlage wird erst beim Auswählen und ungepuffert geladen, weil ihre Version für
 * das spätere `If-Match` (Umbenennen, Löschen) gebraucht wird. Bearbeitet wird im PEP-Editor.
 */
@Component({
  selector: 'app-pep-vorlagen-reiter',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    Leerzustand,
    Ladeanzeige,
    PepVorlageAnsicht,
  ],
  templateUrl: './pep-vorlagen-reiter.html',
  styleUrl: './pep-vorlagen-reiter.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PepVorlagenReiter implements OnInit {
  private readonly store = inject(PepVorlagenStoreService);
  private readonly dialog = inject(DialogDienst);
  private readonly matDialog = inject(MatDialog);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly dateiEingabe = viewChild<ElementRef<HTMLInputElement>>('dateiEingabe');

  readonly vorlagen = this.store.vorlagen;
  readonly listeLaedt = this.store.laedt;

  readonly gewaehlteId = signal<string | null>(null);
  readonly stand = signal<MitVersion<PepVorlage> | null>(null);
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

  /** Liest eine Einsatzplandatei und legt nach der Vorschau eine PEP-Vorlage daraus an. */
  async hochladen(datei: DateiQuelle): Promise<void> {
    if (this.arbeitet()) return;
    this.arbeitet.set(true);
    try {
      let gelesen;
      try {
        gelesen = lesePepDatei(await datei.text());
      } catch (ursache) {
        this.meldungen.fehler(
          ursache instanceof Error ? ursache.message : 'Die Datei konnte nicht gelesen werden.',
        );
        return;
      }
      if (gelesen.versionWarning) {
        this.meldungen.warnung(
          'Die Datei hat eine andere Dateiversion als erwartet. Bitte die Vorschau sorgfältig prüfen.',
        );
      }
      const inhalt = planungZuPepVorlageInhalt(gelesen.planung);
      const daten: PepVorlageUploadDaten = {
        titel: gelesen.planung.name || datei.name.replace(/\.(pep\.)?json$/i, ''),
        posten: inhalt.posten.length,
        positionen: inhalt.posten.reduce((summe, p) => summe + p.positionen.length, 0),
        einsatzkraefte: gelesen.planung.einsatzkraefte.length,
      };
      if (inhalt.posten.length > PEP_GRENZEN.posten) {
        this.meldungen.fehler(`Eine Vorlage kann höchstens ${PEP_GRENZEN.posten} Posten haben.`);
        return;
      }
      const titel = await firstValueFrom(
        this.matDialog
          .open<PepVorlageUploadDialog, PepVorlageUploadDaten, string | null>(
            PepVorlageUploadDialog,
            { data: daten, width: '520px', maxWidth: '94vw', restoreFocus: true },
          )
          .afterClosed(),
        { defaultValue: null },
      );
      if (!titel) return;
      const vorlage: PepVorlage = { id: crypto.randomUUID(), titel, inhalt };
      if (await this.store.anlegen(vorlage)) {
        this.meldungen.erfolg(`„${titel}“ wurde als PEP-Vorlage angelegt.`);
        await this.waehlen(vorlage.id);
      } else {
        this.meldungen.fehler(this.store.fehler() || 'Die Vorlage konnte nicht angelegt werden.');
      }
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
      maxLaenge: PEP_GRENZEN.titel,
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
      `„${titel}“ wird endgültig gelöscht. Bereits aus dieser Vorlage angelegte Pläne bleiben ` +
        'unverändert erhalten.',
      'PEP-Vorlage löschen',
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
