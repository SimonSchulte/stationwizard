import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CheckEinreichung,
  CheckEinreichungDetail,
  FREIGABE_ERGEBNIS_TEXT,
  FreigabeAntwort,
} from '../models/einreichung.model';
import { ApiEinreichungStorage } from '../storage/api-einreichung-storage';
import { EinreichungStorage } from '../storage/einreichung-storage';

function fehlermeldung(fehler: unknown, ersatz: string): string {
  return fehler instanceof Error ? fehler.message : ersatz;
}

/** Zustand der Freigabeseite: offene Einreichungen, Auswahl, Ergebnisse. */
@Injectable({ providedIn: 'root' })
export class EinreichungStoreService {
  private readonly storage: EinreichungStorage = inject(ApiEinreichungStorage);

  readonly offene = signal<CheckEinreichung[]>([]);
  readonly laedt = signal(false);
  readonly fehler = signal('');

  readonly ausgewaehlt = signal<ReadonlySet<string>>(new Set());
  readonly arbeitet = signal(false);
  readonly meldung = signal('');

  /** Vollständig geladene Einreichungen, je Id; erst beim Aufklappen geholt. */
  readonly details = signal<Record<string, CheckEinreichungDetail>>({});

  readonly anzahlAusgewaehlt = computed(() => this.ausgewaehlt().size);

  readonly alleAusgewaehlt = computed(() => {
    const offene = this.offene();
    return offene.length > 0 && offene.every((eintrag) => this.ausgewaehlt().has(eintrag.id));
  });

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      this.offene.set(await this.storage.ladeOffene());
      // Eine zwischenzeitlich entschiedene Meldung darf nicht ausgewählt bleiben.
      const vorhanden = new Set(this.offene().map((eintrag) => eintrag.id));
      this.ausgewaehlt.update((auswahl) => new Set([...auswahl].filter((id) => vorhanden.has(id))));
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler, 'Die Meldungen konnten nicht geladen werden.'));
    } finally {
      this.laedt.set(false);
    }
  }

  auswahlUmschalten(id: string): void {
    const naechste = new Set(this.ausgewaehlt());
    if (naechste.has(id)) naechste.delete(id);
    else naechste.add(id);
    this.ausgewaehlt.set(naechste);
  }

  alleUmschalten(): void {
    this.ausgewaehlt.set(
      this.alleAusgewaehlt() ? new Set() : new Set(this.offene().map((eintrag) => eintrag.id)),
    );
  }

  async detailLaden(id: string): Promise<void> {
    if (this.details()[id]) return;
    try {
      const detail = await this.storage.ladeEinreichung(id);
      if (detail) this.details.update((bisher) => ({ ...bisher, [id]: detail }));
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler, 'Die Meldung konnte nicht geladen werden.'));
    }
  }

  /** Fasst die Einzelergebnisse zu einem ehrlichen Satz zusammen. */
  private zusammenfassung(ergebnisse: readonly FreigabeAntwort[]): string {
    const gezaehlt = new Map<string, number>();
    for (const ergebnis of ergebnisse) {
      gezaehlt.set(ergebnis.status, (gezaehlt.get(ergebnis.status) ?? 0) + 1);
    }
    return [...gezaehlt.entries()]
      .map(
        ([status, anzahl]) =>
          `${anzahl} ${FREIGABE_ERGEBNIS_TEXT[status as keyof typeof FREIGABE_ERGEBNIS_TEXT] ?? status}`,
      )
      .join(', ');
  }

  async freigeben(): Promise<boolean> {
    const ids = [...this.ausgewaehlt()];
    if (ids.length === 0) return false;
    this.arbeitet.set(true);
    this.fehler.set('');
    this.meldung.set('');
    try {
      const ergebnisse = await this.storage.gibFrei(ids);
      this.meldung.set(this.zusammenfassung(ergebnisse));
      this.ausgewaehlt.set(new Set());
      await this.laden();
      return ergebnisse.some((ergebnis) => ergebnis.status === 'freigegeben');
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler, 'Die Freigabe ist fehlgeschlagen.'));
      return false;
    } finally {
      this.arbeitet.set(false);
    }
  }

  async ablehnen(id: string, grund: string): Promise<boolean> {
    this.arbeitet.set(true);
    this.fehler.set('');
    this.meldung.set('');
    try {
      await this.storage.lehneAb(id, grund);
      this.meldung.set('Meldung abgelehnt.');
      await this.laden();
      return true;
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler, 'Die Ablehnung ist fehlgeschlagen.'));
      return false;
    } finally {
      this.arbeitet.set(false);
    }
  }
}
