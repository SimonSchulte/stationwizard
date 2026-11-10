import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import {
  Artikel,
  Kiste,
  KistenPosition,
  Lager,
  STAMMDATEN_GRENZEN,
} from '../../models/stammdaten.model';
import { istGueltigeMenge } from '../../services/stammdaten-pruefung';

/** Eine Zeile im Entwurf: `artikelId` und `menge` können noch fehlen. */
interface Zeile {
  schluessel: string;
  artikelId: string | null;
  menge: number | null;
  bemerkung: string;
}

export interface KisteAenderung {
  name: string;
  lagerId: string | null;
  inhalt: KistenPosition[];
}

function zuZeilen(kiste: Kiste): Zeile[] {
  return kiste.inhalt.map((p) => ({ schluessel: crypto.randomUUID(), ...p }));
}

/**
 * Editor einer Kiste: Name, Heimatlager und Inhalt (Artikel mit Menge und Bemerkung). Hält den
 * Entwurf selbst und speichert ausdrücklich in einem Schritt, weil jede Änderung einzeln zu
 * speichern ein Schreibvorgang je Zeile wäre. Meldet über `ungespeichert`, ob der Entwurf vom
 * gespeicherten Stand abweicht; der Entwurf beginnt neu, sobald sich `kiste` ändert (andere Kiste
 * oder gespeicherter Stand).
 */
@Component({
  selector: 'app-kiste-editor',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
  ],
  templateUrl: './kiste-editor.html',
  styleUrl: './kiste-editor.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KisteEditor {
  readonly kiste = input.required<Kiste>();
  readonly lager = input.required<readonly Lager[]>();
  readonly artikel = input.required<readonly Artikel[]>();
  /** Gerade wird gespeichert: sperrt die Eingaben. */
  readonly beschaeftigt = input(false);

  readonly gespeichert = output<KisteAenderung>();
  readonly geloescht = output<void>();
  /** Druck des gespeicherten Stands; während ungespeicherter Änderungen gesperrt. */
  readonly schildDrucken = output<void>();
  readonly zettelDrucken = output<void>();
  readonly ungespeichert = output<boolean>();

  protected readonly maxName = STAMMDATEN_GRENZEN.name;
  protected readonly maxBemerkung = STAMMDATEN_GRENZEN.bemerkung;
  protected readonly maxPositionen = STAMMDATEN_GRENZEN.kistenPositionen;

  protected readonly name = linkedSignal(() => this.kiste().name);
  protected readonly lagerId = linkedSignal<string | null>(() => this.kiste().lagerId);
  protected readonly zeilen = linkedSignal<Zeile[]>(() => zuZeilen(this.kiste()));

  private readonly artikelNachId = computed(() => new Map(this.artikel().map((a) => [a.id, a])));

  protected readonly zeilenAnsicht = computed(() =>
    this.zeilen().map((z) => ({
      zeile: z,
      einheit: z.artikelId ? (this.artikelNachId().get(z.artikelId)?.einheit ?? '') : '',
    })),
  );

  /** Gründe, aus denen der Entwurf noch nicht gespeichert werden kann. */
  protected readonly probleme = computed(() => {
    const liste: string[] = [];
    if (this.name().trim() === '') liste.push('Die Kiste braucht einen Namen.');
    const zeilen = this.zeilen();
    if (zeilen.some((z) => z.artikelId === null)) liste.push('Jede Zeile braucht einen Artikel.');
    if (zeilen.some((z) => z.menge === null || !istGueltigeMenge(z.menge))) {
      liste.push('Die Menge muss größer 0 sein, höchstens drei Nachkommastellen.');
    }
    const ids = zeilen.map((z) => z.artikelId).filter((id) => id !== null);
    if (new Set(ids).size !== ids.length) liste.push('Ein Artikel steht nur einmal in der Kiste.');
    return liste;
  });

  protected readonly schmutzig = computed(() => {
    const gespeichert = this.kiste();
    if (this.name().trim() !== gespeichert.name || this.lagerId() !== gespeichert.lagerId) {
      return true;
    }
    const entwurf = this.zeilen();
    return (
      entwurf.length !== gespeichert.inhalt.length ||
      entwurf.some((z, i) => {
        const p = gespeichert.inhalt[i];
        return z.artikelId !== p.artikelId || z.menge !== p.menge || z.bemerkung !== p.bemerkung;
      })
    );
  });

  protected readonly kannSpeichern = computed(
    () => this.schmutzig() && this.probleme().length === 0 && !this.beschaeftigt(),
  );

  /** Artikel, die noch nicht in der Kiste stehen, plus der der Zeile selbst. */
  protected auswahlFuer(zeile: Zeile): readonly Artikel[] {
    const belegt = new Set(this.zeilen().map((z) => z.artikelId));
    return this.artikel().filter((a) => a.id === zeile.artikelId || !belegt.has(a.id));
  }

  constructor() {
    effect(() => this.ungespeichert.emit(this.schmutzig()));
  }

  protected nameGeaendert(ereignis: Event): void {
    this.name.set((ereignis.target as HTMLInputElement).value);
  }

  protected zeileHinzufuegen(): void {
    if (this.zeilen().length >= this.maxPositionen) return;
    this.zeilen.update((liste) => [
      ...liste,
      { schluessel: crypto.randomUUID(), artikelId: null, menge: 1, bemerkung: '' },
    ]);
  }

  protected zeileAendern(zeile: Zeile, aenderung: Partial<Omit<Zeile, 'schluessel'>>): void {
    this.zeilen.update((liste) =>
      liste.map((z) => (z.schluessel === zeile.schluessel ? { ...z, ...aenderung } : z)),
    );
  }

  protected mengeGeaendert(zeile: Zeile, ereignis: Event): void {
    const wert = (ereignis.target as HTMLInputElement).valueAsNumber;
    this.zeileAendern(zeile, { menge: Number.isNaN(wert) ? null : wert });
  }

  protected bemerkungGeaendert(zeile: Zeile, ereignis: Event): void {
    this.zeileAendern(zeile, { bemerkung: (ereignis.target as HTMLInputElement).value });
  }

  protected zeileEntfernen(zeile: Zeile): void {
    this.zeilen.update((liste) => liste.filter((z) => z.schluessel !== zeile.schluessel));
  }

  protected verwerfen(): void {
    this.name.set(this.kiste().name);
    this.lagerId.set(this.kiste().lagerId);
    this.zeilen.set(zuZeilen(this.kiste()));
  }

  protected speichern(): void {
    if (!this.kannSpeichern()) return;
    this.gespeichert.emit({
      name: this.name().trim(),
      lagerId: this.lagerId(),
      inhalt: this.zeilen().map((z) => ({
        artikelId: z.artikelId as string,
        menge: z.menge as number,
        bemerkung: z.bemerkung.trim(),
      })),
    });
  }
}
