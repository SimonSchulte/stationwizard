import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map, firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AmpelChip } from '../../../fahrzeuge/components/ampel-chip/ampel-chip';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { isoZuLokalesDatum, lokalesDatumZuIso } from '../../../kern/kalender/datum';
import { provideDeutschesDatum } from '../../../kern/kalender/deutsches-datum';
import { Benutzerkontext } from '../../../kern/benutzerkontext';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { UnterschriftDialogDienst } from '../../../kern/unterschrift/unterschrift-dialog-dienst';
import { UnterschriftStoreService } from '../../../kern/unterschrift/unterschrift-store.service';
import { Ladeanzeige, Meldung } from '../../../kern/zustand/zustand';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import {
  PersonWahlDialog,
  PersonWahlDaten,
} from '../../components/person-wahl-dialog/person-wahl-dialog';
import { UnterschriftZeile } from '../../components/unterschrift-zeile/unterschrift-zeile';
import { ZaehlerFeld } from '../../components/zaehler-feld/zaehler-feld';
import {
  MELDUNG_ART_LABEL,
  MELDUNG_GRENZEN,
  MeldungArt,
  SACHVERHALT_IM_FELD,
  SchadensmeldungInhalt,
  fehlendePflichtangaben,
} from '../../models/schadensmeldung.model';
import {
  PFLICHT_SLOTS,
  STUFE_EINGEREICHT,
  Slot,
  pflichtUnterschriftenAnzahl,
} from '../../models/vorgang.model';
import { VorgangStoreService } from '../../services/vorgang-store.service';

/**
 * Die Schadens- und Verlustmeldung (Anlage 5): alle Felder des Formulars zum Ausfüllen, darunter
 * die drei Unterschriftsfelder. Die Reihenfolge der Unterschriften ist egal; nach der ersten ist die
 * Meldung gesperrt. Gespeichert wird ausdrücklich mit „Speichern“.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-schadensmeldung',
  imports: [
    AmpelChip,
    Ladeanzeige,
    Meldung,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
    Seitenkopf,
    UnterschriftZeile,
    ZaehlerFeld,
  ],
  providers: [provideDeutschesDatum()],
  templateUrl: './schadensmeldung.html',
  styleUrl: './schadensmeldung.less',
})
export class Schadensmeldung {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly unterschriftStore = inject(UnterschriftStoreService);
  private readonly unterschriftDialog = inject(UnterschriftDialogDienst);
  private readonly benutzer = inject(Benutzerkontext);
  readonly store = inject(VorgangStoreService);

  readonly GRENZEN = MELDUNG_GRENZEN;
  readonly ART_LABEL = MELDUNG_ART_LABEL;
  readonly ARTEN: readonly MeldungArt[] = ['schaden', 'verlust'];
  readonly SACHVERHALT_IM_FELD = SACHVERHALT_IM_FELD;

  readonly id = toSignal(
    this.route.paramMap.pipe(
      map((p) => p.get('id') ?? ''),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') ?? '' },
  );

  readonly eigeneEmail = this.benutzer.email;
  readonly vorgang = computed(() => this.store.aktuell()?.daten.vorgang ?? null);
  readonly meldung = this.store.meldung;
  readonly entwurf = this.store.entwurf;

  readonly eingereicht = computed(() => (this.vorgang()?.stufe ?? -1) >= STUFE_EINGEREICHT);
  readonly gesperrt = computed(() => !!this.meldung()?.gesperrt || this.eingereicht());
  readonly fehlend = computed(() => {
    const e = this.entwurf();
    return e ? fehlendePflichtangaben(e) : [];
  });
  /** Unterschreiben und Anfordern gehen nur mit gespeicherten, vollständigen Angaben. */
  readonly bereit = computed(() => !!this.meldung()?.vollstaendig && !this.store.ungespeichert());
  readonly pflichtUnterschriften = computed(() =>
    pflichtUnterschriftenAnzahl(this.store.unterschriften()),
  );
  readonly beiblatt = computed(
    () => (this.entwurf()?.sachverhalt.length ?? 0) > SACHVERHALT_IM_FELD,
  );
  readonly hatUnterschrift = computed(() =>
    this.store.unterschriften().some((u) => u.status === 'unterschrieben'),
  );
  readonly pflichtGesamt = PFLICHT_SLOTS.length;

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.store.laden(id);
    });
  }

  alsDatum(iso: string): Date | null {
    return isoZuLokalesDatum(iso);
  }

  datumAendern(ereignis: MatDatepickerInputEvent<Date>): void {
    this.store.entwurfAendern({
      datumFeststellung: ereignis.value ? lokalesDatumZuIso(ereignis.value) : '',
    });
  }

  feld(feld: keyof SchadensmeldungInhalt, wert: string): void {
    this.store.entwurfAendern({ [feld]: wert });
  }

  artWaehlen(art: MeldungArt): void {
    this.store.entwurfAendern({ art });
  }

  async speichern(): Promise<void> {
    if (await this.store.meldungSpeichern()) this.meldungen.erfolg('Meldung gespeichert.');
  }

  async nachKonfliktNeuLaden(): Promise<void> {
    await this.store.laden(this.id());
  }

  async unterschreiben(slot: Slot): Promise<void> {
    if (!(await this.unterschriftStore.laden())) {
      const neu = await this.unterschriftDialog.bearbeiten(this.benutzer.anzeigename());
      if (!neu) return;
    }
    if (await this.store.unterschreiben(slot)) this.meldungen.erfolg('Unterschrift gesetzt.');
    else this.meldungen.fehler(this.store.aktionFehler());
  }

  async anfordern(slot: Slot): Promise<void> {
    const referenz = this.dialog.open<PersonWahlDialog, PersonWahlDaten, string | null>(
      PersonWahlDialog,
      {
        data: {
          titel: 'Zur Unterschrift weitergeben',
          nachricht:
            'Die Person bekommt die Aufgabe „Schadensmeldung unterschreiben“ in ihrem Aufgabenbereich.',
          ausser: this.eigeneEmail(),
        },
        width: '440px',
        maxWidth: '95vw',
      },
    );
    const email = await firstValueFrom(referenz.afterClosed());
    if (!email) return;
    if (await this.store.anfordern(slot, email)) this.meldungen.erfolg('Aufgabe erstellt.');
    else this.meldungen.fehler(this.store.aktionFehler());
  }

  async entfernen(slot: Slot): Promise<void> {
    const stand = this.store.unterschriften().find((u) => u.slot === slot);
    if (stand?.status === 'unterschrieben') {
      const ok = await this.dialogDienst.bestaetigen(
        'Die Unterschrift wird entfernt. Danach lässt sich die Meldung wieder bearbeiten.',
        'Unterschrift entfernen',
        'Entfernen',
      );
      if (!ok) return;
    }
    if (!(await this.store.unterschriftEntfernen(slot))) {
      this.meldungen.fehler(this.store.aktionFehler());
    }
  }

  async alleEntfernen(): Promise<void> {
    const ok = await this.dialogDienst.bestaetigen(
      'Alle Unterschriften und Anfragen werden entfernt, damit sich die Meldung bearbeiten lässt. Danach muss neu unterschrieben werden.',
      'Unterschriften entfernen und bearbeiten',
      'Entfernen',
    );
    if (ok && !(await this.store.alleUnterschriftenEntfernen())) {
      this.meldungen.fehler(this.store.aktionFehler());
    }
  }
}
