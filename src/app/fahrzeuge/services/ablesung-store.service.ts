import { Injectable, computed, inject, signal } from '@angular/core';
import { AblesungEingabe, Kilometerstand } from '../models/fahrzeug.model';
import { ApiFahrzeugStorage } from '../storage/api-fahrzeug-storage';
import { FahrzeugStorage } from '../storage/fahrzeug-storage';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Die Ablesungen konnten nicht geladen werden.';
}

/** Kilometerablesungen eines Fahrzeugs: Verlauf laden, eine neue Ablesung anhängen. */
@Injectable({ providedIn: 'root' })
export class AblesungStoreService {
  private readonly storage: FahrzeugStorage = inject(ApiFahrzeugStorage);

  readonly ablesungen = signal<Kilometerstand[]>([]);
  readonly laedt = signal(false);
  readonly fehler = signal('');

  readonly erfasstGerade = signal(false);
  readonly erfassungsFehler = signal('');

  /** Chronologisch letzte Ablesung, unabhängig vom Datum der Erfassung. */
  readonly letzteAblesung = computed(() => {
    const liste = this.ablesungen();
    return liste.length > 0 ? liste[liste.length - 1] : null;
  });

  async laden(fahrzeugId: string): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      const ablesungen = await this.storage.ladeAblesungen(fahrzeugId);
      this.ablesungen.set(
        [...ablesungen].sort((a, b) => a.abgelesenAm.localeCompare(b.abgelesenAm)),
      );
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler));
    } finally {
      this.laedt.set(false);
    }
  }

  /** `true` bei Erfolg. Blockiert nicht bei unplausiblen Werten – das ist Sache des Aufrufers. */
  async erfassen(eingabe: AblesungEingabe): Promise<boolean> {
    this.erfasstGerade.set(true);
    this.erfassungsFehler.set('');
    try {
      const ablesung = await this.storage.ergaenzeAblesung(eingabe);
      this.ablesungen.update((liste) =>
        [...liste, ablesung].sort((a, b) => a.abgelesenAm.localeCompare(b.abgelesenAm)),
      );
      return true;
    } catch (fehler) {
      this.erfassungsFehler.set(fehlermeldung(fehler));
      return false;
    } finally {
      this.erfasstGerade.set(false);
    }
  }
}
