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
