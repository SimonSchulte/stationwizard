import { Injectable, inject, signal } from '@angular/core';
import { PreiskatalogEintrag } from '../models/preiskatalog.model';
import { ApiPreiskatalogStorage } from '../storage/api-preiskatalog-storage';
import {
  PreiskatalogEintragEingabe,
  PreiskatalogKonfliktFehler,
  PreiskatalogStorage,
} from '../storage/preiskatalog-storage';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Der Preiskatalog konnte nicht geladen werden.';
}

/**
 * Zustand der Preiskatalog-Liste. Anders als beim Fahrzeugmodul gibt es hier
 * keinen separaten Entwurf/Basislinie-Zyklus: jede Zeile wird einzeln,
 * unabhängig von den anderen, mit ihrer eigenen Version gespeichert oder
 * gelöscht (siehe `preiskatalog.model.ts`).
 */
@Injectable({ providedIn: 'root' })
export class PreiskatalogStoreService {
  private readonly storage: PreiskatalogStorage = inject(ApiPreiskatalogStorage);

  readonly eintraege = signal<PreiskatalogEintrag[]>([]);
  readonly listeLaedt = signal(false);
  readonly listeFehler = signal('');

  /** Id der Zeile, die gerade gespeichert wird, oder `null`. Für das Sperren der Eingaben dieser Zeile. */
  readonly speichertId = signal<string | null>(null);
  readonly speicherFehler = signal('');
  readonly speicherKonflikt = signal(false);
  readonly loeschtId = signal<string | null>(null);

  private sortiert(liste: PreiskatalogEintrag[]): PreiskatalogEintrag[] {
    return [...liste].sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung));
  }

  async laden(): Promise<void> {
    this.listeLaedt.set(true);
    this.listeFehler.set('');
    try {
      this.eintraege.set(this.sortiert(await this.storage.ladeEintraege()));
    } catch (fehler) {
      this.listeFehler.set(fehlermeldung(fehler));
    } finally {
      this.listeLaedt.set(false);
    }
  }

  /** `true` bei Erfolg. Bei einem Konflikt bleibt die lokale Liste unverändert erhalten. */
  async eintragSpeichern(
    eintrag: PreiskatalogEintragEingabe,
    version: number | null,
  ): Promise<boolean> {
    this.speichertId.set(eintrag.id);
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
    try {
      const gespeichert = await this.storage.speichereEintrag(eintrag, version);
      this.eintraege.update((liste) =>
        this.sortiert([...liste.filter((e) => e.id !== gespeichert.id), gespeichert]),
      );
      return true;
    } catch (fehler) {
      this.speicherFehler.set(fehlermeldung(fehler));
      this.speicherKonflikt.set(fehler instanceof PreiskatalogKonfliktFehler);
      return false;
    } finally {
      this.speichertId.set(null);
    }
  }

  async eintragLoeschen(id: string): Promise<boolean> {
    this.loeschtId.set(id);
    this.speicherFehler.set('');
    try {
      await this.storage.loescheEintrag(id);
      this.eintraege.update((liste) => liste.filter((e) => e.id !== id));
      return true;
    } catch (fehler) {
      this.speicherFehler.set(fehlermeldung(fehler));
      return false;
    } finally {
      this.loeschtId.set(null);
    }
  }
}
