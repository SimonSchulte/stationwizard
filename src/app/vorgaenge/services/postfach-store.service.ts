import { Injectable, computed, inject, signal } from '@angular/core';
import { PostfachAdressen, PostfachMail } from '../models/postfach.model';
import { ApiPostfachStorage } from '../storage/api-postfach-storage';
import { vorgangFehlertext } from './vorgang-store.service';

/** Offene Mails des Postfachs (ein Aufruf) und die Adressen je Fahrzeug. */
@Injectable({ providedIn: 'root' })
export class PostfachStoreService {
  private readonly storage = inject(ApiPostfachStorage);

  readonly mails = signal<PostfachMail[]>([]);
  readonly aufbewahrungTage = signal(30);
  readonly laedt = signal(false);
  readonly fehler = signal('');
  readonly adressen = signal<PostfachAdressen | null>(null);
  readonly anzahl = computed(() => this.mails().length);

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      const antwort = await this.storage.mails();
      this.mails.set(antwort.mails);
      this.aufbewahrungTage.set(antwort.aufbewahrungTage);
    } catch (ursache) {
      this.fehler.set(vorgangFehlertext(ursache));
    } finally {
      this.laedt.set(false);
    }
  }

  /** Adressen werden nur einmal geladen; die Zugführung ändert Kürzel selten. */
  async adressenLaden(neu = false): Promise<void> {
    if (this.adressen() && !neu) return;
    try {
      this.adressen.set(await this.storage.adressen());
    } catch {
      // Die Adresse ist nur eine Anzeige; ein Fehler blockiert nichts.
    }
  }

  rohmail(id: string): Promise<ArrayBuffer> {
    return this.storage.rohmail(id);
  }

  async verwerfen(id: string): Promise<boolean> {
    try {
      await this.storage.verwerfen(id);
      this.mails.update((liste) => liste.filter((m) => m.id !== id));
      return true;
    } catch (ursache) {
      this.fehler.set(vorgangFehlertext(ursache));
      return false;
    }
  }

  async ordneZu(id: string, vorgangId: string): Promise<boolean> {
    try {
      await this.storage.ordneZu(id, vorgangId);
      this.mails.update((liste) => liste.filter((m) => m.id !== id));
      return true;
    } catch (ursache) {
      this.fehler.set(vorgangFehlertext(ursache));
      return false;
    }
  }
}
