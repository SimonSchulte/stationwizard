import { Injectable, inject, signal } from '@angular/core';
import { Einsatz, EinsatzListenEintrag } from '../models/einsatz.model';
import { HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';
import { ApiEinsatzStorage } from '../storage/api-einsatz-storage';
import { EinsatzplanungBereitsVorhandenFehler } from '../storage/einsatzplanung-fehler';
import { EinsatzStorage } from '../storage/einsatz-storage';
import { MitVersion } from '../storage/mit-version';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Der Einsatz konnte nicht verarbeitet werden.';
}

function alsEinsatz(eintrag: EinsatzListenEintrag): Einsatz {
  return {
    id: eintrag.id,
    titel: eintrag.titel,
    beginn: eintrag.beginn,
    ende: eintrag.ende,
    ort: eintrag.ort,
    hiorgVeranstaltungId: eintrag.hiorgVeranstaltungId,
  };
}

/** Einsätze der Einsatzplanung: Liste, Anlage aus einer HiOrg-Veranstaltung. */
@Injectable({ providedIn: 'root' })
export class EinsatzStoreService {
  private readonly storage: EinsatzStorage = inject(ApiEinsatzStorage);

  readonly einsaetze = signal<EinsatzListenEintrag[]>([]);
  readonly laedt = signal(false);
  /** `true`, sobald die Liste mindestens einmal erfolgreich geladen wurde. */
  readonly geladen = signal(false);
  readonly fehler = signal('');

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      this.einsaetze.set(await this.storage.ladeEinsaetze());
      this.geladen.set(true);
    } catch (ursache) {
      this.fehler.set(fehlermeldung(ursache));
    } finally {
      this.laedt.set(false);
    }
  }

  /** Einsatz zu einer HiOrg-Veranstaltung aus der bereits geladenen Liste, sonst `null`. */
  einsatzZuVeranstaltung(veranstaltungId: string): EinsatzListenEintrag | null {
    return this.einsaetze().find((e) => e.hiorgVeranstaltungId === veranstaltungId) ?? null;
  }

  /** Ein Einsatz samt Version (ungepuffert); `null`, wenn unbekannt oder bei Fehler. */
  async einsatzLaden(id: string): Promise<MitVersion<Einsatz> | null> {
    this.fehler.set('');
    try {
      return await this.storage.ladeEinsatz(id);
    } catch (ursache) {
      this.fehler.set(fehlermeldung(ursache));
      return null;
    }
  }

  /**
   * Liefert den Einsatz zur HiOrg-Veranstaltung und legt ihn bei Bedarf an (Titel, Zeitraum
   * als lokale Berliner Zeit, Ort, Veranstaltungs-Id). Bei einem Fehler `null` und `fehler`.
   */
  async einsatzFuerVeranstaltungSicherstellen(
    veranstaltung: HiorgVeranstaltung,
  ): Promise<Einsatz | null> {
    this.fehler.set('');
    try {
      if (!this.geladen()) await this.laden();
      const vorhanden = this.einsatzZuVeranstaltung(veranstaltung.veranstaltungId);
      if (vorhanden) return alsEinsatz(vorhanden);

      const neu: Einsatz = {
        id: crypto.randomUUID(),
        titel: veranstaltung.titel.trim().slice(0, 200) || 'Einsatz',
        beginn: veranstaltung.beginn,
        ende: veranstaltung.ende,
        ort: null,
        hiorgVeranstaltungId: veranstaltung.veranstaltungId,
      };
      try {
        await this.storage.legeEinsatzAn(neu);
      } catch (ursache) {
        // Ein anderer Aufruf war schneller: den bestehenden Einsatz verwenden.
        if (
          ursache instanceof EinsatzplanungBereitsVorhandenFehler &&
          ursache.veranstaltungVergeben
        ) {
          await this.laden();
          const inzwischen = this.einsatzZuVeranstaltung(veranstaltung.veranstaltungId);
          if (inzwischen) return alsEinsatz(inzwischen);
        }
        throw ursache;
      }
      await this.laden();
      return neu;
    } catch (ursache) {
      this.fehler.set(fehlermeldung(ursache));
      return null;
    }
  }

  /** Legt einen Einsatz ohne HiOrg-Bezug an; `null` bei Fehler. */
  async einsatzAnlegen(
    daten: Omit<Einsatz, 'id' | 'hiorgVeranstaltungId'>,
  ): Promise<Einsatz | null> {
    this.fehler.set('');
    const neu: Einsatz = {
      ...daten,
      id: crypto.randomUUID(),
      hiorgVeranstaltungId: null,
    };
    try {
      await this.storage.legeEinsatzAn(neu);
      await this.laden();
      return neu;
    } catch (ursache) {
      this.fehler.set(fehlermeldung(ursache));
      return null;
    }
  }
}
