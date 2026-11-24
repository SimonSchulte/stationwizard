import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { BenutzerverwaltungStoreService } from '../../../benutzerverwaltung/services/benutzerverwaltung-store.service';
import { AmpelChip } from '../../../fahrzeuge/components/ampel-chip/ampel-chip';
import { anzeigenameAusEmail } from '../../../kern/text/anzeigename';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Meldung } from '../../../kern/zustand/zustand';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { VorgangStufen } from '../../components/vorgang-stufen/vorgang-stufen';
import { MELDUNG_ART_LABEL } from '../../models/schadensmeldung.model';
import {
  LETZTE_STUFE,
  STUFE_ANGEBOTE,
  STUFE_EINGEREICHT,
  STUFE_GENEHMIGT,
  VORGANG_ART_LABEL,
  VORGANG_STUFEN,
  pflichtUnterschriftenAnzahl,
} from '../../models/vorgang.model';
import {
  ANGEBOT_GROESSE_MAX,
  ANGEBOTE_JE_VORGANG_MAX,
  istAngebotsdatei,
} from '../../models/postfach.model';
import { VorgangStoreService } from '../../services/vorgang-store.service';
import { VorgangVersandService } from '../../services/vorgang-versand.service';

/** Ein Vorgang „Fahrzeug/Material defekt“: Stufen, Meldung, Angebote und Verlauf. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vorgang-detail',
  imports: [
    AmpelChip,
    DatePipe,
    Ladeanzeige,
    Leerzustand,
    Meldung,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    Seitenkopf,
    VorgangStufen,
  ],
  templateUrl: './vorgang-detail.html',
  styleUrl: './vorgang-detail.less',
})
export class VorgangDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly benutzerStore = inject(BenutzerverwaltungStoreService);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly versand = inject(VorgangVersandService);
  private readonly dialog = inject(DialogDienst);
  readonly store = inject(VorgangStoreService);

  readonly ART_LABEL = VORGANG_ART_LABEL;
  readonly MELDUNG_ART = MELDUNG_ART_LABEL;
  readonly STUFEN = VORGANG_STUFEN;
  readonly STUFE_EINGEREICHT = STUFE_EINGEREICHT;
  readonly anzeigename = anzeigenameAusEmail;

  readonly id = toSignal(
    this.route.paramMap.pipe(
      map((p) => p.get('id') ?? ''),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') ?? '' },
  );

  readonly angebotEndungen = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
  readonly angebotMax = ANGEBOTE_JE_VORGANG_MAX;

  readonly daten = computed(() => this.store.aktuell()?.daten ?? null);
  readonly stufe = computed(() => this.daten()?.vorgang.stufe ?? -1);
  readonly naechste = computed(() => this.stufe() + 1);
  readonly istZugfuehrung = this.benutzerStore.istZugfuehrung;
  readonly pflichtUnterschriften = computed(() =>
    pflichtUnterschriftenAnzahl(this.daten()?.unterschriften ?? []),
  );

  /** Warum der nächste Schritt noch nicht geht; leer heißt: möglich. Der Worker prüft dasselbe. */
  readonly hinweis = computed(() => {
    const daten = this.daten();
    if (!daten || this.naechste() > LETZTE_STUFE) return '';
    if (this.naechste() === STUFE_ANGEBOTE && daten.angebote.length < 1) {
      return 'Mindestens ein Angebot hochladen oder übernehmen.';
    }
    if (this.naechste() === STUFE_GENEHMIGT && !this.istZugfuehrung()) {
      return 'Genehmigt setzt nur die Zugführung.';
    }
    return '';
  });

  readonly kannZurueck = computed(
    () => this.stufe() >= 1 && (this.stufe() < STUFE_EINGEREICHT || this.istZugfuehrung()),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.store.laden(id);
    });
  }

  ngOnInit(): void {
    void this.benutzerStore.listeLaden();
  }

  async weiter(): Promise<void> {
    const nach = this.naechste();
    if (await this.store.stufeWechseln(nach)) {
      this.meldungen.erfolg(`Stufe erreicht: ${VORGANG_STUFEN[nach]}.`);
    } else {
      this.meldungen.fehler(this.store.aktionFehler());
    }
  }

  /** Angebote lassen sich bis zum Einreichen ändern; der Worker sperrt danach ebenfalls. */
  readonly angeboteBearbeitbar = computed(() => this.stufe() < STUFE_EINGEREICHT);

  async angeboteWaehlen(eingabe: HTMLInputElement): Promise<void> {
    const dateien = Array.from(eingabe.files ?? []);
    eingabe.value = '';
    if (dateien.length === 0) return;
    const frei = ANGEBOTE_JE_VORGANG_MAX - (this.daten()?.angebote.length ?? 0);
    if (dateien.length > frei) {
      this.meldungen.warnung(`Höchstens ${ANGEBOTE_JE_VORGANG_MAX} Angebote je Vorgang.`);
      return;
    }
    const falsch = dateien.find(
      (d) => !istAngebotsdatei(d.name, d.type) || d.size > ANGEBOT_GROESSE_MAX,
    );
    if (falsch) {
      this.meldungen.warnung(`„${falsch.name}“: nur PDF, PNG oder JPEG bis 10 MB.`);
      return;
    }
    if (await this.store.angeboteHochladen(dateien.map((datei) => ({ datei, name: datei.name })))) {
      this.meldungen.erfolg(
        dateien.length === 1 ? 'Angebot hochgeladen.' : 'Angebote hochgeladen.',
      );
    } else {
      this.meldungen.fehler(this.store.aktionFehler());
    }
  }

  async angebotHerunterladen(id: string, name: string): Promise<void> {
    const datei = await this.store.angebotDatei(id);
    if (!datei) {
      this.meldungen.fehler(this.store.aktionFehler());
      return;
    }
    const url = URL.createObjectURL(datei);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async angebotEntfernen(id: string, name: string): Promise<void> {
    if (
      !(await this.dialog.bestaetigen(
        `„${name}“ wird vom Vorgang entfernt.`,
        'Angebot entfernen',
        'Entfernen',
      ))
    )
      return;
    if (!(await this.store.angebotEntfernen(id))) this.meldungen.fehler(this.store.aktionFehler());
  }

  async einreichen(): Promise<void> {
    await this.versand.senden();
  }

  async zurueck(): Promise<void> {
    if (!(await this.store.stufeWechseln(this.stufe() - 1))) {
      this.meldungen.fehler(this.store.aktionFehler());
    }
  }

  groesse(byte: number): string {
    return byte < 1024 * 1024
      ? `${Math.max(1, Math.round(byte / 1024))} KB`
      : `${(byte / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }
}
