import { Injectable, inject, signal } from '@angular/core';
import { Einsatz, EinsatzListenEintrag } from '../models/einsatz.model';
import { EfsEinsatzGruppe } from '../models/planung.model';
import { ApiEinsatzStorage } from '../storage/api-einsatz-storage';
import {
  EinsatzplanungBereitsVorhandenFehler,
  EinsatzplanungKonfliktFehler,
} from '../storage/einsatzplanung-fehler';
import { EinsatzStorage } from '../storage/einsatz-storage';
import { MitVersion } from '../storage/mit-version';
import { hiorgZeitAlsLokal } from './einsatz-zeit';

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
    pepId: eintrag.pepId,
  };
}

/** Einsätze der Einsatzplanung: Liste, Anlage aus einer HiOrg-Veranstaltung, PEP-Verknüpfung. */
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
  async einsatzFuerVeranstaltungSicherstellen(gruppe: EfsEinsatzGruppe): Promise<Einsatz | null> {
    this.fehler.set('');
    try {
      if (!this.geladen()) await this.laden();
      const vorhanden = this.einsatzZuVeranstaltung(gruppe.veranstaltung_id);
      if (vorhanden) return alsEinsatz(vorhanden);

      const neu: Einsatz = {
        id: crypto.randomUUID(),
        titel: gruppe.titel.trim().slice(0, 200) || 'Einsatz',
        beginn: hiorgZeitAlsLokal(gruppe.datum_von),
        ende: hiorgZeitAlsLokal(gruppe.datum_bis),
        ort: gruppe.ort ? gruppe.ort.slice(0, 200) : null,
        hiorgVeranstaltungId: gruppe.veranstaltung_id,
        pepId: null,
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
          const inzwischen = this.einsatzZuVeranstaltung(gruppe.veranstaltung_id);
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
    daten: Omit<Einsatz, 'id' | 'hiorgVeranstaltungId' | 'pepId'>,
  ): Promise<Einsatz | null> {
    this.fehler.set('');
    const neu: Einsatz = {
      ...daten,
      id: crypto.randomUUID(),
      hiorgVeranstaltungId: null,
      pepId: null,
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

  /**
   * Trägt die PEP-Datei am Einsatz ein (`null` löst die Verknüpfung). Lädt dazu den
   * aktuellen Stand, schreibt mit `If-Match` und meldet einen Konflikt als Fehler.
   * `true` bei Erfolg.
   */
  async pepVerknuepfen(einsatzId: string, pepId: string | null): Promise<boolean> {
    this.fehler.set('');
    try {
      const stand = await this.storage.ladeEinsatz(einsatzId);
      if (!stand) {
        this.fehler.set('Der Einsatz wurde nicht gefunden.');
        return false;
      }
      if (stand.daten.pepId === pepId) return true;
      await this.storage.speichereEinsatz({ ...stand.daten, pepId }, stand.version);
      await this.laden();
      return true;
    } catch (ursache) {
      this.fehler.set(
        ursache instanceof EinsatzplanungKonfliktFehler
          ? 'Der Einsatz wurde zwischenzeitlich geändert. Bitte erneut versuchen.'
          : fehlermeldung(ursache),
      );
      return false;
    }
  }
}
