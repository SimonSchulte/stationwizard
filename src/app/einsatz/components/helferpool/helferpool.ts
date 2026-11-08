import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { CdkDragDrop, CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Leerzustand } from '../../../kern/zustand/zustand';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
import type { DragData } from '../../models/drag-drop.model';
import {
  Einsatzkraft,
  MEDIZINISCH_ORDER,
  Medizinisch,
  TAKTISCH_ORDER,
  Taktisch,
} from '../../models/planung.model';
import { MEDIZINISCH_LABEL, TAKTISCH_LABEL } from '../../services/match.service';
import type { PersonalVergleich } from '../../services/efs-personal';
import type { PoolHinweis } from '../../services/vorschlaege';
import { KuerzelAvatar } from '../kuerzel-avatar/kuerzel-avatar';
import { QualifikationsChips } from '../qualifikations-chips/qualifikations-chips';

export type PoolAnsicht = 'verfuegbar' | 'eingeteilt';

/**
 * Helferpool des Einsatzes: Verfügbare (ziehbar, mit Hinweis auf einen passenden offenen
 * Platz) und bereits Eingeteilte (mit ihrem Platz), dazu Suche und Qualifikationsfilter.
 * Suche, Filter und Ansicht sind Zustand dieser Komponente; Zuteilungen gehen als Ereignis an
 * den Editor. Das Ablegen einer zugeteilten Person hierher hebt ihre Zuteilung auf.
 */
@Component({
  selector: 'app-helferpool',
  imports: [
    DragDropModule,
    KuerzelAvatar,
    Leerzustand,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatIconModule,
    MatTooltipModule,
    QualifikationsChips,
    Suchfeld,
  ],
  templateUrl: './helferpool.html',
  styleUrl: './helferpool.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Helferpool {
  readonly verfuegbar = input.required<readonly Einsatzkraft[]>();
  readonly eingeteilt = input.required<readonly Einsatzkraft[]>();
  readonly hinweise = input<ReadonlyMap<string, PoolHinweis>>(new Map());

  /** Der PEP lässt sich einem EFS-Einsatz zuordnen: zeigt den Knopf „Mit EFS abgleichen“. */
  readonly efsMoeglich = input(false);
  readonly efsLaedt = input(false);
  /** Ergebnis des Abgleichs mit EFS; `null`, solange keiner läuft oder er geschlossen wurde. */
  readonly efsVergleich = input<PersonalVergleich | null>(null);

  readonly ansicht = model<PoolAnsicht>('verfuegbar');
  protected readonly suche = signal('');
  protected readonly filter = signal<string | null>(null);

  readonly efsAbgleichen = output<void>();
  readonly efsUebernehmen = output<void>();
  readonly efsSchliessen = output<void>();
  readonly importieren = output<void>();
  readonly hiorgUebernehmen = output<void>();
  readonly kontextmenue = output<{ ereignis: MouseEvent; person: Einsatzkraft }>();
  readonly ziehenGestartet = output<CdkDragStart<DragData>>();
  readonly ziehenBeendet = output<void>();
  readonly abgelegt = output<CdkDragDrop<null, DragData>>();

  protected readonly taktischLabel = TAKTISCH_LABEL;
  protected readonly medizinischLabel = MEDIZINISCH_LABEL;

  private readonly aktuelleListe = computed(() =>
    this.ansicht() === 'verfuegbar' ? this.verfuegbar() : this.eingeteilt(),
  );

  /** Qualifikationen, die in der gezeigten Liste vorkommen – nur diese bieten einen Filter. */
  protected readonly filterWerte = computed(() => {
    const taktisch = new Set<Taktisch>();
    const medizinisch = new Set<Medizinisch>();
    for (const person of this.aktuelleListe()) {
      (person.tags.taktisch ?? []).forEach((tag) => taktisch.add(tag));
      (person.tags.medizinisch ?? []).forEach((tag) => medizinisch.add(tag));
    }
    return [
      ...TAKTISCH_ORDER.filter((tag) => taktisch.has(tag)),
      ...MEDIZINISCH_ORDER.filter((tag) => medizinisch.has(tag)),
    ] as readonly string[];
  });

  protected readonly gezeigt = computed(() => {
    const suchtext = this.suche().trim().toLowerCase();
    const tag = this.filter();
    return this.aktuelleListe().filter(
      (person) =>
        (!suchtext || person.name.toLowerCase().includes(suchtext)) &&
        (!tag ||
          (person.tags.taktisch ?? []).some((t) => t === tag) ||
          (person.tags.medizinisch ?? []).some((t) => t === tag) ||
          (person.tags.zusatz ?? []).includes(tag)),
    );
  });

  /** Namen der neuen Einsatzkräfte, höchstens fünf, dazu die Zahl der übrigen. */
  protected readonly neueNamen = computed(() => {
    const neu = this.efsVergleich()?.neu ?? [];
    return { genannt: neu.slice(0, 5).map((e) => e.name), weitere: Math.max(0, neu.length - 5) };
  });

  protected readonly entfalleneNamen = computed(() => {
    const weg = this.efsVergleich()?.entfallen ?? [];
    return { genannt: weg.slice(0, 5).map((e) => e.name), weitere: Math.max(0, weg.length - 5) };
  });

  protected ansichtWaehlen(wert: PoolAnsicht): void {
    this.ansicht.set(wert);
    this.filter.set(null);
  }

  protected filterWaehlen(wert: string | null | undefined): void {
    this.filter.set(wert ?? null);
  }

  protected ziehDaten(person: Einsatzkraft): DragData {
    return { einsatzkraftId: person.id, fromPostenId: null, fromPositionId: null };
  }

  protected tooltip(tag: string): string {
    return (
      (TAKTISCH_LABEL as Record<string, string>)[tag] ??
      (MEDIZINISCH_LABEL as Record<string, string>)[tag] ??
      tag
    );
  }
}
