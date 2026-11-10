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
  schluessel: string;
  art: 'einheit' | 'kiste';
  /** Einheit, die ein Klick auf die Zeile wählt (bei einer Kiste die, in der sie steht). */
  einheit: AufbauEinheit;
  tiefe: 0 | 1 | 2;
  name: string;
  /** Bei einer Einheit Zahl der Einträge ohne Wagen, bei einer Kiste ihre Positionen. */
  zahl: number;
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

  /** Vollständiger Baum bis zur Kistenebene: Fahrzeug → Kisten und Wagen → Kisten im Wagen. */
  protected readonly zeilen = computed<Zeile[]>(() => {
    const probleme = this.probleme();
    const zeilen: Zeile[] = [];
    const einheit = (e: AufbauEinheit, tiefe: 0 | 1): void => {
      zeilen.push({
        schluessel: e.id,
        art: 'einheit',
        einheit: e,
        tiefe,
        name: e.name,
        zahl: e.inhalt.filter((x) => x.art !== 'wagen').length,
        probleme: probleme.filter((p) => p.einheitId === e.id).length,
      });
      const kistenTiefe = (tiefe + 1) as 1 | 2;
      for (const x of e.inhalt) {
        if (x.art === 'kiste') {
          zeilen.push({
            schluessel: x.id,
            art: 'kiste',
            einheit: e,
            tiefe: kistenTiefe,
            name: `${x.anzahl}× ${x.name}`,
            zahl: x.inhalt.length,
            probleme: probleme.filter((p) => p.eintragId === x.id).length,
          });
        }
      }
      for (const x of e.inhalt) if (x.art === 'wagen') einheit(x.einheit, 1);
    };
    for (const e of this.inhalt().einheiten) einheit(e, 0);
    return zeilen;
  });

  protected readonly fahrzeuge = computed(() =>
    this.inhalt().einheiten.filter((e) => e.typ === 'fahrzeug'),
  );
}
