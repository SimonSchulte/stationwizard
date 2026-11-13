import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { Lager, Platz, STAMMDATEN_GRENZEN } from '../../models/stammdaten.model';

/**
 * Liste der Lager in der Reihenfolge des Laufwegs. Rein darstellend: Anlegen, Umbenennen, Löschen
 * und Verschieben (Ziehen am Griff oder mit den Pfeilen) gehen als Ausgabe an die Seite. Eine
 * Umbenennung, die die Seite ablehnt, lässt den Namen in der Zeile auf dem alten Stand.
 */
@Component({
  selector: 'app-lager-liste',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    Leerzustand,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './lager-liste.html',
  styleUrl: './lager-liste.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LagerListe {
  readonly lager = input.required<readonly Lager[]>();
  /** Zahl der Artikel je Lager-Id. */
  readonly artikelJeLager = input<ReadonlyMap<string, number>>(new Map());
  /** Zahl der Artikel und Kisten je Platz-Id; ein verwendeter Platz lässt sich nicht entfernen. */
  readonly verwendungJePlatz = input<ReadonlyMap<string, number>>(new Map());
  /** Id der Zeile, die gerade gespeichert wird; sperrt deren Eingaben. */
  readonly beschaeftigtId = input<string | null>(null);

  readonly angelegt = output<string>();
  readonly umbenannt = output<{ lager: Lager; name: string }>();
  readonly geloescht = output<Lager>();
  readonly verschoben = output<{ von: number; nach: number }>();
  /** Neue vollständige Platzliste eines Lagers (anlegen, umbenennen, entfernen). */
  readonly plaetzeGeaendert = output<{ lager: Lager; plaetze: Platz[] }>();

  protected readonly maxName = STAMMDATEN_GRENZEN.name;
  protected readonly maxPlatz = STAMMDATEN_GRENZEN.platzName;
  /** Lager, dessen Plätze gerade aufgeklappt sind. */
  protected readonly offenesLager = signal<string | null>(null);

  protected plaetzeUmschalten(lager: Lager): void {
    this.offenesLager.update((id) => (id === lager.id ? null : lager.id));
  }

  protected platzVerwendung(platz: Platz): number {
    return this.verwendungJePlatz().get(platz.id) ?? 0;
  }

  protected platzAnlegen(lager: Lager, feld: HTMLInputElement): void {
    const name = feld.value.trim();
    if (name === '') return;
    this.plaetzeGeaendert.emit({
      lager,
      plaetze: [...lager.plaetze, { id: crypto.randomUUID(), name }],
    });
    feld.value = '';
  }

  protected platzUmbenennen(lager: Lager, platz: Platz, feld: HTMLInputElement): void {
    const name = feld.value;
    // Auf den alten Stand zurück; bei Erfolg setzt die Bindung den neuen Namen.
    feld.value = platz.name;
    if (name.trim() === '' || name.trim() === platz.name) return;
    this.plaetzeGeaendert.emit({
      lager,
      plaetze: lager.plaetze.map((p) => (p.id === platz.id ? { ...p, name } : p)),
    });
  }

  protected platzEntfernen(lager: Lager, platz: Platz): void {
    this.plaetzeGeaendert.emit({ lager, plaetze: lager.plaetze.filter((p) => p.id !== platz.id) });
  }

  protected anzahl(lager: Lager): number {
    return this.artikelJeLager().get(lager.id) ?? 0;
  }

  protected loeschHinweis(lager: Lager): string {
    const n = this.anzahl(lager);
    return n > 0
      ? `Noch Heimatlager von ${n} ${n === 1 ? 'Artikel' : 'Artikeln'}`
      : 'Lager löschen';
  }

  protected anlegen(feld: HTMLInputElement): void {
    const name = feld.value.trim();
    if (name === '') return;
    this.angelegt.emit(name);
    feld.value = '';
  }

  protected umbenennen(lager: Lager, feld: HTMLInputElement): void {
    const name = feld.value;
    // Auf den alten Stand zurück; bei Erfolg setzt die Bindung den neuen Namen.
    feld.value = lager.name;
    if (name.trim() !== '' && name.trim() !== lager.name) this.umbenannt.emit({ lager, name });
  }

  protected abgelegt(ereignis: CdkDragDrop<unknown>): void {
    if (ereignis.previousIndex !== ereignis.currentIndex) {
      this.verschoben.emit({ von: ereignis.previousIndex, nach: ereignis.currentIndex });
    }
  }

  protected schieben(index: number, richtung: -1 | 1): void {
    const ziel = index + richtung;
    if (ziel >= 0 && ziel < this.lager().length) this.verschoben.emit({ von: index, nach: ziel });
  }
}
