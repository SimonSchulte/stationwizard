import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AufbauEinheit, AufbauInhalt, EinheitTyp } from '../../models/aufbau.model';
import { BaumOrt } from '../../services/aufbau-bearbeiten';
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
  /** Oberste Einheit der Zeile (für das Ablegen). */
  wurzelId: string;
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
  imports: [
    AbschnittFarbpunkt,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
  ],
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
  /** Eine Zeile wurde per Ziehen verschoben: hinter `anker` (die Zeile davor), `null` ganz oben. */
  readonly verschoben = output<{ quelle: BaumOrt; anker: BaumOrt | null }>();

  /** Vollständiger Baum bis zur Kistenebene: Fahrzeug → Kisten und Wagen → Kisten im Wagen. */
  protected readonly zeilen = computed<Zeile[]>(() => {
    const probleme = this.probleme();
    const zeilen: Zeile[] = [];
    const einheit = (e: AufbauEinheit, tiefe: 0 | 1, wurzelId: string): void => {
      zeilen.push({
        schluessel: e.id,
        art: 'einheit',
        einheit: e,
        tiefe,
        wurzelId,
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
            wurzelId,
            name: `${x.anzahl}× ${x.name}`,
            zahl: x.inhalt.length,
            probleme: probleme.filter((p) => p.eintragId === x.id).length,
          });
        }
      }
      for (const x of e.inhalt) if (x.art === 'wagen') einheit(x.einheit, 1, wurzelId);
    };
    for (const e of this.inhalt().einheiten) einheit(e, 0, e.id);
    return zeilen;
  });

  protected readonly fahrzeuge = computed(() =>
    this.inhalt().einheiten.filter((e) => e.typ === 'fahrzeug'),
  );

  private ort(zeile: Zeile): BaumOrt {
    return {
      art: zeile.art,
      id: zeile.art === 'kiste' ? zeile.schluessel : zeile.einheit.id,
      einheitId: zeile.einheit.id,
      wurzelId: zeile.wurzelId,
      tiefe: zeile.tiefe,
    };
  }

  protected abgelegt(ereignis: CdkDragDrop<unknown>): void {
    if (ereignis.previousIndex === ereignis.currentIndex) return;
    const zeilen = this.zeilen();
    const quelle = zeilen[ereignis.previousIndex];
    if (!quelle) return;
    const rest = zeilen.filter((_, index) => index !== ereignis.previousIndex);
    const anker = ereignis.currentIndex > 0 ? rest[ereignis.currentIndex - 1] : undefined;
    this.verschoben.emit({ quelle: this.ort(quelle), anker: anker ? this.ort(anker) : null });
  }
}
