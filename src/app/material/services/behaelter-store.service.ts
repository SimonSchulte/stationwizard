import { Injectable, computed, inject, signal } from '@angular/core';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import { Behaelter, BehaelterUebersicht } from '../models/behaelter.model';
import { ApiBehaelterStorage } from '../storage/api-behaelter-storage';
import {
  BehaelterInBenutzungFehler,
  BehaelterKonfliktFehler,
  BehaelterMitVersion,
  BehaelterStorage,
} from '../storage/behaelter-storage';

export function leererBehaelter(fahrzeugId = '', vorlageId = ''): Behaelter {
  return {
    id: crypto.randomUUID(),
    fahrzeugId,
    vorlageId,
    bezeichnung: '',
    bemerkung: '',
    geaendertAm: new Date().toISOString(),
    geaendertVon: '',
  };
}

function fehlermeldung(fehler: unknown, ersatz: string): string {
  return fehler instanceof Error ? fehler.message : ersatz;
}

/** Zustand von Behälterübersicht und Behälterbearbeitung. */
@Injectable({ providedIn: 'root' })
export class BehaelterStoreService {
  private readonly storage: BehaelterStorage = inject(ApiBehaelterStorage);

  readonly uebersicht = signal<BehaelterUebersicht[]>([]);
  readonly listeLaedt = signal(false);
  readonly listeFehler = signal('');

  readonly geladen = signal<BehaelterMitVersion | null>(null);
  readonly entwurf = signal<Behaelter | null>(null);
  private readonly basislinie = signal<Behaelter | null>(null);
  readonly istNeu = computed(() => this.geladen() === null);

  readonly ladeLaeuft = signal(false);
  readonly ladeFehler = signal('');
  readonly speichertGerade = signal(false);
  readonly speicherFehler = signal('');
  readonly speicherKonflikt = signal(false);
  readonly loeschtId = signal<string | null>(null);
  readonly loeschFehler = signal('');

  readonly hatUngesicherteAenderungen = computed(() => {
    const entwurf = this.entwurf();
    if (!entwurf) return false;
    return JSON.stringify(entwurf) !== JSON.stringify(this.basislinie());
  });

  /** Behälter je Fahrzeug, für die gruppierte Darstellung im Dashboard. */
  readonly nachFahrzeug = computed(() => {
    const gruppen = new Map<string, { bezeichnung: string; behaelter: BehaelterUebersicht[] }>();
    for (const eintrag of this.uebersicht()) {
      const gruppe = gruppen.get(eintrag.fahrzeugId);
      if (gruppe) gruppe.behaelter.push(eintrag);
      else
        gruppen.set(eintrag.fahrzeugId, {
          bezeichnung: eintrag.fahrzeugBezeichnung,
          behaelter: [eintrag],
        });
    }
    return [...gruppen.entries()].map(([fahrzeugId, gruppe]) => ({ fahrzeugId, ...gruppe }));
  });

  constructor() {
    inject(VerlassenSchutz).registrieren(() => this.hatUngesicherteAenderungen());
  }

  async uebersichtLaden(): Promise<void> {
    this.listeLaedt.set(true);
    this.listeFehler.set('');
    try {
      this.uebersicht.set(await this.storage.ladeUebersicht());
    } catch (fehler) {
      this.listeFehler.set(fehlermeldung(fehler, 'Die Behälter konnten nicht geladen werden.'));
    } finally {
      this.listeLaedt.set(false);
    }
  }

  neuerBehaelter(fahrzeugId = '', vorlageId = ''): void {
    const behaelter = leererBehaelter(fahrzeugId, vorlageId);
    this.geladen.set(null);
    this.entwurf.set(behaelter);
    this.basislinie.set(structuredClone(behaelter));
    this.ladeFehler.set('');
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
  }

  async behaelterLaden(id: string): Promise<void> {
    this.ladeLaeuft.set(true);
    this.ladeFehler.set('');
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
    try {
      const ergebnis = await this.storage.ladeBehaelter(id);
      if (!ergebnis) {
        this.ladeFehler.set('Behälter nicht gefunden.');
        this.geladen.set(null);
        this.entwurf.set(null);
        this.basislinie.set(null);
        return;
      }
      this.geladen.set(ergebnis);
      this.entwurf.set(structuredClone(ergebnis.daten));
      this.basislinie.set(structuredClone(ergebnis.daten));
    } catch (fehler) {
      this.ladeFehler.set(fehlermeldung(fehler, 'Der Behälter konnte nicht geladen werden.'));
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  entwurfAendern(aenderung: (behaelter: Behaelter) => Behaelter): void {
    const aktuell = this.entwurf();
    if (!aktuell) return;
    this.entwurf.set(aenderung(structuredClone(aktuell)));
  }

  async speichern(): Promise<boolean> {
    const entwurf = this.entwurf();
    if (!entwurf) return false;
    this.speichertGerade.set(true);
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
    try {
      const version = await this.storage.speichereBehaelter(
        entwurf,
        this.geladen()?.version ?? null,
      );
      this.geladen.set({ daten: entwurf, version });
      this.basislinie.set(structuredClone(entwurf));
      return true;
    } catch (fehler) {
      if (fehler instanceof BehaelterKonfliktFehler) this.speicherKonflikt.set(true);
      this.speicherFehler.set(
        fehlermeldung(fehler, 'Der Behälter konnte nicht gespeichert werden.'),
      );
      return false;
    } finally {
      this.speichertGerade.set(false);
    }
  }

  async behaelterLoeschen(id: string): Promise<boolean> {
    this.loeschtId.set(id);
    this.loeschFehler.set('');
    try {
      await this.storage.loescheBehaelter(id);
      this.uebersicht.update((liste) => liste.filter((eintrag) => eintrag.id !== id));
      return true;
    } catch (fehler) {
      this.loeschFehler.set(
        fehler instanceof BehaelterInBenutzungFehler
          ? fehler.message
          : fehlermeldung(fehler, 'Der Behälter konnte nicht gelöscht werden.'),
      );
      return false;
    } finally {
      this.loeschtId.set(null);
    }
  }
}
