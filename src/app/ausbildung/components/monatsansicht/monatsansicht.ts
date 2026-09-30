import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MONATSNAMEN,
  WOCHENTAGE_ISO,
  formatiereDatum,
  monatIndex,
} from '../../../kern/kalender/datum';
import { HiorgEintrag } from '../../models/hiorg-kalender.model';
import { KatsThema, Termin } from '../../models/plan.model';
import { HiorgAbgleich, HiorgAbweichung } from '../../services/hiorg-abgleich';
import { PlanSlot, WochenZeile } from '../../services/plan-raster';
import { PlanStore } from '../../services/plan-store';
import { LEERER_TAGESINHALT, TagesInhalt } from '../../services/tages-inhalt';
import { HiorgEintragKarte } from '../hiorg-eintrag-karte/hiorg-eintrag-karte';
import { LeererTag } from '../leerer-tag/leerer-tag';
import { TerminKarte } from '../termin-karte/termin-karte';

/** Ablage einer Karte auf einer anderen Karte. */
export interface AblageAufTermin {
  readonly event: CdkDragDrop<unknown>;
  readonly ziel: Termin;
}

/** Ablage einer Karte auf einem Tag ohne Plantermin. */
export interface AblageAufTag {
  readonly event: CdkDragDrop<unknown>;
  readonly datum: string;
}

/**
 * Ansicht A: Monatsraster mit Tagesagenda.
 *
 * Das Raster baut auf dem Wochenraster auf (eine Zeile je Kalenderwoche mit
 * KW-Spalte, Feiertagen und Randtagen), zeigt aber nur die Wochen des
 * gewählten Monats. Die Agenda daneben zeigt den gewählten Tag ungekürzt.
 *
 * Rein darstellend: Jede Änderung geht als Ausgabe an den Jahresplan, damit
 * Rückgängig, Bestätigungen und Meldungen an einer Stelle bleiben.
 */
@Component({
  selector: 'app-monatsansicht',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDropList,
    HiorgEintragKarte,
    LeererTag,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TerminKarte,
  ],
  templateUrl: './monatsansicht.html',
  styleUrl: './monatsansicht.less',
})
export class Monatsansicht {
  private readonly store = inject(PlanStore);

  readonly wochen = input.required<readonly WochenZeile[]>();
  readonly tagesInhalte = input.required<ReadonlyMap<string, TagesInhalt>>();
  readonly abgleich = input.required<HiorgAbgleich>();
  readonly heute = input.required<string>();
  readonly nurLuecken = input(false);
  readonly diensttagLabel = input('Montag');

  readonly tagGewaehlt = output<string>();
  readonly bearbeiten = output<string>();
  readonly zuBacklog = output<Termin>();
  readonly loeschen = output<string>();
  readonly anlegen = output<string>();
  readonly nameUebernehmen = output<HiorgAbweichung>();
  readonly terminAusHiorg = output<HiorgEintrag>();
  readonly aufTerminAbgelegt = output<AblageAufTermin>();
  readonly aufLeeremTagAbgelegt = output<AblageAufTag>();

  readonly wochentageIso = WOCHENTAGE_ISO;

  private readonly gewaehlterTag = signal<string | null>(null);

  private readonly slots = computed(() => this.wochen().flatMap((w) => w.tage));

  /**
   * Der Tag, dessen Agenda gezeigt wird: die eigene Wahl, solange sie noch im
   * sichtbaren Ausschnitt liegt, sonst heute, sonst der erste Tag im Jahr. Eine
   * Bearbeitung ändert die Wochen, darf die Wahl aber nicht zurücksetzen.
   */
  readonly aktuellerTag = computed<PlanSlot | null>(() => {
    const slots = this.slots();
    const gewaehlt = this.gewaehlterTag();
    return (
      slots.find((s) => s.datum === gewaehlt && s.imJahr) ??
      slots.find((s) => s.datum === this.heute() && s.imJahr) ??
      slots.find((s) => s.imJahr) ??
      null
    );
  });

  readonly agendaInhalt = computed<TagesInhalt>(() => {
    const slot = this.aktuellerTag();
    return (slot && this.tagesInhalte().get(slot.datum)) || LEERER_TAGESINHALT;
  });
  readonly agendaTermine = computed(() =>
    this.agendaInhalt().alle.filter((k) => k.art === 'termin'),
  );
  readonly agendaHiorg = computed(() => this.agendaInhalt().alle.filter((k) => k.art === 'hiorg'));
  readonly agendaTitel = computed(() => {
    const slot = this.aktuellerTag();
    return slot ? formatiereDatum(slot.datum) : '';
  });

  /**
   * Zeilenhöhen des Rasters: Kopfzeile und Monatsmarken so hoch wie ihr Inhalt, die
   * Wochen gleich hoch. Ohne das teilen sich Marken und Wochen die Höhe des vollsten
   * Tages, und die Monatsmarken werden zu leeren Streifen.
   */
  readonly zeilen = computed(() => {
    const zeilen = ['auto'];
    this.wochen().forEach((_, index) => {
      if (this.istMonatswechsel(index)) {
        zeilen.push('auto');
      }
      zeilen.push('minmax(72px, 1fr)');
    });
    return zeilen.join(' ');
  });

  tagesInhalt(datum: string): TagesInhalt {
    return this.tagesInhalte().get(datum) ?? LEERER_TAGESINHALT;
  }

  waehleTag(datum: string): void {
    this.gewaehlterTag.set(datum);
    this.tagGewaehlt.emit(datum);
  }

  katsThema(termin: Termin): KatsThema | null {
    return termin.katsThemaId
      ? (this.store.katsThemaNachId().get(termin.katsThemaId) ?? null)
      : null;
  }

  /** HiOrg-Eintrag, dessen Name exakt zu diesem Termin passt – `null` ohne Treffer. */
  hiorgTreffer(terminId: string): HiorgEintrag | null {
    return this.abgleich().terminNachId.get(terminId) ?? null;
  }

  /** Kurzes Datum ohne Jahr, für die Wochenbeschriftung (z. B. „05.01."). */
  formatKurz(iso: string): string {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  }

  formatiereDatumText(iso: string): string {
    return formatiereDatum(iso);
  }

  /**
   * Monat einer Kalenderwoche nach ISO-Regel: der Monat des Donnerstags, wie die
   * Woche auch ihrem Jahr zugeordnet wird. So trägt eine Woche vom 31.08. bis 06.09.
   * die Marke „September“ statt einer Marke „August“ über einer Septemberwoche.
   */
  monatsName(woche: WochenZeile): string {
    const donnerstag = woche.tage[3];
    const bezug = donnerstag?.imJahr
      ? donnerstag.datum
      : (woche.tage.find((t) => t.imJahr)?.datum ?? woche.start);
    return MONATSNAMEN[monatIndex(bezug)];
  }

  istMonatswechsel(index: number): boolean {
    const wochen = this.wochen();
    return index === 0 || this.monatsName(wochen[index]) !== this.monatsName(wochen[index - 1]);
  }
}
