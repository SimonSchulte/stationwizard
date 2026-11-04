import { Injectable, Injector, inject, signal } from '@angular/core';
import { EinsatzStoreService } from './einsatz-store.service';

interface Kontext {
  einsatzId: string;
  /** Die lokale Planung, die zu diesem Einsatz geöffnet wurde (UUID der Nextcloud-Datei). */
  planungId: string;
  /** Bereits am Einsatz eingetragene PEP-Datei, `null` solange keine verknüpft ist. */
  pepId: string | null;
}

/**
 * Merkt sich vor dem Öffnen des PEP-Editors, zu welchem Einsatz die Planung gehört, und trägt
 * die PEP-Datei nach einem erfolgreichen Nextcloud-Speichern am Einsatz ein. Die Datei heißt
 * `<Planungs-Id>.pep.json`; die Planungs-Id ist deshalb die `pepId` des Einsatzes.
 *
 * Geschrieben wird nur, wenn der Kontext zur gespeicherten Planung gehört und die Id noch nicht
 * eingetragen ist; jedes weitere Speichern derselben Planung ist ein No-op. Der Kontext
 * liegt nur im Speicher und überlebt keinen Seitenneustart.
 */
@Injectable({ providedIn: 'root' })
export class EinsatzPepKontext {
  private readonly injector = inject(Injector);
  private kontext: Kontext | null = null;
  private laufend: Promise<string> | null = null;

  /** Fehlertext der letzten fehlgeschlagenen Verknüpfung, sonst leer. */
  readonly fehler = signal('');

  merken(einsatzId: string, planungId: string, pepId: string | null): void {
    this.kontext = { einsatzId, planungId, pepId };
    this.fehler.set('');
  }

  verwerfen(): void {
    this.kontext = null;
    this.fehler.set('');
  }

  /**
   * Nach einem erfolgreichen Speichern der Planung in Nextcloud aufrufen. Liefert einen leeren
   * Text, wenn nichts zu tun war oder die Verknüpfung gelungen ist, sonst die Fehlermeldung.
   */
  async nachSpeichern(planungId: string): Promise<string> {
    const kontext = this.kontext;
    if (!kontext || kontext.planungId !== planungId || kontext.pepId === planungId) return '';
    if (this.laufend) return this.laufend;
    const store = this.injector.get(EinsatzStoreService);
    this.laufend = (async () => {
      const ok = await store.pepVerknuepfen(kontext.einsatzId, planungId);
      if (ok) {
        if (this.kontext === kontext) kontext.pepId = planungId;
        this.fehler.set('');
        return '';
      }
      const text = store.fehler() || 'Die Planung konnte nicht mit dem Einsatz verknüpft werden.';
      this.fehler.set(text);
      return text;
    })().finally(() => {
      this.laufend = null;
    });
    return this.laufend;
  }
}
