import { Injectable, computed, inject, signal } from '@angular/core';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import { Fahrzeugstamm, Wartungstermin } from '../models/fahrzeug.model';
import { ApiFahrzeugStorage } from '../storage/api-fahrzeug-storage';
import {
  FahrzeugKonfliktFehler,
  FahrzeugMitVersion,
  FahrzeugStorage,
} from '../storage/fahrzeug-storage';

function leeresFahrzeug(): Fahrzeugstamm {
  const jetzt = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    bezeichnung: '',
    funkrufname: '',
    kennzeichen: '',
    fahrgestellnummer: null,
    eigentuemer: 'organisation',
    bemerkung: '',
    wartungstermine: [],
    geaendertAm: jetzt,
    geaendertVon: '',
  };
}

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Das Fahrzeug konnte nicht geladen werden.';
}

/**
 * Zustand von Liste, Detailbearbeitung und Speichervorgang. `entwurf` ist der
 * bearbeitbare Stand; `basislinie` der zuletzt bekannte gespeicherte Stand –
 * ihr Vergleich entscheidet über `hatUngesicherteAenderungen()` und meldet
 * das an `VerlassenSchutz`.
 */
@Injectable({ providedIn: 'root' })
export class FahrzeugStoreService {
  private readonly storage: FahrzeugStorage = inject(ApiFahrzeugStorage);

  readonly fahrzeuge = signal<Fahrzeugstamm[]>([]);
  readonly listeLaedt = signal(false);
  readonly listeFehler = signal('');

  /** Zuletzt vom Server geladener Stand samt Version; `null` bei neuem, ungespeichertem Fahrzeug. */
  readonly geladen = signal<FahrzeugMitVersion | null>(null);
  readonly entwurf = signal<Fahrzeugstamm | null>(null);
  private readonly basislinie = signal<Fahrzeugstamm | null>(null);
  readonly istNeu = computed(() => this.geladen() === null);

  readonly ladeLaeuft = signal(false);
  readonly ladeFehler = signal('');
  readonly speichertGerade = signal(false);
  readonly speicherFehler = signal('');
  readonly speicherKonflikt = signal(false);

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
      this.fahrzeuge.set(await this.storage.ladeFahrzeuge());
    } catch (fehler) {
      this.listeFehler.set(fehlermeldung(fehler));
    } finally {
      this.listeLaedt.set(false);
    }
  }

  async fahrzeugLaden(id: string): Promise<void> {
    this.ladeLaeuft.set(true);
    this.ladeFehler.set('');
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
    try {
      const ergebnis = await this.storage.ladeFahrzeug(id);
      if (!ergebnis) {
        this.ladeFehler.set('Fahrzeug nicht gefunden.');
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

  /** Ein neues Fahrzeug gilt sofort als ungesichert – es gibt noch keinen gespeicherten Stand. */
  neuesFahrzeugBeginnen(): void {
    this.geladen.set(null);
    this.entwurf.set(leeresFahrzeug());
    this.basislinie.set(null);
    this.ladeFehler.set('');
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
  }

  entwurfAktualisieren(patch: Partial<Fahrzeugstamm>): void {
    this.entwurf.update((entwurf) => (entwurf ? { ...entwurf, ...patch } : entwurf));
  }

  wartungstermineAktualisieren(liste: Wartungstermin[]): void {
    this.entwurfAktualisieren({ wartungstermine: liste });
  }

  /** `true` bei Erfolg. Bei einem Konflikt bleibt der Entwurf unverändert erhalten. */
  async speichern(): Promise<boolean> {
    const entwurf = this.entwurf();
    if (!entwurf) return false;
    if (!entwurf.bezeichnung.trim() || !entwurf.kennzeichen.trim()) {
      this.speicherFehler.set('Bezeichnung und Kennzeichen sind erforderlich.');
      return false;
    }
    this.speichertGerade.set(true);
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
    try {
      await this.storage.speichereFahrzeug(entwurf, this.geladen()?.version ?? null);
      const neuerStand = await this.storage.ladeFahrzeug(entwurf.id);
      if (neuerStand) this.uebernehmeStand(neuerStand);
      this.fahrzeuge.update((liste) => {
        const ohne = liste.filter((f) => f.id !== entwurf.id);
        return [...ohne, neuerStand?.daten ?? entwurf].sort((a, b) =>
          a.bezeichnung.localeCompare(b.bezeichnung),
        );
      });
      return true;
    } catch (fehler) {
      if (fehler instanceof FahrzeugKonfliktFehler) {
        this.speicherKonflikt.set(true);
        this.speicherFehler.set(fehler.message);
      } else {
        this.speicherFehler.set(fehlermeldung(fehler));
      }
      return false;
    } finally {
      this.speichertGerade.set(false);
    }
  }

  /** Verwirft lokale Änderungen und lädt den aktuellen gespeicherten Stand neu (nach einem Konflikt). */
  async neuLadenNachKonflikt(id: string): Promise<void> {
    await this.fahrzeugLaden(id);
  }

  private uebernehmeStand(stand: FahrzeugMitVersion): void {
    this.geladen.set(stand);
    this.entwurf.set({ ...stand.daten });
    this.basislinie.set({ ...stand.daten });
  }
}
