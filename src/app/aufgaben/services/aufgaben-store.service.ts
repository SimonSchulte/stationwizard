import { computed, inject, Injectable, signal } from '@angular/core';
import { AUFGABENQUELLE, type Aufgabe } from '../../kern/aufgaben/aufgabenquelle';

/**
 * Sammelt die Aufgaben aller angemeldeten Fachquellen.
 *
 * Bewusst `Promise.allSettled`: eine ausgefallene Quelle darf die anderen weder
 * verdecken noch eine stille Null erzeugen. Dasselbe Prinzip wie im
 * Fahrzeug-Dashboard – der Fehler wird je Quelle benannt und angezeigt.
 */
@Injectable({ providedIn: 'root' })
export class AufgabenStoreService {
  private readonly quellen = inject(AUFGABENQUELLE, { optional: true }) ?? [];

  readonly aufgaben = signal<readonly Aufgabe[]>([]);
  readonly laedt = signal(false);
  readonly fehlerJeQuelle = signal<Readonly<Record<string, string>>>({});

  readonly anzahl = computed(() => this.aufgaben().length);
  readonly hatFehler = computed(() => Object.keys(this.fehlerJeQuelle()).length > 0);

  /** Anzeigenamen der Quellen, damit die Übersicht sie nicht selbst kennen muss. */
  readonly bezeichnungen = computed<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(this.quellen.map((quelle) => [quelle.kennung, quelle.bezeichnung])),
  );

  async laden(): Promise<void> {
    if (this.quellen.length === 0) {
      this.aufgaben.set([]);
      return;
    }
    this.laedt.set(true);
    try {
      const ergebnisse = await Promise.allSettled(
        this.quellen.map((quelle) => quelle.ladeAufgaben()),
      );
      const gesammelt: Aufgabe[] = [];
      const fehler: Record<string, string> = {};
      ergebnisse.forEach((ergebnis, index) => {
        const quelle = this.quellen[index]!;
        if (ergebnis.status === 'fulfilled') {
          gesammelt.push(...ergebnis.value);
        } else {
          fehler[quelle.bezeichnung] =
            ergebnis.reason instanceof Error
              ? ergebnis.reason.message
              : 'Die Aufgaben konnten nicht geladen werden.';
        }
      });
      gesammelt.sort((a, b) => a.eingegangenAm.localeCompare(b.eingegangenAm));
      this.aufgaben.set(gesammelt);
      this.fehlerJeQuelle.set(fehler);
    } finally {
      this.laedt.set(false);
    }
  }

  /** Entfernt eine erledigte Aufgabe, ohne alles neu zu laden. */
  entferne(id: string): void {
    this.aufgaben.update((liste) => liste.filter((aufgabe) => aufgabe.id !== id));
  }
}
