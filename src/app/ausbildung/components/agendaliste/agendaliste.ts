import { CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { formatiereDatum } from '../../../kern/kalender/datum';
import { KATEGORIE_FARBEN } from '../../data/kategorien';
import { HiorgEintrag } from '../../models/hiorg-kalender.model';
import { KATEGORIEN, Kategorie, KatsThema, Termin } from '../../models/plan.model';
import { AgendaWoche, TypFilter, baueAgenda } from '../../services/agenda';
import { HiorgAbgleich, HiorgAbweichung } from '../../services/hiorg-abgleich';
import { WochenZeile } from '../../services/plan-raster';
import { PlanStore } from '../../services/plan-store';
import { TagesInhalt } from '../../services/tages-inhalt';
import { HiorgEintragKarte } from '../hiorg-eintrag-karte/hiorg-eintrag-karte';
import { AblageAufTag, AblageAufTermin } from '../monatsansicht/monatsansicht';
import { TerminKarte } from '../termin-karte/termin-karte';

/**
 * Ansicht C: chronologische Agendaliste, nach Kalenderwochen gruppiert.
 *
 * Nur Tage mit Einträgen und Lücken am Diensttag erscheinen; die Karten stehen
 * ungekürzt (keine Deckelung wie im Raster). Filter nach Kategorie und Typ
 * gelten nur für die Sitzung. Wie die Monatsansicht rein darstellend: alle
 * Änderungen gehen als Ausgabe an den Jahresplan.
 */
@Component({
  selector: 'app-agendaliste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDropList, HiorgEintragKarte, MatButtonModule, MatIconModule, TerminKarte],
  templateUrl: './agendaliste.html',
  styleUrl: './agendaliste.less',
})
export class Agendaliste {
  private readonly store = inject(PlanStore);

  readonly wochen = input.required<readonly WochenZeile[]>();
  readonly tagesInhalte = input.required<ReadonlyMap<string, TagesInhalt>>();
  readonly abgleich = input.required<HiorgAbgleich>();
  readonly heute = input.required<string>();
  readonly diensttagLabel = input('Montag');
  /** Wie im Raster: nur Diensttage ohne Ausbildungsthema, hier tagesgenau. */
  readonly nurLuecken = input(false);
  /** Wie im Raster: nur Tage mit abweichender HiOrg-Bezeichnung, hier tagesgenau. */
  readonly nurAbweichungen = input(false);

  /** Leer bedeutet: alle Kategorien. Zwei-Wege-gebunden im Jahresplan, nur für die Sitzung. */
  readonly kategorien = model<ReadonlySet<Kategorie>>(new Set());
  readonly typ = model<TypFilter>('alle');

  readonly bearbeiten = output<string>();
  readonly zuBacklog = output<Termin>();
  readonly loeschen = output<string>();
  readonly anlegen = output<string>();
  readonly nameUebernehmen = output<HiorgAbweichung>();
  readonly terminAusHiorg = output<HiorgEintrag>();
  /** Ideen lassen sich wie im Monatsraster auf Termine und freie Tage ziehen. */
  readonly aufTerminAbgelegt = output<AblageAufTermin>();
  readonly aufLeeremTagAbgelegt = output<AblageAufTag>();

  readonly kategorieOptionen = KATEGORIEN;
  readonly typOptionen: readonly { readonly wert: TypFilter; readonly text: string }[] = [
    { wert: 'alle', text: 'Alle Typen' },
    { wert: 'dienst', text: 'Dienste' },
    { wert: 'termin', text: 'Termine' },
  ];

  /** Tage, deren Sammelkarte „HiOrg · N Einträge“ gerade aufgeklappt ist. Nur Sitzung. */
  private readonly aufgeklappt = signal<ReadonlySet<string>>(new Set());

  readonly agenda = computed<AgendaWoche[]>(() =>
    baueAgenda(this.wochen(), this.tagesInhalte(), {
      kategorien: this.kategorien(),
      typ: this.typ(),
      nurLuecken: this.nurLuecken(),
      abweichungstage: this.nurAbweichungen() ? this.abgleich().tageMitAbweichung : null,
    }),
  );

  istAufgeklappt(datum: string): boolean {
    return this.aufgeklappt().has(datum);
  }

  schalteSammelkarte(datum: string): void {
    const neu = new Set(this.aufgeklappt());
    if (!neu.delete(datum)) {
      neu.add(datum);
    }
    this.aufgeklappt.set(neu);
  }

  farbe(kategorie: Kategorie): string {
    return KATEGORIE_FARBEN[kategorie];
  }

  schalteKategorie(kategorie: Kategorie): void {
    const neu = new Set(this.kategorien());
    if (!neu.delete(kategorie)) {
      neu.add(kategorie);
    }
    this.kategorien.set(neu);
  }

  katsThema(termin: Termin): KatsThema | null {
    return termin.katsThemaId
      ? (this.store.katsThemaNachId().get(termin.katsThemaId) ?? null)
      : null;
  }

  hiorgTreffer(terminId: string): HiorgEintrag | null {
    return this.abgleich().terminNachId.get(terminId) ?? null;
  }

  formatKurz(iso: string): string {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  }

  formatiereDatumText(iso: string): string {
    return formatiereDatum(iso);
  }
}
