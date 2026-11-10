import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AufbauEinheit, AufbauInhalt, EinheitTyp } from '../../models/aufbau.model';
import { AufbauProblem } from '../../services/aufbau-abgleich';
import { AbschnittFarbpunkt } from '../abschnitt-farbpunkt/abschnitt-farbpunkt';

export interface EinheitNeu {
  typ: EinheitTyp;
  /** Fahrzeug, in das ein Wagen gestellt wird; sonst steht der Wagen für sich. */
  inFahrzeugId: string | null;
}

interface Zeile {
  einheit: AufbauEinheit;
  tiefe: 0 | 1;
  eintraege: number;
  probleme: number;
}

/**
 * Packliste als Baum: Fahrzeuge und Wagen als wählbare Einheiten, ein Wagen im Fahrzeug eingerückt.
 * Rein darstellend; Auswahl und Hinzufügen gehen als Ausgabe an die Seite.
 */
@Component({
  selector: 'app-aufbau-baum',
  imports: [AbschnittFarbpunkt, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './aufbau-baum.html',
  styleUrl: './aufbau-baum.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AufbauBaum {
  readonly inhalt = input.required<AufbauInhalt>();
  readonly gewaehltId = input<string | null>(null);
  readonly probleme = input<readonly AufbauProblem[]>([]);

  readonly gewaehlt = output<string>();
  readonly hinzufuegen = output<EinheitNeu>();

  protected readonly zeilen = computed<Zeile[]>(() => {
    const probleme = this.probleme();
    const zeile = (einheit: AufbauEinheit, tiefe: 0 | 1): Zeile => ({
      einheit,
      tiefe,
      eintraege: einheit.inhalt.filter((x) => x.art !== 'wagen').length,
      probleme: probleme.filter((p) => p.einheitId === einheit.id).length,
    });
    return this.inhalt().einheiten.flatMap((e) => [
      zeile(e, 0),
      ...e.inhalt.flatMap((x) => (x.art === 'wagen' ? [zeile(x.einheit, 1)] : [])),
    ]);
  });

  protected readonly fahrzeuge = computed(() =>
    this.inhalt().einheiten.filter((e) => e.typ === 'fahrzeug'),
  );
}
