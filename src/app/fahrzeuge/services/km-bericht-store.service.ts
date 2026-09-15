import { Injectable, inject, signal } from '@angular/core';
import { KmBericht, VersandQuittung } from '../models/km-bericht.model';
import { ApiKmBerichtStorage } from '../storage/api-km-bericht-storage';
import { KmBerichtStorage } from '../storage/km-bericht-storage';

function fehlermeldung(fehler: unknown, ersatz: string): string {
  return fehler instanceof Error ? fehler.message : ersatz;
}

/**
 * Zustand von Vorschau und Versand des Kilometerstandsberichts. Der Versand
 * ist bewusst nicht optimistisch: `quittung()` wird erst gesetzt, wenn der
 * Worker den Versand bestätigt hat, und bei einem Fehler nicht behalten.
 */
@Injectable({ providedIn: 'root' })
export class KmBerichtStoreService {
  private readonly storage: KmBerichtStorage = inject(ApiKmBerichtStorage);

  readonly bericht = signal<KmBericht | null>(null);
  readonly laedt = signal(false);
  readonly ladeFehler = signal('');

  readonly sendet = signal(false);
  readonly sendeFehler = signal('');
  readonly quittung = signal<VersandQuittung | null>(null);

  async berichtLaden(): Promise<void> {
    this.laedt.set(true);
    this.ladeFehler.set('');
    try {
      this.bericht.set(await this.storage.ladeBericht());
    } catch (fehler) {
      this.ladeFehler.set(fehlermeldung(fehler, 'Der Bericht konnte nicht geladen werden.'));
    } finally {
      this.laedt.set(false);
    }
  }

  /** `true` bei bestätigtem Versand. */
  async senden(): Promise<boolean> {
    this.sendet.set(true);
    this.sendeFehler.set('');
    this.quittung.set(null);
    try {
      this.quittung.set(await this.storage.sendeBericht());
      return true;
    } catch (fehler) {
      this.sendeFehler.set(fehlermeldung(fehler, 'Der Bericht konnte nicht gesendet werden.'));
      return false;
    } finally {
      this.sendet.set(false);
    }
  }
}
