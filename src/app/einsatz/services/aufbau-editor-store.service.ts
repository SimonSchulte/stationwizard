import { Injectable, computed, inject, signal } from '@angular/core';
import { Aufbau, AufbauInhalt, AufbauVorlage } from '../models/aufbau.model';
import { ApiAufbauStorage, ApiAufbauVorlagenStorage } from '../storage/api-aufbau-storage';
import { AufbauStorage, AufbauVorlagenStorage } from '../storage/aufbau-storage';
import { EinsatzplanungKonfliktFehler } from '../storage/einsatzplanung-fehler';
import { versionAlsZahl } from '../storage/einsatzplanung-version';
import { MitVersion } from '../storage/mit-version';
import { LEERER_AUFBAU, mitNeuenIds } from './aufbau-bearbeiten';
import { istAufbauInhalt } from './aufbau-pruefung';

export type AufbauModus = 'aufbau' | 'vorlage';
export type AufbauSpeicherZustand = 'ruhig' | 'speichert' | 'konflikt' | 'fehler';

/** Mindestens 30 Schritte laut Vorgabe; großzügig bemessen. */
const UNDO_TIEFE = 50;

interface Stand {
  titel: string;
  vorlageId: string | null;
  vorlageVersion: number | null;
  inhalt: AufbauInhalt;
}

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Der Aufbau konnte nicht verarbeitet werden.';
}

const gleich = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Arbeitsstand des Aufbau-Editors für den Aufbau eines Einsatzes oder eine Aufbau-Vorlage.
 * `entwurf` ist der bearbeitbare, `basislinie` der zuletzt gespeicherte Stand; ihr Vergleich ergibt
 * `geaendert`. Bearbeitungen laufen über die reinen Funktionen aus `aufbau-bearbeiten.ts`, sind
 * unveränderlich und rückgängig machbar. Ein Speichern ist ein Schreibvorgang (Free-Tier).
 */
@Injectable({ providedIn: 'root' })
export class AufbauEditorStoreService {
  private readonly aufbauten: AufbauStorage = inject(ApiAufbauStorage);
  private readonly vorlagenStorage: AufbauVorlagenStorage = inject(ApiAufbauVorlagenStorage);

  readonly modus = signal<AufbauModus | null>(null);
  readonly einsatzId = signal<string | null>(null);
  readonly vorlageId = signal<string | null>(null);

  readonly geladen = signal<MitVersion<Stand> | null>(null);
  readonly entwurf = signal<Stand | null>(null);
  private readonly basislinie = signal<Stand | null>(null);

  readonly inhalt = computed(() => this.entwurf()?.inhalt ?? null);
  readonly titel = computed(() => this.entwurf()?.titel ?? '');
  readonly geaendert = computed(() => {
    const entwurf = this.entwurf();
    return entwurf !== null && !gleich(entwurf, this.basislinie());
  });
  readonly istNeu = computed(() => this.entwurf() !== null && this.geladen() === null);

  readonly ladeLaeuft = signal(false);
  readonly ladeFehler = signal('');
  /** Der Einsatz hat (noch) keinen Aufbau bzw. die Vorlage gibt es nicht. */
  readonly nichtGefunden = signal(false);

  readonly speicherZustand = signal<AufbauSpeicherZustand>('ruhig');
  readonly speicherFehler = signal('');
  readonly konflikt = computed(() => this.speicherZustand() === 'konflikt');
  readonly speichertGerade = computed(() => this.speicherZustand() === 'speichert');
  readonly hinweis = signal('');

  private readonly stapel = signal<Stand[]>([]);
  readonly kannRueckgaengig = computed(() => this.stapel().length > 0);

