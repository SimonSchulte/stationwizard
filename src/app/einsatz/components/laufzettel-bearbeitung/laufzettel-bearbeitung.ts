import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterEveryRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  viewChildren,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  FACHGRUPPE_BEZEICHNUNG,
  FACHGRUPPEN,
  FACHGRUPPE_FARBVARIABLE,
  Fachgruppe,
  istFachgruppe,
} from '../../../kern/fachgruppen/fachgruppe';
import { VB_GRENZEN, VbLaufzettel, VbPosition } from '../../models/vb.model';
import { LaufzettelLayoutWahl } from '../../services/laufzettel-layout-wahl';
import { laufzettelPlatz } from '../../services/laufzettel-platz';
import { PlatzAnzeige } from '../platz-anzeige/platz-anzeige';

export type LaufzettelFelder = Partial<
  Pick<VbLaufzettel, 'ueberschrift' | 'lagerort' | 'transportMit' | 'auftraggeber' | 'fachgruppe'>
>;
export type PositionFelder = Partial<Pick<VbPosition, 'anzahl' | 'material'>>;

export interface AbschnittAuswahl {
  id: string;
  titel: string;
}

/**
 * Ziehdaten einer Position. Ist die gezogene Position markiert, wandern alle markierten mit.
 * Abschnitte und Laufzettel tragen dagegen nur ihre Id als Text.
 */
export interface PositionZiehdaten {
  readonly positionIds: readonly string[];
}

export function istPositionZiehdaten(wert: unknown): wert is PositionZiehdaten {
  return typeof wert === 'object' && wert !== null && 'positionIds' in wert;
}

/** Ein anderer Laufzettel als Ziel von „Mit Laufzettel zusammenführen“. */
export interface LaufzettelAuswahl {
  id: string;
  nummer: number;
  text: string;
}

/**
 * Bearbeitung eines Laufzettels (rechte Spalte des VB-Editors): Kopffelder, Abschnitt,
 * Fachgruppe, Positionentabelle mit Ziehgriff und Mehrfachauswahl, Teilen, Zusammenführen,
 * Duplizieren, Löschen und die Platzanzeige samt Aufteilen-Hinweis. Rein darstellend: jede
 * Änderung geht als Ausgabe an die Seite, der Store fasst das Tippen zusammen.
 */
@Component({
  selector: 'app-laufzettel-bearbeitung',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatTooltipModule,
    PlatzAnzeige,
  ],
  templateUrl: './laufzettel-bearbeitung.html',
  styleUrl: './laufzettel-bearbeitung.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaufzettelBearbeitung {
  readonly laufzettel = input.required<VbLaufzettel>();
  readonly nummer = input.required<number>();
  readonly abschnittId = input.required<string>();
  readonly abschnitte = input.required<readonly AbschnittAuswahl[]>();
  readonly andere = input<readonly LaufzettelAuswahl[]>([]);

  readonly felderGeaendert = output<LaufzettelFelder>();
  readonly abschnittGewaehlt = output<string>();
  readonly positionGeaendert = output<{ id: string; felder: PositionFelder }>();
  readonly positionHinzugefuegt = output<void>();
  readonly hinweisHinzugefuegt = output<void>();
  readonly positionEntfernt = output<string>();
  readonly positionVerschoben = output<{ id: string; neuerIndex: number }>();
  readonly geteilt = output<string[]>();
  readonly zusammengefuehrt = output<string>();
  readonly aufgeteilt = output<void>();
  readonly dupliziert = output<void>();
  readonly geloescht = output<void>();

  protected readonly grenzen = VB_GRENZEN;
  protected readonly fachgruppen: readonly Fachgruppe[] = FACHGRUPPEN;
  protected readonly fachgruppeBezeichnung = FACHGRUPPE_BEZEICHNUNG;
  protected readonly fachgruppeFarbe = FACHGRUPPE_FARBVARIABLE;

  private readonly layout = inject(LaufzettelLayoutWahl);
  protected readonly platz = computed(() =>
    laufzettelPlatz(this.laufzettel(), this.layout.streifenJeSeite()),
  );
  protected readonly zuViele = computed(() =>
    Math.max(0, this.platz().belegt - this.platz().kapazitaet),
  );

  /** Markierte Positionen; beim Wechsel des Laufzettels leer. */
  protected readonly markiert = linkedSignal<string, ReadonlySet<string>>({
    source: () => this.laufzettel().id,
    computation: () => new Set<string>(),
  });
  /** Nur Ids, die es noch gibt (Positionen können inzwischen entfernt worden sein). */
  protected readonly markierteIds = computed(() => {
    const markiert = this.markiert();
    return this.laufzettel()
      .positionen.map((p) => p.id)
      .filter((id) => markiert.has(id));
  });

  private readonly materialFelder = viewChildren<ElementRef<HTMLInputElement>>('materialFeld');
  private fokusAufNeuePosition = false;

  constructor() {
    afterEveryRender(() => {
      if (!this.fokusAufNeuePosition) return;
      this.fokusAufNeuePosition = false;
      this.materialFelder().at(-1)?.nativeElement.focus();
    });
  }

  protected feld(name: keyof Omit<LaufzettelFelder, 'fachgruppe'>, ereignis: Event): void {
    this.felderGeaendert.emit({ [name]: (ereignis.target as HTMLInputElement).value });
  }

  protected positionFeld(id: string, name: keyof PositionFelder, ereignis: Event): void {
    this.positionGeaendert.emit({
      id,
      felder: { [name]: (ereignis.target as HTMLInputElement).value },
    });
  }

  /** „keine“ und das Abwählen des gewählten Chips bedeuten beide: keine Fachgruppe. */
  protected fachgruppeGewaehlt(wert: unknown): void {
    this.felderGeaendert.emit({ fachgruppe: istFachgruppe(wert) ? wert : null });
  }

  protected markierungUmschalten(id: string, markiert: boolean): void {
    this.markiert.update((alt) => {
      const neu = new Set(alt);
      if (markiert) neu.add(id);
      else neu.delete(id);
      return neu;
    });
  }

  protected hinweisHinzufuegen(): void {
    this.fokusAufNeuePosition = true;
    this.hinweisHinzugefuegt.emit();
  }

  protected positionHinzufuegen(): void {
    this.fokusAufNeuePosition = true;
    this.positionHinzugefuegt.emit();
  }

  protected ziehdaten(positionId: string): PositionZiehdaten {
    const markiert = this.markierteIds();
    return { positionIds: markiert.includes(positionId) ? markiert : [positionId] };
  }

  /** Nur Positionen dürfen in die Liste; Laufzettel und Abschnitte aus der Liste nicht. */
  protected readonly nurPositionen = (element: CdkDrag): boolean =>
    istPositionZiehdaten(element.data);

  protected positionAbgelegt(ereignis: CdkDragDrop<unknown>): void {
    if (ereignis.previousContainer !== ereignis.container) return;
    if (ereignis.previousIndex === ereignis.currentIndex) return;
    const position = this.laufzettel().positionen[ereignis.previousIndex];
    if (position)
      this.positionVerschoben.emit({ id: position.id, neuerIndex: ereignis.currentIndex });
  }

  protected teilen(): void {
    const ids = this.markierteIds();
    if (!ids.length) return;
    this.geteilt.emit(ids);
    this.markiert.set(new Set());
  }
}
