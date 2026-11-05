import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTableModule } from '@angular/material/table';
import { Fachgruppe } from '../../../kern/fachgruppen/fachgruppe';
import { Leerzustand } from '../../../kern/zustand/zustand';
import { AbschnittFarbe, VbInhalt, VbPosition } from '../../models/vb.model';
import { laufzettelNummern } from '../../services/laufzettel-platz';
import { AbschnittFarbpunkt } from '../abschnitt-farbpunkt/abschnitt-farbpunkt';
import { FachgruppeChip } from '../fachgruppe-chip/fachgruppe-chip';

interface LaufzettelZeile {
  id: string;
  nr: number;
  material: string;
  lagerort: string;
  transportMit: string;
  auftraggeber: string;
}

interface AbschnittAnsicht {
  id: string;
  titel: string;
  farbe: AbschnittFarbe;
  fachgruppe: Fachgruppe | null;
  zeilen: LaufzettelZeile[];
}

/** Kurztext einer Packliste: „2× Propanflaschen, Löffel aus Kunststoff“. */
export function materialKurztext(positionen: readonly VbPosition[]): string {
  return positionen
    .map((p) => (p.anzahl.trim() ? `${p.anzahl.trim()}× ${p.material}` : p.material))
    .join(', ');
}

/**
 * Lesende Ansicht des Inhalts einer VB-Vorlage: Anweisungen und je Abschnitt eine Tabelle der
 * Laufzettel. Rein darstellend; Auswahl, Laden und Aktionen liegen beim Aufrufer.
 */
@Component({
  selector: 'app-vb-vorlage-ansicht',
  imports: [MatExpansionModule, MatTableModule, Leerzustand, AbschnittFarbpunkt, FachgruppeChip],
  templateUrl: './vb-vorlage-ansicht.html',
  styleUrl: './vb-vorlage-ansicht.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VbVorlageAnsicht {
  readonly inhalt = input.required<VbInhalt>();
  readonly spalten = ['nr', 'lagerort', 'transportMit', 'material', 'auftraggeber'];

  readonly abschnitte = computed<AbschnittAnsicht[]>(() => {
    const inhalt = this.inhalt();
    const nummern = laufzettelNummern(inhalt);
    return inhalt.abschnitte.map((abschnitt) => ({
      id: abschnitt.id,
      titel: abschnitt.titel,
      farbe: abschnitt.farbe,
      fachgruppe: abschnitt.fachgruppe,
      zeilen: abschnitt.laufzettel.map((laufzettel) => ({
        id: laufzettel.id,
        nr: nummern.get(laufzettel.id) ?? 0,
        material: materialKurztext(laufzettel.positionen),
        lagerort: laufzettel.lagerort,
        transportMit: laufzettel.transportMit,
        auftraggeber: laufzettel.auftraggeber,
      })),
    }));
  });
}
