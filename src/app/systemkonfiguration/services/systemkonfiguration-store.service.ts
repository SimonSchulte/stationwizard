import { Injectable, computed, inject, signal } from '@angular/core';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import { Einstellungen, Versandweg, VersandwegStatus } from '../models/systemkonfiguration.model';
import { ApiSystemkonfigurationStorage } from '../storage/api-systemkonfiguration-storage';
import { SystemkonfigurationStorage } from '../storage/systemkonfiguration-storage';

function fehlermeldung(fehler: unknown, ersatz: string): string {
  return fehler instanceof Error ? fehler.message : ersatz;
}

function gleich(a: Einstellungen, b: Einstellungen): boolean {
  return (
    a.kmBerichtEmpfaenger === b.kmBerichtEmpfaenger &&
    a.kmBerichtVersandweg === b.kmBerichtVersandweg &&
    a.kmBerichtBetreff === b.kmBerichtBetreff
  );
}

/**
 * Zustand der Systemkonfiguration. `gespeicherteEinstellungen()` hält den
 * zuletzt bestätigten Serverstand, `entwurf()` die Eingaben der Oberfläche –
 * so bleibt nach einem gescheiterten Speichern sichtbar, was tatsächlich gilt.
 * Der Entwurf liegt hier statt in der Seite, damit ihn `VerlassenSchutz` auch
 * dann noch kennt, wenn die Seite bereits verlassen wird.
 */
@Injectable({ providedIn: 'root' })
export class SystemkonfigurationStoreService {
  private readonly storage: SystemkonfigurationStorage = inject(ApiSystemkonfigurationStorage);

  readonly gespeicherteEinstellungen = signal<Einstellungen | null>(null);
  readonly entwurf = signal<Einstellungen | null>(null);
  readonly versandwege = signal<VersandwegStatus[]>([]);

  readonly laedt = signal(false);
  readonly ladeFehler = signal('');
  readonly speichert = signal(false);
  readonly speicherFehler = signal('');
  readonly gespeichert = signal(false);

  /** Wege, die am Worker eingerichtet sind; leer heißt: Versand nicht möglich. */
  readonly verfuegbareWege = computed(() =>
    this.versandwege().filter((eintrag) => eintrag.verfuegbar),
  );

  readonly ungespeichert = computed(() => {
    const entwurf = this.entwurf();
    const gespeichert = this.gespeicherteEinstellungen();
    return entwurf !== null && gespeichert !== null && !gleich(entwurf, gespeichert);
  });

  constructor() {
    inject(VerlassenSchutz).registrieren(() => this.ungespeichert());
  }

  istVerfuegbar(weg: Versandweg): boolean {
    return this.versandwege().some((eintrag) => eintrag.weg === weg && eintrag.verfuegbar);
  }

  /** Setzt ein einzelnes Feld des Entwurfs; ohne geladenen Stand ein No-op. */
  entwurfAendern(aenderung: Partial<Einstellungen>): void {
    this.entwurf.update((bisher) => (bisher === null ? null : { ...bisher, ...aenderung }));
    this.gespeichert.set(false);
  }

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.ladeFehler.set('');
    try {
      const konfiguration = await this.storage.laden();
      this.gespeicherteEinstellungen.set(konfiguration.einstellungen);
      this.versandwege.set(konfiguration.versandwege);
      // Einen laufenden Entwurf nicht überschreiben: ein erneutes Laden darf
      // ungespeicherte Eingaben nicht stillschweigend verwerfen.
      if (!this.ungespeichert()) {
        this.entwurf.set({ ...konfiguration.einstellungen });
      }
    } catch (fehler) {
      this.ladeFehler.set(
        fehlermeldung(fehler, 'Die Systemkonfiguration konnte nicht geladen werden.'),
      );
    } finally {
      this.laedt.set(false);
    }
  }

  /** Speichert den Entwurf. `true` bei Erfolg; der Serverstand wird nur dann übernommen. */
  async speichern(): Promise<boolean> {
    const entwurf = this.entwurf();
    if (entwurf === null) return false;

    this.speichert.set(true);
    this.speicherFehler.set('');
    this.gespeichert.set(false);
    try {
      const konfiguration = await this.storage.speichern(entwurf);
      this.gespeicherteEinstellungen.set(konfiguration.einstellungen);
      this.entwurf.set({ ...konfiguration.einstellungen });
      this.versandwege.set(konfiguration.versandwege);
      this.gespeichert.set(true);
      return true;
    } catch (fehler) {
      this.speicherFehler.set(
        fehlermeldung(fehler, 'Die Systemkonfiguration konnte nicht gespeichert werden.'),
      );
      return false;
    } finally {
      this.speichert.set(false);
    }
  }

  entwurfVerwerfen(): void {
    const gespeichert = this.gespeicherteEinstellungen();
    if (gespeichert) this.entwurf.set({ ...gespeichert });
  }
}
