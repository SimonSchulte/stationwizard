import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KATEGORIE_FARBEN } from '../../data/kategorien';
import {
  KatsThema,
  NACHWEISE,
  Termin,
  istMehrtaegigerTermin,
  terminArt,
  terminTage,
  typName,
} from '../../models/plan.model';
import { Segment } from '../../services/plan-raster';
import { hiorgServerLink, type HiorgEintrag } from '../../models/hiorg-kalender.model';
import { formatiereDatum, wochentag } from '../../../kern/kalender/datum';

/** Darstellung eines Termins bzw. einer Idee – identisch in Plan und Backlog. */
@Component({
  selector: 'app-termin-karte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './termin-karte.html',
  styleUrl: './termin-karte.less',
  host: {
    '[class.ereignis]': 'art() === "ereignis"',
    '[class.typ-termin]': 'termin().typ === "termin"',
    '[attr.data-segment]': 'segment()',
    '[class.fortsetzung]': 'istFortsetzung()',
    '[class.frei]': 'istFrei()',
    '[class.luecke]': 'luecke()',
    '[class.kompakt]': 'kompakt()',
  },
})
export class TerminKarte {
  readonly termin = input.required<Termin>();
  readonly katsThema = input<KatsThema | null>(null);
  /** Der HiOrg-Eintrag, dessen Name exakt zu diesem Termin passt, falls vorhanden. */
  readonly hiorgEintrag = input<HiorgEintrag | null>(null);
  /** Gitter-Modus für den Wochenraster: schmale Spalte, Datum/Tag entfallen. */
  readonly kompakt = input(false);
  /** Name des Feiertags an diesem Datum, falls vorhanden. */
  readonly feiertag = input<string | null>(null);
  /** Diensttag ohne Ausbildungsthema – wird rot hervorgehoben. */
  readonly luecke = input(false);
  /**
   * Stellung an diesem Tag. Nur `beginn`/`einzeln` zeigen die vollständige
   * Karte; `mitte` und `ende` sind flache Fortsetzungen desselben Termins.
   */
  readonly segment = input<Segment>('einzeln');
  /** Der Tag, an dem diese Karte steht – bei mehrtägigen Terminen nicht der Beginn. */
  readonly tagDatum = input<string | null>(null);

  readonly bearbeiten = output<void>();
  readonly loeschen = output<void>();
  readonly verschieben = output<void>();

  /** Direktlink auf die Detailseite im HiOrg-Server, falls dieser Termin verknüpft ist. */
  readonly hiorgLink = computed(() => {
    const hiorg = this.hiorgEintrag();
    return hiorg ? hiorgServerLink(hiorg) : null;
  });

  readonly art = computed(() => terminArt(this.termin()));
  readonly istFortsetzung = computed(() => this.segment() === 'mitte' || this.segment() === 'ende');
  readonly typSymbol = computed(() => (this.termin().typ === 'dienst' ? 'shield' : 'event'));
  readonly typText = computed(() => typName(this.termin().typ));
  readonly mehrtaegig = computed(() => istMehrtaegigerTermin(this.termin()));

  /** „Tag 2/4" – nur bei mehrtägigen Terminen. */
  readonly tagesFortschritt = computed(() => {
    const termin = this.termin();
    if (!istMehrtaegigerTermin(termin)) {
      return '';
    }
    const tage = terminTage(termin).length;
    // Im schmalen Raster zählt jeder Buchstabe; ausgeschrieben nur in der Liste.
    return this.kompakt() ? `${this.tagIndex() + 1}/${tage}` : `Tag ${this.tagIndex() + 1}/${tage}`;
  });

  /** Zeitraum bzw. Datum als Klartext – Grundlage der Tooltips. */
  readonly zeitraumText = computed(() => {
    const termin = this.termin();
    if (!termin.datum) {
      return '';
    }
    return istMehrtaegigerTermin(termin)
      ? `${formatiereDatum(termin.datum)}–${formatiereDatum(termin.datumBis!)}`
      : formatiereDatum(termin.datum);
  });

  /**
   * „18:00–21:30", „bis 21:30" oder leer. Fortsetzungen mehrtägiger Termine
   * zeigen keine Zeit: sie gehört zum ersten Tag und würde hier nur den
   * schmalen Kopf füllen.
   */
  readonly zeitText = computed(() => {
    if (this.istFortsetzung()) {
      return '';
    }
    const { beginnZeit, endeZeit } = this.termin();
    if (!beginnZeit) {
      return endeZeit ? `bis ${endeZeit}` : '';
    }
    return endeZeit ? `${beginnZeit}–${endeZeit}` : beginnZeit;
  });

  private readonly tagIndex = computed(() => {
    const datum = this.tagDatum();
    const index = datum ? terminTage(this.termin()).indexOf(datum) : 0;
    return index < 0 ? 0 : index;
  });
  readonly istFrei = computed(() => this.art() === 'ausbildung' && !this.termin().thema.trim());
  readonly farbe = computed(() => KATEGORIE_FARBEN[this.termin().kategorie]);
  readonly datumText = computed(() => {
    const datum = this.termin().datum;
    return datum ? formatiereDatum(datum) : '';
  });
  readonly tagText = computed(() => {
    const datum = this.termin().datum;
    return datum ? wochentag(datum) : '';
  });
  readonly nachweisKuerzel = computed(() =>
    NACHWEISE.filter((n) => this.termin().nachweise.includes(n.key)).map((n) => n.kurz),
  );
  readonly katsAnzeige = computed(() => {
    const thema = this.katsThema();
    if (thema) {
      return `${thema.nummer ? thema.nummer + ' · ' : ''}${thema.titel}`;
    }
    return this.termin().katsTitel.replace(/\s+/g, ' ').trim();
  });
}
