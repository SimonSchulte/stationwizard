import { Injectable, computed, inject, signal } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import type { EfsEinsatzGruppe, EfsEinsatzkraft } from '../models/efs.model';
import { EfsApiService, gruppiereEfsEinsaetze } from './efs-api.service';
import { gleicheMitEfsAb, kalendertag, normalisiereTitel, type EfsAbgleich } from './efs-abgleich';

export type EfsZustand = 'ungeprueft' | 'laedt' | 'verbunden' | 'fehler';

/**
 * Hält die EFS-Veranstaltungen für den Abgleich der Einsatzübersicht. Die Liste kommt in
 * **einem** Aufruf; Einsatzkräfte werden erst auf Anforderung je EFS-Einsatz geholt und nur für
 * die Sitzung gepuffert. EFS ist nur Zusatzquelle: ein Ausfall blendet die Hinweise aus, sperrt
 * aber nichts.
 *
 * Eine Entscheidung bei mehrdeutigem Treffer gilt nur für die Sitzung (`entscheidungen`); sie
 * wird nicht gespeichert.
 */
@Injectable({ providedIn: 'root' })
export class EfsQuelle {
  private readonly api = inject(EfsApiService);
  private readonly worker = inject(WorkerClient);

  readonly zustand = signal<EfsZustand>('ungeprueft');
  readonly fehler = signal('');
  readonly gruppen = signal<readonly EfsEinsatzGruppe[]>([]);
  readonly erreichbar = computed(
    () => this.worker.zustand() === 'erreichbar' && this.zustand() === 'verbunden',
  );

  /** Schlüssel (Titel + Kalendertag) → gewählte EFS-Veranstaltung, `null` für „keine davon“. */
  private readonly entscheidungen = signal<ReadonlyMap<string, string | null>>(new Map());
  private readonly personalPuffer = new Map<string, Promise<EfsEinsatzkraft[]>>();
  private laufend: Promise<void> | null = null;

  /** Lädt die Liste einmal je Sitzung; `neu` erzwingt einen neuen Abruf. */
  laden(neu = false): Promise<void> {
    if (this.laufend) return this.laufend;
    if (!neu && this.zustand() === 'verbunden') return Promise.resolve();
    this.zustand.set('laedt');
    this.laufend = (async () => {
      try {
        const einsaetze = await this.api.veranstaltungenLaden();
        this.gruppen.set(gruppiereEfsEinsaetze(einsaetze));
        this.personalPuffer.clear();
        this.fehler.set('');
        this.zustand.set('verbunden');
      } catch (fehler) {
        this.gruppen.set([]);
        this.fehler.set(
          fehler instanceof Error ? fehler.message : 'Die Verbindung zu EFS ist fehlgeschlagen.',
        );
        this.zustand.set('fehler');
      } finally {
        this.laufend = null;
      }
    })();
    return this.laufend;
  }

  private schluessel(titel: string, beginn: string | null): string {
    return `${normalisiereTitel(titel)}|${kalendertag(beginn) ?? ''}`;
  }

  /** Abgleich einer Veranstaltung; eine frühere Entscheidung der Person gilt vor der Regel. */
  abgleich(titel: string, beginn: string | null): EfsAbgleich {
    if (this.zustand() !== 'verbunden') return { art: 'keiner', treffer: null, kandidaten: [] };
    const regel = gleicheMitEfsAb(titel, beginn, this.gruppen());
    const entscheidung = this.entscheidungen().get(this.schluessel(titel, beginn));
    if (entscheidung === undefined) return regel;
    if (entscheidung === null) return { art: 'keiner', treffer: null, kandidaten: [] };
    const gewaehlt = this.gruppen().find((g) => g.veranstaltung_id === entscheidung) ?? null;
    return gewaehlt ? { art: 'treffer', treffer: gewaehlt, kandidaten: regel.kandidaten } : regel;
  }

  /** Merkt die Wahl bei einem mehrdeutigen Treffer; `null` heißt „keine davon“. */
  entscheide(titel: string, beginn: string | null, veranstaltungId: string | null): void {
    this.entscheidungen.update((alt) =>
      new Map(alt).set(this.schluessel(titel, beginn), veranstaltungId),
    );
  }

  /**
   * Einsatzkräfte aller Schichten einer EFS-Veranstaltung, doppelte Personen einmal. Ein Aufruf
   * je Schicht, für die Sitzung gepuffert; `neu` holt sie frisch.
   */
  personalLaden(gruppe: EfsEinsatzGruppe, neu = false): Promise<EfsEinsatzkraft[]> {
    const vorhanden = this.personalPuffer.get(gruppe.veranstaltung_id);
    if (vorhanden && !neu) return vorhanden;
    const abruf = (async () => {
      const jeSchicht = await Promise.all(
        gruppe.schichten.map((schicht) => this.api.einsatzkraefteLaden(schicht.id)),
      );
      const gesehen = new Set<string>();
      const alle: EfsEinsatzkraft[] = [];
      for (const kraft of jeSchicht.flat()) {
        const schluessel =
          kraft.hiorg_org_id || normalisiereTitel(`${kraft.nachname} ${kraft.vorname}`);
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        alle.push(kraft);
      }
      return alle;
    })();
    this.personalPuffer.set(gruppe.veranstaltung_id, abruf);
    // Ein Fehler darf nicht im Puffer bleiben, sonst bliebe jeder Wiederholversuch erfolglos.
    abruf.catch(() => this.personalPuffer.delete(gruppe.veranstaltung_id));
    return abruf;
  }
}
