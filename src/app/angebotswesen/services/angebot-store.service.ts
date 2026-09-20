import { Injectable, computed, inject, signal } from '@angular/core';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import { Angebot, Schicht } from '../models/angebot.model';
import { ApiAngebotStorage } from '../storage/api-angebot-storage';
import {
  AngebotKonfliktFehler,
  AngebotMitVersion,
  AngebotStorage,
} from '../storage/angebot-storage';

function leeresAngebot(): Angebot {
  return {
    id: crypto.randomUUID(),
    bezeichnung: '',
    auftraggeber: '',
    bemerkung: '',
    schichten: [],
    materialpauschaleAktiv: false,
    materialpauschaleCent: null,
    pauschalpreisAktiv: false,
    pauschalpreisCent: null,
    geaendertAm: new Date().toISOString(),
    geaendertVon: '',
  };
}

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Das Angebot konnte nicht geladen werden.';
}

/**
 * Zustand von Liste, Detailbearbeitung und Speichervorgang. `entwurf` ist der
 * bearbeitbare Stand; `basislinie` der zuletzt bekannte gespeicherte Stand –
 * ihr Vergleich entscheidet über `hatUngesicherteAenderungen()`. Mirrors
 * `fahrzeuge/services/fahrzeug-store.service.ts`.
 */
@Injectable({ providedIn: 'root' })
export class AngebotStoreService {
  private readonly storage: AngebotStorage = inject(ApiAngebotStorage);

  readonly angebote = signal<Angebot[]>([]);
  readonly listeLaedt = signal(false);
  readonly listeFehler = signal('');

  /** Zuletzt vom Server geladener Stand samt Version; `null` bei neuem, ungespeichertem Angebot. */
  readonly geladen = signal<AngebotMitVersion | null>(null);
  readonly entwurf = signal<Angebot | null>(null);
  private readonly basislinie = signal<Angebot | null>(null);
  readonly istNeu = computed(() => this.geladen() === null);

  readonly ladeLaeuft = signal(false);
  readonly ladeFehler = signal('');
  readonly speichertGerade = signal(false);
  readonly speicherFehler = signal('');
  readonly speicherKonflikt = signal(false);

  /** Id des Angebots, das gerade gelöscht wird, oder `null`. Für das Sperren der Zeile in der Liste. */
  readonly loeschtId = signal<string | null>(null);

  readonly hatUngesicherteAenderungen = computed(() => {
    const entwurf = this.entwurf();
    if (!entwurf) return false;
    return JSON.stringify(entwurf) !== JSON.stringify(this.basislinie());
  });

  constructor() {
    inject(VerlassenSchutz).registrieren(() => this.hatUngesicherteAenderungen());
  }

  async listeLaden(): Promise<void> {
    this.listeLaedt.set(true);
    this.listeFehler.set('');
    try {
      this.angebote.set(await this.storage.ladeAngebote());
    } catch (fehler) {
      this.listeFehler.set(fehlermeldung(fehler));
    } finally {
      this.listeLaedt.set(false);
    }
  }

  async angebotLaden(id: string): Promise<void> {
    this.ladeLaeuft.set(true);
    this.ladeFehler.set('');
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
    try {
      const ergebnis = await this.storage.ladeAngebot(id);
      if (!ergebnis) {
        this.ladeFehler.set('Angebot nicht gefunden.');
        this.geladen.set(null);
        this.entwurf.set(null);
        this.basislinie.set(null);
        return;
      }
      this.uebernehmeStand(ergebnis);
    } catch (fehler) {
      this.ladeFehler.set(fehlermeldung(fehler));
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  /** Ein neues Angebot gilt sofort als ungesichert – es gibt noch keinen gespeicherten Stand. */
  neuesAngebotBeginnen(): void {
    this.geladen.set(null);
    this.entwurf.set(leeresAngebot());
    this.basislinie.set(null);
    this.ladeFehler.set('');
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
  }

  entwurfAktualisieren(patch: Partial<Angebot>): void {
    this.entwurf.update((entwurf) => (entwurf ? { ...entwurf, ...patch } : entwurf));
  }

  schichtenAktualisieren(schichten: Schicht[]): void {
    this.entwurfAktualisieren({ schichten });
  }

  /** `true` bei Erfolg. Bei einem Konflikt bleibt der Entwurf unverändert erhalten. */
  async speichern(): Promise<boolean> {
    const entwurf = this.entwurf();
    if (!entwurf) return false;
    if (!entwurf.bezeichnung.trim()) {
      this.speicherFehler.set('Eine Bezeichnung ist erforderlich.');
      return false;
    }
    this.speichertGerade.set(true);
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
    try {
      await this.storage.speichereAngebot(entwurf, this.geladen()?.version ?? null);
      const neuerStand = await this.storage.ladeAngebot(entwurf.id);
      if (neuerStand) this.uebernehmeStand(neuerStand);
      this.angebote.update((liste) => {
        const ohne = liste.filter((a) => a.id !== entwurf.id);
        return [...ohne, neuerStand?.daten ?? entwurf].sort((a, b) =>
          a.bezeichnung.localeCompare(b.bezeichnung),
        );
      });
      return true;
    } catch (fehler) {
      if (fehler instanceof AngebotKonfliktFehler) {
        this.speicherKonflikt.set(true);
      }
      this.speicherFehler.set(fehlermeldung(fehler));
      return false;
    } finally {
      this.speichertGerade.set(false);
    }
  }

  /** Verwirft lokale Änderungen und lädt den aktuellen gespeicherten Stand neu (nach einem Konflikt). */
  async neuLadenNachKonflikt(id: string): Promise<void> {
    await this.angebotLaden(id);
  }

  /** `true` bei Erfolg. Entfernt das Angebot bei Erfolg auch aus der bereits geladenen Liste. */
  async angebotLoeschen(id: string): Promise<boolean> {
    this.loeschtId.set(id);
    this.listeFehler.set('');
    try {
      await this.storage.loescheAngebot(id);
      this.angebote.update((liste) => liste.filter((angebot) => angebot.id !== id));
      return true;
    } catch (fehler) {
      this.listeFehler.set(fehlermeldung(fehler));
      return false;
    } finally {
      this.loeschtId.set(null);
    }
  }

  private uebernehmeStand(stand: AngebotMitVersion): void {
    this.geladen.set(stand);
    this.entwurf.set({ ...stand.daten });
    this.basislinie.set({ ...stand.daten });
  }
}
