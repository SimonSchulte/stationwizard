import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom, map } from 'rxjs';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Leerzustand, MeldungsDienst } from '../../../kern/zustand/zustand';
import { VorlageWahlDialog } from '../../components/vorlage-wahl-dialog/vorlage-wahl-dialog';
import { EinsatzListenEintrag } from '../../models/einsatz.model';
import { ApiVorbereitungStorage } from '../../storage/api-vorbereitung-storage';
import { VorbereitungStorage } from '../../storage/vorbereitung-storage';
import { einsatzZeitraumText } from '../../services/einsatz-anzeige';
import { EinsatzPepKontext } from '../../services/einsatz-pep-kontext';
import { EinsatzStoreService } from '../../services/einsatz-store.service';
import { PlanungOeffnenDienst } from '../../services/planung-oeffnen';
import { VbDruckDienst } from '../../services/vb-druck';
import { VbEditorStoreService } from '../../services/vb-editor-store.service';

/** Einsatzseite: Kopfdaten, Karte für den PEP und Karte für die Vorbereitung (VB). */
@Component({
  selector: 'app-einsatz-detail',
  imports: [
    Ladeanzeige,
    Leerzustand,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    Seitenkopf,
  ],
  templateUrl: './einsatz-detail.html',
  styleUrl: './einsatz-detail.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EinsatzDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly pepKontext = inject(EinsatzPepKontext);
  private readonly planungOeffnen = inject(PlanungOeffnenDienst);
  private readonly vbEditor = inject(VbEditorStoreService);
  private readonly vbDruck = inject(VbDruckDienst);
  private readonly vorbereitungen: VorbereitungStorage = inject(ApiVorbereitungStorage);
  protected readonly store = inject(EinsatzStoreService);

  private readonly einsatzId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: this.route.snapshot?.paramMap.get('id') ?? null,
  });

  /** `true`, sobald die Einsatzliste für diese Seite einmal frisch geladen wurde. */
  protected readonly aktualisiert = signal(false);
  protected readonly pepLaeuft = signal(false);
  protected readonly vbLaeuft = signal(false);

  protected readonly einsatz = computed<EinsatzListenEintrag | null>(
    () => this.store.einsaetze().find((e) => e.id === this.einsatzId()) ?? null,
  );
  protected readonly zeitraum = computed(() => {
    const e = this.einsatz();
    return e ? einsatzZeitraumText(e.beginn, e.ende) : '';
  });

  async ngOnInit(): Promise<void> {
    await this.store.laden();
    this.aktualisiert.set(true);
  }

  protected neuLaden(): void {
    this.aktualisiert.set(false);
    void this.ngOnInit();
  }

  protected async pepOeffnen(): Promise<void> {
    const einsatz = this.einsatz();
    const pepId = einsatz?.pepId;
    if (!einsatz || !pepId || this.pepLaeuft()) return;
    this.pepLaeuft.set(true);
    try {
      const ergebnis = await this.planungOeffnen.cloudOeffnen(pepId, (planungId) =>
        this.pepKontext.merken(einsatz.id, planungId, pepId),
      );
      if (ergebnis.fehler) this.meldungen.fehler(ergebnis.fehler);
    } finally {
      this.pepLaeuft.set(false);
    }
  }

  protected async pepAnlegen(): Promise<void> {
    const einsatz = this.einsatz();
    if (!einsatz || this.pepLaeuft()) return;
    this.pepLaeuft.set(true);
    const merken = (planungId: string) => this.pepKontext.merken(einsatz.id, planungId, null);
    try {
      if (einsatz.hiorgVeranstaltungId) {
        const gruppe = await this.planungOeffnen.gruppeFuerVeranstaltung(
          einsatz.hiorgVeranstaltungId,
        );
        if (gruppe) {
          await this.planungOeffnen.efsGruppeOeffnen(gruppe, merken);
          return;
        }
        this.meldungen.warnung(
          'Die HiOrg-Veranstaltung wurde im Abruf nicht gefunden. Es wurde eine leere Planung angelegt.',
        );
      }
      await this.planungOeffnen.leerePlanungOeffnen(
        einsatz.titel,
        einsatz.beginn,
        einsatz.ende,
        merken,
      );
    } catch (fehler) {
      this.meldungen.fehler(
        fehler instanceof Error ? fehler.message : 'Die Planung konnte nicht angelegt werden.',
      );
    } finally {
      this.pepLaeuft.set(false);
    }
  }

  protected async vbAusVorlageAnlegen(): Promise<void> {
    const einsatz = this.einsatz();
    if (!einsatz || this.vbLaeuft()) return;
    const vorlageId = await firstValueFrom(
      this.dialog
        .open<VorlageWahlDialog, void, string>(VorlageWahlDialog, {
          width: '560px',
          maxWidth: '94vw',
        })
        .afterClosed(),
      { defaultValue: undefined },
    );
    if (!vorlageId) return;
    await this.vbAnlegen(() => this.vbEditor.ausVorlageAnlegen(einsatz.id, vorlageId));
  }

  protected async vbLeerAnlegen(): Promise<void> {
    const einsatz = this.einsatz();
    if (!einsatz || this.vbLaeuft()) return;
    await this.vbAnlegen(() => this.vbEditor.leerAnlegen(einsatz.id));
  }

  private async vbAnlegen(anlegen: () => Promise<boolean>): Promise<void> {
    const einsatz = this.einsatz();
    if (!einsatz) return;
    this.vbLaeuft.set(true);
    try {
      if (await anlegen()) {
        await this.router.navigate(['/einsatzplanung/einsatz', einsatz.id, 'vb']);
      } else {
        this.meldungen.fehler(
          this.vbEditor.ladeFehler() || 'Die Vorbereitung konnte nicht angelegt werden.',
        );
      }
    } finally {
      this.vbLaeuft.set(false);
    }
  }

  protected async vbDrucken(): Promise<void> {
    const einsatz = this.einsatz();
    if (!einsatz || this.vbLaeuft()) return;
    this.vbLaeuft.set(true);
    try {
      const stand = await this.vorbereitungen.ladeVorbereitung(einsatz.id);
      if (!stand) {
        this.meldungen.fehler('Der Einsatz hat keine Vorbereitung zum Drucken.');
        return;
      }
      await this.vbDruck.drucken(
        { titel: einsatz.titel, beginn: einsatz.beginn, ende: einsatz.ende, ort: einsatz.ort },
        stand.daten.inhalt,
      );
    } catch (fehler) {
      this.meldungen.fehler(
        fehler instanceof Error && fehler.message
          ? `Die Vorbereitung konnte nicht gedruckt werden: ${fehler.message}`
          : 'Die Vorbereitung konnte nicht gedruckt werden.',
      );
    } finally {
      this.vbLaeuft.set(false);
    }
  }
}
