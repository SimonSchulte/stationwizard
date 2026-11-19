import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { lagerSchluessel } from '../../services/lager';
import { aehnlichkeit } from '../../services/name-abgleich';

export interface ZuordnungsOption {
  id: string;
  name: string;
}

const MAX_TREFFER = 50;

/**
 * Wählt zu einem gefundenen Namen einen Eintrag aus dem Bestand (Eingabefeld mit Vorschlägen, auch für lange
 * Listen). Rein darstellend: `wert` ist die gewählte Kennung oder `null` („keine Zuordnung“).
 */
@Component({
  selector: 'app-artikel-zuordnung',
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './artikel-zuordnung.html',
  styleUrl: './artikel-zuordnung.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArtikelZuordnung {
  readonly optionen = input.required<readonly ZuordnungsOption[]>();
  readonly wert = input<string | null>(null);
  readonly beschriftung = input('Artikel aus dem Bestand');
  /** Gefundener Name: ohne eigene Eingabe stehen die ähnlichsten Einträge oben. */
  readonly vorschlagFuer = input('');
  readonly gewaehlt = output<string | null>();

  protected readonly eingabe = signal<string | null>(null);

  protected readonly gewaehlterName = computed(
    () => this.optionen().find((o) => o.id === this.wert())?.name ?? '',
  );
  protected readonly anzeige = computed(() => this.eingabe() ?? this.gewaehlterName());
  protected readonly treffer = computed(() => {
    const eingabe = this.eingabe();
    const suche = lagerSchluessel(eingabe ?? '');
    const alle = this.optionen();
    let passend: readonly ZuordnungsOption[];
    if (eingabe !== null && suche !== '') {
      passend = alle.filter((o) => lagerSchluessel(o.name).includes(suche));
    } else if (this.vorschlagFuer() !== '') {
      const name = this.vorschlagFuer();
      passend = alle
        .map((o) => ({ o, p: aehnlichkeit(name, o.name) }))
        .sort((x, y) => y.p - x.p)
        .map((x) => x.o);
    } else {
      passend = alle;
    }
    return {
      liste: passend.slice(0, MAX_TREFFER),
      mehr: Math.max(0, passend.length - MAX_TREFFER),
    };
  });

  protected fokus(ereignis: Event): void {
    (ereignis.target as HTMLInputElement).select();
  }

  protected readonly name = (id: string | null): string =>
    this.optionen().find((o) => o.id === id)?.name ?? '';

  protected tippen(ereignis: Event): void {
    this.eingabe.set((ereignis.target as HTMLInputElement).value);
  }

  protected waehlen(id: string): void {
    this.eingabe.set(null);
    this.gewaehlt.emit(id);
  }

  protected verlassen(): void {
    const text = this.eingabe();
    if (text === null) return;
    if (text.trim() === '') this.gewaehlt.emit(null);
    this.eingabe.set(null);
  }

  protected leeren(): void {
    this.eingabe.set(null);
    this.gewaehlt.emit(null);
  }
}
