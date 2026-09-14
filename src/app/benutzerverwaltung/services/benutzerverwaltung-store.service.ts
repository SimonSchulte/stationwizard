import { Injectable, inject, signal } from '@angular/core';
import { Benutzerkonto, Hauptrolle, Sonderrolle } from '../models/benutzerkonto.model';
import { ApiBenutzerverwaltungStorage } from '../storage/api-benutzerverwaltung-storage';
import { BenutzerverwaltungStorage } from '../storage/benutzerverwaltung-storage';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error
    ? fehler.message
    : 'Die Benutzerliste konnte nicht geladen werden.';
}

/** Zustand der Benutzerliste und der Rollenzuweisung je Person. */
@Injectable({ providedIn: 'root' })
export class BenutzerverwaltungStoreService {
  private readonly storage: BenutzerverwaltungStorage = inject(ApiBenutzerverwaltungStorage);

  readonly benutzer = signal<Benutzerkonto[]>([]);
  readonly listeLaedt = signal(false);
  readonly listeFehler = signal('');

  /** E-Mail-Adresse, deren Rolle gerade gespeichert wird, oder `''`. */
  readonly speichertFuer = signal('');
  readonly speicherFehler = signal('');

  async listeLaden(): Promise<void> {
    this.listeLaedt.set(true);
    this.listeFehler.set('');
    try {
      this.benutzer.set(await this.storage.ladeBenutzer());
    } catch (fehler) {
      this.listeFehler.set(fehlermeldung(fehler));
    } finally {
      this.listeLaedt.set(false);
    }
  }

  /** `true` bei Erfolg. Der geänderte Eintrag wird in `benutzer()` sofort aktualisiert. */
  async rolleSetzen(
    email: string,
    rolle: Hauptrolle | null,
    sonderrollen: Sonderrolle[],
  ): Promise<boolean> {
    this.speichertFuer.set(email);
    this.speicherFehler.set('');
    try {
      const aktualisiert = await this.storage.rolleSetzen(email, rolle, sonderrollen);
      this.benutzer.update((liste) =>
        liste.map((eintrag) => (eintrag.email === email ? aktualisiert : eintrag)),
      );
      return true;
    } catch (fehler) {
      this.speicherFehler.set(fehlermeldung(fehler));
      return false;
    } finally {
      this.speichertFuer.set('');
    }
  }
}