  /** Lädt den Aufbau eines Einsatzes (ungepuffert). */
  async ladeAufbau(einsatzId: string): Promise<void> {
    this.zuruecksetzen();
    this.modus.set('aufbau');
    this.einsatzId.set(einsatzId);
    this.ladeLaeuft.set(true);
    try {
      const stand = await this.aufbauten.ladeAufbau(einsatzId);
      if (!stand) {
        this.nichtGefunden.set(true);
        return;
      }
      this.uebernehmen({
        daten: this.standVon(stand.daten),
        version: stand.version,
      });
    } catch (ursache) {
      this.ladeFehler.set(fehlermeldung(ursache));
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  /** Lädt eine Vorlage zum Bearbeiten; `id === 'neu'` beginnt mit einer leeren, ungespeicherten. */
  async ladeVorlage(id: string): Promise<void> {
    this.zuruecksetzen();
    this.modus.set('vorlage');
    if (id === 'neu') {
      const neuerStand: Stand = {
        titel: '',
        vorlageId: null,
        vorlageVersion: null,
        inhalt: structuredClone(LEERER_AUFBAU),
      };
      this.vorlageId.set(crypto.randomUUID());
      this.entwurf.set(neuerStand);
      this.basislinie.set(structuredClone(neuerStand));
      return;
    }
    this.vorlageId.set(id);
    this.ladeLaeuft.set(true);
    try {
      const stand = await this.vorlagenStorage.ladeVorlage(id);
      if (!stand) {
        this.nichtGefunden.set(true);
        return;
      }
      this.uebernehmen({
        daten: {
          titel: stand.daten.titel,
          vorlageId: null,
          vorlageVersion: null,
          inhalt: structuredClone(stand.daten.inhalt),
        },
        version: stand.version,
      });
    } catch (ursache) {
      this.ladeFehler.set(fehlermeldung(ursache));
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  /** Ändert den Inhalt; jeder Aufruf ist ein Schritt für „Rückgängig“. */
  aendern(neu: AufbauInhalt): void {
    const alt = this.entwurf();
    if (!alt || gleich(alt.inhalt, neu)) return;
    this.hinweis.set('');
    if (!istAufbauInhalt(neu)) {
      this.hinweis.set('Diese Änderung würde eine Grenze des Aufbaus verletzen (Anzahl, Länge).');
      return;
    }
    this.stapel.update((s) => [...s.slice(-(UNDO_TIEFE - 1)), structuredClone(alt)]);
    this.entwurf.set({ ...alt, inhalt: neu });
  }

  titelSetzen(titel: string): void {
    const alt = this.entwurf();
    if (alt && alt.titel !== titel) this.entwurf.set({ ...alt, titel });
  }

  rueckgaengig(): void {
    const stapel = this.stapel();
    const vorher = stapel.at(-1);
    if (!vorher) return;
    this.stapel.set(stapel.slice(0, -1));
    this.entwurf.set(vorher);
  }

  /**
   * Legt den Aufbau eines Einsatzes an (`If-None-Match: *`), leer oder mit den Einheiten einer
   * Vorlage (neue Ids). `true` bei Erfolg.
   */
  async anlegen(einsatzId: string, vorlage: MitVersion<AufbauVorlage> | null): Promise<boolean> {
    const aufbau: Aufbau = {
      vorlageId: vorlage?.daten.id ?? null,
      vorlageVersion: vorlage ? versionAlsZahl(vorlage.version) : null,
      inhalt: vorlage ? mitNeuenIds(vorlage.daten.inhalt) : structuredClone(LEERER_AUFBAU),
    };
    this.speicherZustand.set('speichert');
    this.speicherFehler.set('');
    try {
      const version = await this.aufbauten.legeAufbauAn(einsatzId, aufbau);
      this.modus.set('aufbau');
      this.einsatzId.set(einsatzId);
      this.nichtGefunden.set(false);
      this.uebernehmen({ daten: this.standVon(aufbau), version });
      this.speicherZustand.set('ruhig');
      return true;
    } catch (ursache) {
      this.fehlerMerken(ursache);
      return false;
    }
  }

  /** Speichert den Entwurf (Aufbau: `If-Match`; neue Vorlage: Anlage). `true` bei Erfolg. */
  async speichern(): Promise<boolean> {
    const entwurf = this.entwurf();
    if (!entwurf || this.speichertGerade()) return false;
    if (!istAufbauInhalt(entwurf.inhalt)) {
      this.speicherFehler.set('Der Aufbau ist nicht speicherbar: Grenzen werden verletzt.');
      this.speicherZustand.set('fehler');
      return false;
    }
    this.speicherZustand.set('speichert');
    this.speicherFehler.set('');
    try {
      let version: string;
      if (this.modus() === 'vorlage') {
        const id = this.vorlageId();
        const titel = entwurf.titel.trim();
        if (!id || titel === '') {
          this.speicherFehler.set('Bitte einen Titel für die Vorlage eintragen.');
          this.speicherZustand.set('fehler');
          return false;
        }
        const vorlage: AufbauVorlage = { id, titel, inhalt: entwurf.inhalt };
        const stand = this.geladen();
        version = stand
          ? await this.vorlagenStorage.speichereVorlage(vorlage, stand.version)
          : await this.vorlagenStorage.legeVorlageAn(vorlage);
      } else {
        const einsatzId = this.einsatzId();
        const stand = this.geladen();
        if (!einsatzId || !stand) {
          this.speicherFehler.set(
            'Der Aufbau ist nicht geladen und kann nicht gespeichert werden.',
          );
          this.speicherZustand.set('fehler');
          return false;
        }
        const aufbau: Aufbau = {
          vorlageId: entwurf.vorlageId,
          vorlageVersion: entwurf.vorlageVersion,
          inhalt: entwurf.inhalt,
        };
        version = await this.aufbauten.speichereAufbau(einsatzId, aufbau, stand.version);
      }
      this.uebernehmen({ daten: structuredClone(entwurf), version }, false);
      this.speicherZustand.set('ruhig');
      return true;
    } catch (ursache) {
      this.fehlerMerken(ursache);
      return false;
    }
  }

  /** Verwirft Entwurf und Rückgängig-Schritte, etwa beim Verlassen des Editors. */
  zuruecksetzen(): void {
    this.modus.set(null);
    this.einsatzId.set(null);
    this.vorlageId.set(null);
    this.geladen.set(null);
    this.entwurf.set(null);
    this.basislinie.set(null);
    this.stapel.set([]);
    this.ladeFehler.set('');
    this.nichtGefunden.set(false);
    this.speicherZustand.set('ruhig');
    this.speicherFehler.set('');
    this.hinweis.set('');
  }

  private standVon(aufbau: Aufbau): Stand {
    return {
      titel: '',
      vorlageId: aufbau.vorlageId,
      vorlageVersion: aufbau.vorlageVersion,
      inhalt: structuredClone(aufbau.inhalt),
    };
  }

  private uebernehmen(stand: MitVersion<Stand>, ersetzeEntwurf = true): void {
    this.geladen.set(stand);
    this.basislinie.set(structuredClone(stand.daten));
    if (ersetzeEntwurf) {
      this.entwurf.set(structuredClone(stand.daten));
      this.stapel.set([]);
    }
  }

  private fehlerMerken(ursache: unknown): void {
    this.speicherFehler.set(fehlermeldung(ursache));
    this.speicherZustand.set(
      ursache instanceof EinsatzplanungKonfliktFehler ? 'konflikt' : 'fehler',
    );
  }
}
