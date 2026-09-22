import { Injectable, computed, inject, signal } from '@angular/core';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import {
  PruefArtikel,
  PruefFach,
  Pruefvorlage,
  PruefvorlageKopf,
} from '../models/pruefvorlage.model';
import { ApiPruefvorlageStorage } from '../storage/api-pruefvorlage-storage';
import {
  PruefvorlageMitVersion,
  PruefvorlageStorage,
  VorlageInBenutzungFehler,
  VorlageKonfliktFehler,
} from '../storage/pruefvorlage-storage';

export function leereVorlage(): Pruefvorlage {
  return {
    id: crypto.randomUUID(),
    bezeichnung: '',
    beschreibung: '',
    grundlage: '',
    faecher: [],
    geaendertAm: new Date().toISOString(),
    geaendertVon: '',
  };
}

export function neuesFach(): PruefFach {
  return { id: crypto.randomUUID(), bezeichnung: '', artikel: [] };
}

export function neuerArtikel(): PruefArtikel {
  return {
    id: crypto.randomUUID(),
    bezeichnung: '',
    sollMenge: 1,
    einheit: '',
    herkunft: 'seg',
    verfallsdatumPflicht: false,
  };
}

function fehlermeldung(fehler: unknown, ersatz: string): string {
  return fehler instanceof Error ? fehler.message : ersatz;
}

/**
 * Zustand von Vorlagenliste und Vorlageneditor. `entwurf` ist der bearbeitbare
 * Stand, `basislinie` der zuletzt bekannte gespeicherte – ihr Vergleich
 * entscheidet über `hatUngesicherteAenderungen()`. Mirrors
 * `angebotswesen/services/angebot-store.service.ts`.
 */
@Injectable({ providedIn: 'root' })
export class PruefvorlageStoreService {
  private readonly storage: PruefvorlageStorage = inject(ApiPruefvorlageStorage);

  readonly koepfe = signal<PruefvorlageKopf[]>([]);
  readonly listeLaedt = signal(false);
  readonly listeFehler = signal('');

  readonly geladen = signal<PruefvorlageMitVersion | null>(null);
  readonly entwurf = signal<Pruefvorlage | null>(null);
  private readonly basislinie = signal<Pruefvorlage | null>(null);
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

  constructor() {
    inject(VerlassenSchutz).registrieren(() => this.hatUngesicherteAenderungen());
  }

  async listeLaden(): Promise<void> {
    this.listeLaedt.set(true);
    this.listeFehler.set('');
    try {
      this.koepfe.set(await this.storage.ladeKoepfe());
    } catch (fehler) {
      this.listeFehler.set(fehlermeldung(fehler, 'Die Prüfvorlagen konnten nicht geladen werden.'));
    } finally {
      this.listeLaedt.set(false);
    }
  }

  /** Bereitet eine neue, noch nicht gespeicherte Vorlage zur Bearbeitung vor. */
  neueVorlage(): void {
    const vorlage = leereVorlage();
    this.geladen.set(null);
    this.entwurf.set(vorlage);
    this.basislinie.set(structuredClone(vorlage));
    this.ladeFehler.set('');
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
  }

  async vorlageLaden(id: string): Promise<void> {
    this.ladeLaeuft.set(true);
    this.ladeFehler.set('');
    this.speicherFehler.set('');
    this.speicherKonflikt.set(false);
    try {
      const ergebnis = await this.storage.ladeVorlage(id);
      if (!ergebnis) {
        this.ladeFehler.set('Prüfvorlage nicht gefunden.');
        this.geladen.set(null);
        this.entwurf.set(null);
        this.basislinie.set(null);
        return;
      }
      this.geladen.set(ergebnis);
      this.entwurf.set(structuredClone(ergebnis.daten));
      this.basislinie.set(structuredClone(ergebnis.daten));
    } catch (fehler) {
      this.ladeFehler.set(fehlermeldung(fehler, 'Die Prüfvorlage konnte nicht geladen werden.'));
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  /** Ändert den Entwurf; `hatUngesicherteAenderungen` zieht automatisch nach. */
  entwurfAendern(aenderung: (vorlage: Pruefvorlage) => Pruefvorlage): void {
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
      const version = await this.storage.speichereVorlage(entwurf, this.geladen()?.version ?? null);
      this.geladen.set({ daten: entwurf, version });
      this.basislinie.set(structuredClone(entwurf));
      return true;
    } catch (fehler) {
      // Nur ein Versionskonflikt lässt sich durch erneutes Laden auflösen;
      // deshalb steuert er allein die Wiederherstellungshilfe der Oberfläche.
      if (fehler instanceof VorlageKonfliktFehler) this.speicherKonflikt.set(true);
      this.speicherFehler.set(
        fehlermeldung(fehler, 'Die Prüfvorlage konnte nicht gespeichert werden.'),
      );
      return false;
    } finally {
      this.speichertGerade.set(false);
    }
  }

  /** Holt nach einem Konflikt den gespeicherten Stand; der Entwurf bleibt erhalten. */
  async neuLadenNachKonflikt(id: string): Promise<Pruefvorlage | null> {
    const ergebnis = await this.storage.ladeVorlage(id);
    if (!ergebnis) return null;
    this.geladen.set(ergebnis);
    return ergebnis.daten;
  }

  async vorlageLoeschen(id: string): Promise<boolean> {
    this.loeschtId.set(id);
    this.loeschFehler.set('');
    try {
      await this.storage.loescheVorlage(id);
      this.koepfe.update((liste) => liste.filter((kopf) => kopf.id !== id));
      return true;
    } catch (fehler) {
      this.loeschFehler.set(
        fehler instanceof VorlageInBenutzungFehler
          ? fehler.message
          : fehlermeldung(fehler, 'Die Prüfvorlage konnte nicht gelöscht werden.'),
      );
      return false;
    } finally {
      this.loeschtId.set(null);
    }
  }
}
