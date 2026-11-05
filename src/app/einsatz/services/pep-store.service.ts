import { Injectable, inject, signal } from '@angular/core';
import { Pep, PepInhalt, PepVorlage } from '../models/pep.model';
import { Planung } from '../models/planung.model';
import { ApiPepStorage } from '../storage/api-pep-storage';
import { EinsatzplanungKonfliktFehler } from '../storage/einsatzplanung-fehler';
import { MitVersion } from '../storage/mit-version';
import { PepStorage } from '../storage/pep-storage';
import { pepVorlageAnwenden, planungZuPepInhalt, planungZuPepVorlageInhalt } from './pep-abbildung';
import { istPepInhalt, istPepVorlage } from './pep-pruefung';
import { PepVorlagenStoreService } from './pep-vorlagen-store.service';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Die PEP konnte nicht verarbeitet werden.';
}

const LEERER_INHALT: PepInhalt = {
  beschreibung: '',
  posten: [],
  einsatzkraefte: [],
  einsatzleiterId: null,
};

/**
 * Die PEP eines Einsatzes in der Datenbank: Laden mit Version, Speichern mit `If-Match`,
 * Anlegen mit `If-None-Match: *` (leer, aus einer Vorlage oder aus einer gebauten Planung).
 * Hält nur den **zuletzt gespeicherten** Stand (`geladen`); der bearbeitete Stand liegt im
 * Editor. Ein Konflikt (veraltete Version) wird als Zustand bewahrt, bis der nächste Lade-
 * oder Schreibvorgang gelingt; der lokale Stand des Editors bleibt dabei unberührt.
 */
@Injectable({ providedIn: 'root' })
export class PepStoreService {
  private readonly storage: PepStorage = inject(ApiPepStorage);
  private readonly vorlagen = inject(PepVorlagenStoreService);

  /** Einsatz, zu dem `geladen` gehört. */
  readonly einsatzId = signal<string | null>(null);
  /** Zuletzt gelesener oder gespeicherter Stand samt Version; `null` ohne PEP. */
  readonly geladen = signal<MitVersion<Pep> | null>(null);
  readonly laedt = signal(false);
  readonly speichert = signal(false);
  readonly fehler = signal('');
  /** `true`, wenn der letzte Schreibzugriff an einer veralteten Version scheiterte. */
  readonly konflikt = signal(false);
  /** Der Einsatz hat (noch) keine PEP. */
  readonly nichtGefunden = signal(false);

  /** Lädt die PEP des Einsatzes (ungepuffert); `null`, wenn es keine gibt oder bei Fehler. */
  async laden(einsatzId: string): Promise<MitVersion<Pep> | null> {
    this.laedt.set(true);
    this.fehler.set('');
    this.konflikt.set(false);
    this.nichtGefunden.set(false);
    try {
      const stand = await this.storage.ladePep(einsatzId);
      this.einsatzId.set(einsatzId);
      this.geladen.set(stand);
      this.nichtGefunden.set(stand === null);
      return stand;
    } catch (ursache) {
      this.fehler.set(fehlermeldung(ursache));
      return null;
    } finally {
      this.laedt.set(false);
    }
  }

  /**
   * Speichert einen neuen Inhalt der geladenen PEP mit `If-Match`; `vorlageId` bleibt
   * erhalten. `true` bei Erfolg. Ohne passend geladenen Stand wird nicht geschrieben.
   */
  async speichern(einsatzId: string, inhalt: PepInhalt): Promise<boolean> {
    const stand = this.geladen();
    if (!stand || this.einsatzId() !== einsatzId) {
      this.fehler.set('Die PEP ist nicht geladen und kann nicht gespeichert werden.');
      return false;
    }
    if (!this.inhaltPruefen(inhalt)) return false;
    const pep: Pep = { schema: 1, vorlageId: stand.daten.vorlageId, inhalt };
    return this.schreiben(async () => {
      const version = await this.storage.speicherePep(einsatzId, pep, stand.version);
      this.geladen.set({ daten: structuredClone(pep), version });
    });
  }

