import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PepEditorKontext } from '../../services/pep-editor-kontext';
import { SaveLoadService } from '../../services/save-load.service';
import { HiorgVeranstaltungenQuelle } from '../../services/hiorg-veranstaltungen-quelle.service';
import { EinsatzAktionenDienst } from '../../services/einsatz-aktionen';
import { EinsatzStoreService } from '../../services/einsatz-store.service';
import {
  baueEinsatzListe,
  filtereEinsaetze,
  gruppiereNachMonat,
  istFilterAktiv,
  mitAbstand,
} from '../../services/einsatz-liste';
import {
  EinsatzAnlegenDaten,
  EinsatzAnlegenDialog,
} from '../../components/einsatz-anlegen-dialog/einsatz-anlegen-dialog';
import { efsTrefferWaehlen } from '../../components/efs-treffer-dialog/efs-treffer-dialog';
import type { EfsAbgleichArt } from '../../services/efs-abgleich';
import { EfsQuelle } from '../../services/efs-quelle.service';
import type { EinsatzListenZeile } from '../../services/einsatz-liste';
import { EinsatzKarte } from '../../components/einsatz-karte/einsatz-karte';
import { HIORG_ERGEBNIS_TEXTE } from '../../../kern/hiorg/hiorg-personal.service';
import { HiorgArt } from '../../models/hiorg-veranstaltung.model';
import { Verbindungsstatus } from '../../../kern/verbindungsstatus/verbindungsstatus';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
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
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
    Suchfeld,
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
  readonly quelle = inject(HiorgVeranstaltungenQuelle);
  protected readonly efs = inject(EfsQuelle);
  private readonly kontext = inject(PepEditorKontext);
  private readonly einsatzStore = inject(EinsatzStoreService);
  protected readonly aktionen = inject(EinsatzAktionenDienst);
  private readonly dialog = inject(MatDialog);
  private readonly meldungen = inject(MeldungsDienst);

  readonly einsatzListeLaedt = this.einsatzStore.laedt;
  readonly einsatzListeFehler = this.einsatzStore.fehler;
  readonly einsatzListeGeladen = this.einsatzStore.geladen;

  /** Anstehende und vergangene Einsätze (HiOrg und ohne HiOrg) als eine Liste von Karten. */
  readonly einsatzListe = computed(() =>
    baueEinsatzListe(this.quelle.veranstaltungen(), this.einsatzStore.einsaetze(), new Date()),
  );

  /** Filter und Ansicht gelten nur für die Sitzung und werden nicht gespeichert. */
  readonly suche = signal('');
  readonly ansicht = signal<'anstehend' | 'vergangen'>('anstehend');
  readonly pepFehlt = signal(false);
  readonly aufbauFehlt = signal(false);
  readonly ohneHiorg = signal(false);
  /** Nur Einsätze ohne sicheren EFS-Treffer; wirkt nur, solange EFS erreichbar ist. */
  readonly ohneEfs = signal(false);
  readonly art = signal<'alle' | HiorgArt>('alle');

  readonly filterAktiv = computed(
    () =>
      istFilterAktiv({
        suche: this.suche(),
        pepFehlt: this.pepFehlt(),
        aufbauFehlt: this.aufbauFehlt(),
        ohneHiorg: this.ohneHiorg(),
        art: this.art(),
      }) || this.ohneEfsAktiv(),
  );

  private readonly ohneEfsAktiv = computed(() => this.ohneEfs() && this.efs.erreichbar());

  /** Gefilterte Karten der gewählten Ansicht, nach Monat gruppiert. */
  readonly monatsGruppen = computed(() => {
    const anstehend = this.ansicht() === 'anstehend';
    const liste = this.einsatzListe();
    const gefiltert = filtereEinsaetze(anstehend ? liste.anstehend : liste.vergangen, {
      suche: this.suche(),
      pepFehlt: this.pepFehlt(),
      aufbauFehlt: this.aufbauFehlt(),
      ohneHiorg: this.ohneHiorg(),
      art: this.art(),
    }).filter((zeile) => !this.ohneEfsAktiv() || this.efsArt(zeile) !== 'treffer');
    return gruppiereNachMonat(mitAbstand(gefiltert, new Date(), anstehend));
  });

  readonly gesamtAnzahl = computed(
    () => this.einsatzListe().anstehend.length + this.einsatzListe().vergangen.length,
  );

  /** Ergebnis des EFS-Abgleichs einer Karte; `null`, solange EFS nicht erreichbar ist. */
  efsArt(zeile: EinsatzListenZeile): EfsAbgleichArt | null {
    return this.efs.erreichbar() ? this.efs.abgleich(zeile.titel, zeile.beginn).art : null;
  }

  /** Lässt bei mehreren möglichen Treffern den passenden EFS-Einsatz wählen. */
  async efsPruefen(zeile: EinsatzListenZeile): Promise<void> {
    const abgleich = this.efs.abgleich(zeile.titel, zeile.beginn);
    if (abgleich.kandidaten.length === 0) return;
    const gewaehlt = await efsTrefferWaehlen(this.dialog, {
      titel: zeile.titel,
      beginn: zeile.beginn,
      kandidaten: abgleich.kandidaten,
    });
    if (gewaehlt === undefined) return;
    this.efs.entscheide(zeile.titel, zeile.beginn, gewaehlt);
  }

  /** Setzt Suche und Filter zurück; die gewählte Ansicht bleibt. */
  filterZuruecksetzen(): void {
    this.suche.set('');
    this.pepFehlt.set(false);
    this.aufbauFehlt.set(false);
    this.ohneHiorg.set(false);
    this.ohneEfs.set(false);
    this.art.set('alle');
  }

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
    void this.einsatzStore.laden();
    void this.quelle.laden();
    void this.efs.laden();
  }

  /** Lädt HiOrg-Veranstaltungen und die gespeicherten Einsätze neu. */
  async aktualisieren(): Promise<void> {
    await Promise.all([this.einsatzStore.laden(), this.quelle.laden(), this.efs.laden(true)]);
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
    this.meldungen.erfolg('Einsatz angelegt. PEP und Aufbau legst du in der Zeile an.');
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
    // Eine Datei gehört zu keinem Einsatz; „Speichern“ im Editor ordnet sie einem zu.
    this.kontext.loeschen();
    this.store.oeffneGespeichert(result.planung);
    void this.router.navigate(['/einsatzplanung/editor']);
  }
}
