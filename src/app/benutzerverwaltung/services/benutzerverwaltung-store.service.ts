import { Injectable, computed, inject, signal } from '@angular/core';
import { Benutzerkontext } from '../../kern/benutzerkontext';
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
  private readonly benutzerkontext = inject(Benutzerkontext);

  readonly benutzer = signal<Benutzerkonto[]>([]);
  readonly listeLaedt = signal(false);
  readonly listeFehler = signal('');

  /** E-Mail-Adresse, deren Rolle gerade gespeichert wird, oder `''`. */
  readonly speichertFuer = signal('');
  readonly speicherFehler = signal('');

  /** Hauptrolle der angemeldeten Person selbst, sobald `benutzer()` geladen ist; sonst `null`. */
  readonly eigeneRolle = computed<Hauptrolle | null>(() => {
    const email = this.benutzerkontext.email();
    if (!email) return null;
    return this.benutzer().find((eintrag) => eintrag.email === email)?.rolle ?? null;
  });

  /**
   * Reine UI-Sichtbarkeitsprüfung für einzelne Zugführung-Funktionen (z. B. den
   * Fahrzeug-QR-Übersichtsbogen). Der Verwaltungsbereich kennt weiterhin kein
   * durchgesetztes Rollenmodell (siehe CLAUDE.md „Rechte vorerst alle, Rollen
   * später“) – das hier ist kein Zugriffsschutz, nur eine Einblendregel.
   */
  readonly istZugfuehrung = computed(() => this.eigeneRolle() === 'zugfuehrung');

  /**
   * Darf für mindestens eine Fahrzeuggruppe freigeben – also den
   * QR-Übersichtsbogen aufrufen. Anders als `istZugfuehrung` schließt das die
   * Gruppenführungen ein, damit die Kachel nicht für Personen verschwindet, die
   * den Endpunkt tatsächlich aufrufen dürfen. Die Durchsetzung geschieht
   * serverseitig (`worker/src/rollen.ts`); das hier bleibt eine Einblendregel.
   */
  readonly darfFreigeben = computed(() => {
    const rolle = this.eigeneRolle();
    return rolle === 'zugfuehrung' || (rolle?.startsWith('gruppenfuehrung-') ?? false);
  });

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
