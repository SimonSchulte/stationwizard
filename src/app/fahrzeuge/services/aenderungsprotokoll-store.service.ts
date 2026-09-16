import { Injectable, inject, signal } from '@angular/core';
import { Aenderungseintrag } from '../models/fahrzeug.model';
import { ApiFahrzeugStorage } from '../storage/api-fahrzeug-storage';
import { FahrzeugStorage } from '../storage/fahrzeug-storage';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error
    ? fehler.message
    : 'Das Änderungsprotokoll konnte nicht geladen werden.';
}

/**
 * Änderungsprotokoll eines Fahrzeugs: rein lesend, jeder Eintrag entsteht
 * serverseitig als Nebeneffekt einer anderen Schreiboperation (siehe
 * `FahrzeugStorage.ladeAenderungen`).
 */
@Injectable({ providedIn: 'root' })
export class AenderungsprotokollStoreService {
  private readonly storage: FahrzeugStorage = inject(ApiFahrzeugStorage);

  readonly eintraege = signal<Aenderungseintrag[]>([]);
  readonly laedt = signal(false);
  readonly fehler = signal('');

  /** Leert den Stand, damit kein fremdes Protokoll stehen bleibt. */
  zuruecksetzen(): void {
    this.eintraege.set([]);
    this.fehler.set('');
  }

  async laden(fahrzeugId: string): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      this.eintraege.set(await this.storage.ladeAenderungen(fahrzeugId));
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler));
    } finally {
      this.laedt.set(false);
    }
  }
}
