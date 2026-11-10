import { Injectable, inject, signal } from '@angular/core';
import { AufbauVorlage, AufbauVorlageKopf } from '../models/aufbau.model';
import { ApiAufbauVorlagenStorage } from '../storage/api-aufbau-storage';
import { EinsatzplanungKonfliktFehler } from '../storage/einsatzplanung-fehler';
import { MitVersion } from '../storage/mit-version';
import { AufbauVorlagenStorage } from '../storage/aufbau-storage';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Die Vorlage konnte nicht verarbeitet werden.';
}

/** Liste der Aufbau-Vorlagen und ihre einzelnen Schreibzugriffe (Bearbeiten übernimmt der Editor). */
@Injectable({ providedIn: 'root' })
export class AufbauVorlagenStoreService {
  private readonly storage: AufbauVorlagenStorage = inject(ApiAufbauVorlagenStorage);

  readonly vorlagen = signal<AufbauVorlageKopf[]>([]);
  readonly laedt = signal(false);
  readonly fehler = signal('');
  /** `true`, wenn der letzte Schreibzugriff an einer veralteten Version scheiterte. */
  readonly konflikt = signal(false);

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      const liste = await this.storage.ladeVorlagen();
      this.vorlagen.set([...liste].sort((a, b) => a.titel.localeCompare(b.titel, 'de')));
    } catch (ursache) {
      this.fehler.set(fehlermeldung(ursache));
    } finally {
      this.laedt.set(false);
    }
  }

  /** Vollständige Vorlage samt Version; `null`, wenn unbekannt oder bei Fehler (siehe `fehler`). */
  async vorlageLaden(id: string): Promise<MitVersion<AufbauVorlage> | null> {
    this.fehler.set('');
    try {
      const stand = await this.storage.ladeVorlage(id);
      if (!stand) this.fehler.set('Die Vorlage wurde nicht gefunden.');
      return stand;
    } catch (ursache) {
      this.fehler.set(fehlermeldung(ursache));
      return null;
    }
  }

  /** Neue Version bei Erfolg, sonst `null`. */
  async anlegen(vorlage: AufbauVorlage): Promise<string | null> {
    return this.schreiben(() => this.storage.legeVorlageAn(vorlage));
  }

  async speichern(vorlage: AufbauVorlage, version: string): Promise<string | null> {
    return this.schreiben(() => this.storage.speichereVorlage(vorlage, version));
  }

  async loeschen(id: string, version: string): Promise<boolean> {
    const ergebnis = await this.schreiben(async () => {
      await this.storage.loescheVorlage(id, version);
      return '';
    });
    return ergebnis !== null;
  }

  private async schreiben(vorgang: () => Promise<string>): Promise<string | null> {
    this.fehler.set('');
    this.konflikt.set(false);
    try {
      const version = await vorgang();
      await this.laden();
      return version;
    } catch (ursache) {
      this.konflikt.set(ursache instanceof EinsatzplanungKonfliktFehler);
      this.fehler.set(fehlermeldung(ursache));
      return null;
    }
  }
}