  /**
   * Legt die PEP an (`If-None-Match: *`). Mit `vorlageId` werden die Posten der Vorlage mit
   * neuen Ids kopiert. Mit `basis` (etwa aus EFS gebaut) kommen deren Einsatzkräfte dazu;
   * ohne Vorlage stammen die Posten aus `basis`, ohne beides ist die PEP leer.
   * `true` bei Erfolg, sonst `fehler`.
   */
  async ausVorlageAnlegen(
    einsatzId: string,
    vorlageId: string | null,
    basis?: Planung,
  ): Promise<boolean> {
    this.fehler.set('');
    this.konflikt.set(false);
    let vorlage: PepVorlage | null = null;
    if (vorlageId !== null) {
      const stand = await this.vorlagen.vorlageLaden(vorlageId);
      if (!stand) {
        this.fehler.set(this.vorlagen.fehler() || 'Die Vorlage wurde nicht gefunden.');
        return false;
      }
      vorlage = stand.daten;
    }
    const aus = basis ? planungZuPepInhalt(basis) : null;
    let inhalt: PepInhalt;
    if (vorlage) {
      inhalt = pepVorlageAnwenden(vorlage.inhalt);
      if (aus) {
        inhalt.einsatzkraefte = aus.einsatzkraefte;
        inhalt.beschreibung = inhalt.beschreibung || aus.beschreibung;
      }
    } else {
      inhalt = aus ?? structuredClone(LEERER_INHALT);
    }
    if (!this.inhaltPruefen(inhalt)) return false;
    const pep: Pep = { schema: 1, vorlageId: vorlage?.id ?? null, inhalt };
    return this.schreiben(async () => {
      const version = await this.storage.legePepAn(einsatzId, pep);
      this.einsatzId.set(einsatzId);
      this.nichtGefunden.set(false);
      this.geladen.set({ daten: structuredClone(pep), version });
    });
  }

  /** Löscht die PEP des geladenen Stands. `true` bei Erfolg. */
  async loeschen(einsatzId: string): Promise<boolean> {
    const stand = this.geladen();
    if (!stand || this.einsatzId() !== einsatzId) {
      this.fehler.set('Die PEP ist nicht geladen und kann nicht gelöscht werden.');
      return false;
    }
    return this.schreiben(async () => {
      await this.storage.loeschePep(einsatzId, stand.version);
      this.geladen.set(null);
      this.nichtGefunden.set(true);
    });
  }

  /**
   * Speichert Posten und Beschreibung der Planung als neue PEP-Vorlage (Einsatzkräfte,
   * Zuordnungen und Einsatzleitung entfallen). @returns die Id der Vorlage, sonst `null`
   * (Grund in `fehler`).
   */
  async alsVorlageSpeichern(titel: string, planung: Planung): Promise<string | null> {
    this.fehler.set('');
    const vorlage: PepVorlage = {
      id: crypto.randomUUID(),
      titel: titel.trim(),
      inhalt: planungZuPepVorlageInhalt(planung),
    };
    if (!istPepVorlage(vorlage)) {
      this.fehler.set(
        'Die Vorlage ist nicht speicherbar: Titel, Posten und Texte müssen die Grenzen einhalten.',
      );
      return null;
    }
    const version = await this.vorlagen.anlegen(vorlage);
    if (version === null) {
      this.fehler.set(this.vorlagen.fehler() || 'Die Vorlage konnte nicht gespeichert werden.');
      return null;
    }
    return vorlage.id;
  }

  /** Verwirft den gehaltenen Stand (beim Verlassen des Editors). */
  zuruecksetzen(): void {
    this.einsatzId.set(null);
    this.geladen.set(null);
    this.fehler.set('');
    this.konflikt.set(false);
    this.nichtGefunden.set(false);
  }

  private inhaltPruefen(inhalt: PepInhalt): boolean {
    if (istPepInhalt(inhalt)) return true;
    this.fehler.set(
      'Die PEP ist nicht speicherbar: Grenzen (Posten, Positionen, Texte) oder Verweise auf Einsatzkräfte werden verletzt.',
    );
    return false;
  }

  private async schreiben(vorgang: () => Promise<void>): Promise<boolean> {
    this.fehler.set('');
    this.konflikt.set(false);
    this.speichert.set(true);
    try {
      await vorgang();
      return true;
    } catch (ursache) {
      this.konflikt.set(ursache instanceof EinsatzplanungKonfliktFehler);
      this.fehler.set(fehlermeldung(ursache));
      return false;
    } finally {
      this.speichert.set(false);
    }
  }
}
