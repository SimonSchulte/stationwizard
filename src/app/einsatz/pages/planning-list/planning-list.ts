import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { DatePipe, formatDate } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PlanungCloudService } from '../../services/planung-cloud.service';
import { PlanungOeffnenDienst } from '../../services/planung-oeffnen';
import { SaveLoadService } from '../../services/save-load.service';
import { EfsApiService } from '../../services/efs-api.service';
import { EinsatzAktionenDienst } from '../../services/einsatz-aktionen';
import { EinsatzStoreService } from '../../services/einsatz-store.service';
import { baueEinsatzListe } from '../../services/einsatz-liste';
import {
  EinsatzAnlegenDaten,
  EinsatzAnlegenDialog,
} from '../../components/einsatz-anlegen-dialog/einsatz-anlegen-dialog';
import { EinsatzKarte } from '../../components/einsatz-karte/einsatz-karte';
import { EinsatzListenEintrag } from '../../models/einsatz.model';
import { HIORG_ERGEBNIS_TEXTE } from '../../../kern/hiorg/hiorg-personal.service';
import { EfsEinsatz, EfsEinsatzGruppe } from '../../models/planung.model';
import { Verbindungsstatus } from '../../../kern/verbindungsstatus/verbindungsstatus';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Leerzustand, Meldung, MeldungsDienst } from '../../../kern/zustand/zustand';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-planning-list',
  imports: [
    EinsatzKarte,
    Leerzustand,
    Meldung,
    Ladeanzeige,
    Seitenkopf,
    Verbindungsstatus,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatExpansionModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './planning-list.html',
  styleUrl: './planning-list.less',
})
export class PlanningList implements OnInit {
  private readonly store = inject(PlanungStoreService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly saveLoad = inject(SaveLoadService);
  readonly efsApi = inject(EfsApiService);
  private readonly planungOeffnen = inject(PlanungOeffnenDienst);
  private readonly einsatzStore = inject(EinsatzStoreService);
  protected readonly aktionen = inject(EinsatzAktionenDienst);
  private readonly dialog = inject(MatDialog);
  private readonly meldungen = inject(MeldungsDienst);

  readonly planungen = this.store.planungen;
  readonly cloud = inject(PlanungCloudService);
  readonly cloudLadeId = signal<string | null>(null);
  readonly cloudFehler = signal('');

  readonly einsatzListeLaedt = this.einsatzStore.laedt;
  readonly einsatzListeFehler = this.einsatzStore.fehler;
  readonly einsatzListeGeladen = this.einsatzStore.geladen;

  readonly efsEinsaetze = signal<EfsEinsatz[]>([]);
  readonly efsLoading = signal(false);
  readonly efsError = signal<string | null>(null);

  readonly efsGruppen = computed(() => this.efsApi.groupEinsaetze(this.efsEinsaetze()));

  /** Anstehende und vergangene Einsätze (HiOrg und ohne HiOrg) als eine Liste von Karten. */
  readonly einsatzListe = computed(() =>
    baueEinsatzListe(this.efsGruppen(), this.einsatzStore.einsaetze(), new Date()),
  );

  /** Rückmeldung nach der HiOrg-Anmeldung (`/hiorg/rueckruf` leitet mit `?hiorg=` hierher). */
  readonly hiorgRueckmeldung = signal('');
  readonly hiorgVerbunden = signal(false);

  ngOnInit(): void {
    const hiorg = this.route.snapshot.queryParamMap.get('hiorg');
    if (hiorg !== null) {
      this.hiorgRueckmeldung.set(
        Object.hasOwn(HIORG_ERGEBNIS_TEXTE, hiorg)
          ? HIORG_ERGEBNIS_TEXTE[hiorg]
          : HIORG_ERGEBNIS_TEXTE['fehlgeschlagen'],
      );
      this.hiorgVerbunden.set(hiorg === 'verbunden');
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { hiorg: null },
        replaceUrl: true,
      });
    }
    void this.cloud.listeLaden();
    void this.einsatzStore.laden();
    void this.loadEfsEinsaetze();
  }

  /** Lädt HiOrg-Veranstaltungen und die gespeicherten Einsätze neu. */
  async aktualisieren(): Promise<void> {
    await Promise.all([this.einsatzStore.laden(), this.loadEfsEinsaetze()]);
  }

  async cloudPlanungLaden(id: string): Promise<void> {
    if (this.cloudLadeId()) return;
    this.cloudLadeId.set(id);
    this.cloudFehler.set('');
    try {
      const ergebnis = await this.planungOeffnen.cloudOeffnen(id);
      if (ergebnis.fehler) this.cloudFehler.set(ergebnis.fehler);
    } finally {
      this.cloudLadeId.set(null);
    }
  }

  async loadEfsEinsaetze(): Promise<void> {
    this.efsLoading.set(true);
    this.efsError.set(null);
    try {
      const einsaetze = await this.efsApi.getVeranstaltungen();
      this.efsEinsaetze.set(einsaetze);
    } catch (fehler) {
      this.efsError.set(
        fehler instanceof Error
          ? fehler.message
          : 'Die Veranstaltungen konnten nicht geladen werden.',
      );
    } finally {
      this.efsLoading.set(false);
    }
  }

  /** Öffnet die Planung zur Veranstaltung direkt im Editor (ohne Einsatzseite). */
  async openEfsGruppe(gruppe: EfsEinsatzGruppe): Promise<void> {
    await this.planungOeffnen.efsGruppeOeffnen(gruppe);
  }

  /** Legt über einen kleinen Dialog einen Einsatz ohne HiOrg-Veranstaltung an. */
  async einsatzAnlegen(): Promise<void> {
    const daten = await firstValueFrom(
      this.dialog
        .open<EinsatzAnlegenDialog, void, EinsatzAnlegenDaten>(EinsatzAnlegenDialog, {
          width: '520px',
          maxWidth: '94vw',
        })
        .afterClosed(),
      { defaultValue: undefined },
    );
    if (!daten) return;
    const einsatz = await this.einsatzStore.einsatzAnlegen(daten);
    if (!einsatz) {
      this.meldungen.fehler(
        this.einsatzStore.fehler() || 'Der Einsatz konnte nicht angelegt werden.',
      );
      return;
    }
    this.meldungen.erfolg('Einsatz angelegt. PEP und VB legst du in der Zeile an.');
  }

  openPlanung(id: string): void {
    this.store.openPlanung(id);
    this.router.navigate(['/einsatzplanung/editor']);
  }

  async loadFromFile(): Promise<void> {
    const kontext = this.store.active();
    const result = await this.saveLoad.load();
    if (!result || this.store.active() !== kontext) return;
    if (result.versionWarning) {
      await this.dialogDienst.hinweis(
        'Versionswarnung: Die Datei wurde mit einer anderen Version gespeichert. Die Daten wurden trotzdem geladen, können aber unvollständig sein.',
      );
    }
    if (this.store.active() !== kontext) return;
    this.store.importPlanung(result.planung);
    this.router.navigate(['/einsatzplanung/editor']);
  }

  createNew(): void {
    const name = `Neue Planung ${formatDate(new Date(), 'dd.MM.yyyy', 'de-DE')}`;
    this.store.createPlanung(name);
    this.router.navigate(['/einsatzplanung/editor']);
  }
}
