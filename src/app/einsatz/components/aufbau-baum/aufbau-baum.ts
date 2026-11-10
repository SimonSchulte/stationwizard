import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AufbauEinheit, AufbauInhalt, EinheitTyp } from '../../models/aufbau.model';
import { BaumOrt } from '../../services/aufbau-bearbeiten';
import { AufbauProblem } from '../../services/aufbau-abgleich';
import { AbschnittFarbpunkt } from '../abschnitt-farbpunkt/abschnitt-farbpunkt';

export interface EinheitNeu {
  typ: EinheitTyp;
  /** Fahrzeug, in das ein Wagen gestellt wird; sonst steht der Wagen für sich. */
  inFahrzeugId: string | null;
}

/** Horizontaler Zug, ab dem das Ablegen die Ebene wechselt (Einrücken). */
const EINRUECKEN_PX = 32;

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
  readonly verschoben = output<{
    quelle: BaumOrt;
    anker: BaumOrt | null;
    /** Weit nach rechts gezogen: eine Ebene tiefer (Wagen ins Fahrzeug), nach links: heraus. */
    ebene?: 'tiefer' | 'hoeher';
  }>();

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
    const zeilen = this.zeilen();
    const quelle = zeilen[ereignis.previousIndex];
    if (!quelle) return;
    // Seitlich ziehen wechselt die Ebene, aber nur für Wagen (Fahrzeug ↔ freier Wagen).
    const x = ereignis.distance.x;
    const ebene = !this.istWagen(quelle)
      ? undefined
      : x > EINRUECKEN_PX
        ? 'tiefer'
        : x < -EINRUECKEN_PX
          ? 'hoeher'
          : undefined;
    // Ohne Platzwechsel zählt nur das Ein- oder Ausrücken.
    if (ereignis.previousIndex === ereignis.currentIndex && !ebene) return;
    const rest = zeilen.filter((_, index) => index !== ereignis.previousIndex);
    const anker = ereignis.currentIndex > 0 ? rest[ereignis.currentIndex - 1] : undefined;
    this.melde(quelle, anker, ebene);
  }

  private istWagen(zeile: Zeile): boolean {
    return zeile.art === 'einheit' && zeile.einheit.typ === 'wagen';
  }

  private melde(quelle: Zeile, anker: Zeile | undefined, ebene?: 'tiefer' | 'hoeher'): void {
    this.verschoben.emit({
      quelle: this.ort(quelle),
      anker: anker ? this.ort(anker) : null,
      ...(ebene ? { ebene } : {}),
    });
  }

  /**
   * Tastatur statt Ziehen: Alt+Pfeil hoch/runter verschiebt die Zeile um einen Platz (ein Fahrzeug oder
   * freier Wagen um eine ganze Gruppe), Alt+Pfeil rechts/links rückt einen Wagen ins Fahrzeug darüber
   * ein oder nimmt ihn heraus.
   */
  protected taste(ereignis: KeyboardEvent, index: number): void {
    if (!ereignis.altKey || ereignis.ctrlKey || ereignis.metaKey) return;
    const zeilen = this.zeilen();
    const quelle = zeilen[index];
    if (!quelle) return;
    const taste = ereignis.key;
    if (taste === 'ArrowRight' || taste === 'ArrowLeft') {
      if (!this.istWagen(quelle)) return;
      ereignis.preventDefault();
      this.melde(quelle, zeilen[index - 1], taste === 'ArrowRight' ? 'tiefer' : 'hoeher');
      return;
    }
    if (taste !== 'ArrowUp' && taste !== 'ArrowDown') return;
    ereignis.preventDefault();
    const oben = taste === 'ArrowUp';
    if (quelle.art === 'einheit' && quelle.tiefe === 0) {
      // Gruppen der obersten Ebene: Zeilen mit gleicher Wurzel stehen hintereinander.
      const start = (id: string) => zeilen.findIndex((z) => z.wurzelId === id);
      const ende = (id: string) => zeilen.map((z) => z.wurzelId).lastIndexOf(id);
      const wurzeln = zeilen.filter((z) => z.tiefe === 0).map((z) => z.wurzelId);
      const nr = wurzeln.indexOf(quelle.wurzelId);
      if (oben) {
        const davor = wurzeln[nr - 1];
        if (davor === undefined) return;
        this.melde(quelle, zeilen[start(davor) - 1]);
      } else {
        const danach = wurzeln[nr + 1];
        if (danach === undefined) return;
        this.melde(quelle, zeilen[ende(danach)]);
      }
      return;
    }
    if (oben ? index === 0 : index >= zeilen.length - 1) return;
    this.melde(quelle, oben ? zeilen[index - 2] : zeilen[index + 1]);
  }
}
