import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import {
  ARTIKEL_EINHEITEN,
  Artikel,
  ArtikelEingabe,
  ArtikelEinheit,
  Lager,
  Platz,
  STAMMDATEN_GRENZEN,
} from '../../models/stammdaten.model';
import { lagerSchluessel } from '../../services/lager';

export type ArtikelFilter = 'alle' | 'ohne-lager';

/**
 * Tabelle des Artikelkatalogs: Suche, Filter „ohne Heimatlager“, seitenweise Anzeige, Zeile zum
 * Anlegen oben und Bearbeiten in der Zeile (Name, Einheit, Heimatlager). Rein darstellend: jede
 * Änderung geht als Ausgabe an die Seite.
 */
@Component({
  selector: 'app-artikel-tabelle',
  imports: [
    Leerzustand,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    Suchfeld,
  ],
  templateUrl: './artikel-tabelle.html',
  styleUrl: './artikel-tabelle.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArtikelTabelle {
  readonly artikel = input.required<readonly Artikel[]>();
  readonly lager = input.required<readonly Lager[]>();
  readonly beschaeftigtId = input<string | null>(null);

  readonly angelegt = output<Omit<ArtikelEingabe, 'id'>>();
  readonly geaendert = output<{
    artikel: Artikel;
    aenderung: Partial<{
      name: string;
      einheit: ArtikelEinheit;
      lagerId: string | null;
      platzId: string | null;
    }>;
  }>();
  readonly geloescht = output<Artikel>();

  protected readonly einheiten = ARTIKEL_EINHEITEN;
  protected readonly maxName = STAMMDATEN_GRENZEN.name;
  protected readonly seitengroesse = 50;

  protected readonly suche = signal('');
  protected readonly filter = signal<ArtikelFilter>('alle');
  protected readonly seite = signal(0);
  protected readonly neueEinheit = signal<ArtikelEinheit>('Stück');
  protected readonly neuesLager = signal<string | null>(null);

  protected readonly ohneLagerAnzahl = computed(
    () => this.artikel().filter((a) => a.lagerId === null).length,
  );

  /** Treffer der Suche und des Filters; ein neuer Suchbegriff beginnt wieder auf Seite 1. */
  protected readonly treffer = computed(() => {
    const begriff = lagerSchluessel(this.suche());
    return this.artikel().filter(
      (a) =>
        (this.filter() === 'alle' || a.lagerId === null) &&
        (begriff === '' || lagerSchluessel(a.name).includes(begriff)),
    );
  });

  protected readonly sichtbar = computed(() => {
    const von = this.seite() * this.seitengroesse;
    return this.treffer().slice(von, von + this.seitengroesse);
  });

  protected suchen(wert: string): void {
    this.suche.set(wert);
    this.seite.set(0);
  }

  protected filtern(wert: ArtikelFilter): void {
    this.filter.set(wert);
    this.seite.set(0);
  }

  protected seiteGewaehlt(ereignis: PageEvent): void {
    this.seite.set(ereignis.pageIndex);
  }

  protected anlegen(feld: HTMLInputElement): void {
    const name = feld.value.trim();
    if (name === '') return;
    this.angelegt.emit({ name, einheit: this.neueEinheit(), lagerId: this.neuesLager() });
    feld.value = '';
  }

  protected umbenennen(artikel: Artikel, feld: HTMLInputElement): void {
    const name = feld.value;
    feld.value = artikel.name;
    if (name.trim() !== '' && name.trim() !== artikel.name) {
      this.geaendert.emit({ artikel, aenderung: { name } });
    }
  }

  /** Plätze des Heimatlagers eines Artikels (leer ohne Lager). */
  protected plaetzeVon(lagerId: string | null): readonly Platz[] {
    return this.lager().find((l) => l.id === lagerId)?.plaetze ?? [];
  }

  protected lagerName(lagerId: string | null): string {
    return this.lager().find((l) => l.id === lagerId)?.name ?? '';
  }
}
