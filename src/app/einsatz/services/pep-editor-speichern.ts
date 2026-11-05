import { Injectable, inject } from '@angular/core';
import { Einsatz } from '../models/einsatz.model';
import { PepVorlage } from '../models/pep.model';
import { Planung } from '../models/planung.model';
import { EinsatzStoreService } from './einsatz-store.service';
import { pepInhaltZuPlanung, planungZuPepInhalt, planungZuPepVorlageInhalt } from './pep-abbildung';
import { PepEditorKontext } from './pep-editor-kontext';
import { PepEditorOeffnenDienst } from './pep-editor-oeffnen';
import { istPepVorlage } from './pep-pruefung';
import { PepStoreService } from './pep-store.service';
import { PepVorlagenStoreService } from './pep-vorlagen-store.service';
import { PlanungStoreService } from './planung-store.service';

/** Ausgang eines Speicherversuchs; `konflikt`: die Datenbank hat einen neueren Stand (412). */
export interface SpeicherErgebnis {
  ok: boolean;
  konflikt: boolean;
  fehler: string;
}

const OK: SpeicherErgebnis = { ok: true, konflikt: false, fehler: '' };

/**
 * Speicherwege des PEP-Editors: PEP eines Einsatzes (`If-Match`), Zuordnen einer Datei zu
 * einem Einsatz (Anlegen mit `If-None-Match`), Speichern als neue Vorlage und Bearbeiten
 * einer Vorlage. Der lokale Stand im `PlanungStoreService` wird nie überschrieben, solange
 * der Aufrufer nicht ausdrücklich neu lädt (`neuLaden()`).
 */
@Injectable({ providedIn: 'root' })
export class PepEditorSpeichernDienst {
  private readonly pepStore = inject(PepStoreService);
  private readonly vorlagenStore = inject(PepVorlagenStoreService);
  private readonly einsatzStore = inject(EinsatzStoreService);
  private readonly planungStore = inject(PlanungStoreService);
  private readonly kontext = inject(PepEditorKontext);
  private readonly oeffnen = inject(PepEditorOeffnenDienst);

  /** Speichert die Planung dorthin, wo sie hingehört (PEP des Einsatzes oder Vorlage). */
  async speichern(planung: Planung): Promise<SpeicherErgebnis> {
    const ziel = this.kontext.ziel();
    if (ziel?.art === 'einsatz') return this.einsatzSpeichern(ziel.einsatz.id, planung);
    if (ziel?.art === 'vorlage') return this.vorlageSpeichern(planung);
    return { ok: false, konflikt: false, fehler: 'Die Planung gehört noch zu keinem Einsatz.' };
  }

  private async einsatzSpeichern(einsatzId: string, planung: Planung): Promise<SpeicherErgebnis> {
    const gespeichert = await this.pepStore.speichern(einsatzId, planungZuPepInhalt(planung));
    if (!gespeichert) {
      return { ok: false, konflikt: this.pepStore.konflikt(), fehler: this.pepStore.fehler() };
    }
    this.planungStore.gespeichertMerken(planung);
    void this.einsatzStore.laden();
    return OK;
  }

  /**
   * Legt die Planung einer geladenen Datei als PEP des Einsatzes an (`If-None-Match: *`) und
   * öffnet sie danach aus der Datenbank, damit Titel und Zeitraum des Einsatzes gelten.
   */
  async zuordnen(planung: Planung, einsatz: Einsatz): Promise<SpeicherErgebnis> {
    const angelegt = await this.pepStore.ausVorlageAnlegen(einsatz.id, null, planung);
    if (!angelegt) {
      return { ok: false, konflikt: this.pepStore.konflikt(), fehler: this.pepStore.fehler() };
    }
    void this.einsatzStore.laden();
    try {
      await this.oeffnen.oeffnen(einsatz);
    } catch (fehler) {
      return {
        ok: false,
        konflikt: false,
        fehler: `Die PEP wurde angelegt, konnte aber nicht neu geöffnet werden: ${
          fehler instanceof Error ? fehler.message : 'unbekannter Fehler'
        }`,
      };
    }
    return OK;
  }

  /** Neue PEP-Vorlage aus Posten und Beschreibung (ohne Einsatzkräfte); @returns Id oder Fehler. */
  async alsVorlageSpeichern(
    titel: string,
    planung: Planung,
  ): Promise<{ id: string | null; fehler: string }> {
    const id = await this.pepStore.alsVorlageSpeichern(titel, planung);
    return { id, fehler: id === null ? this.pepStore.fehler() : '' };
  }

  /**
   * Lädt den gespeicherten Stand nach einem Konflikt neu und ersetzt damit den lokalen Stand.
   * Nur nach ausdrücklicher Bestätigung der Person aufrufen.
   */
  async neuLaden(): Promise<SpeicherErgebnis> {
    const ziel = this.kontext.ziel();
    try {
      if (ziel?.art === 'einsatz') {
        const aktuell = await this.einsatzStore.einsatzLaden(ziel.einsatz.id);
        await this.oeffnen.oeffnen(aktuell?.daten ?? ziel.einsatz);
        return OK;
      }
      if (ziel?.art === 'vorlage' && ziel.version !== null) {
        return await this.vorlageOeffnen(ziel.vorlageId);
      }
    } catch (fehler) {
      return {
        ok: false,
        konflikt: false,
        fehler: fehler instanceof Error ? fehler.message : 'Der Stand konnte nicht geladen werden.',
      };
    }
    return { ok: false, konflikt: false, fehler: 'Es gibt keinen gespeicherten Stand zum Laden.' };
  }

  /** Verwirft Planung, Speicherort und gehaltenen PEP-Stand beim Verlassen des Editors. */
  verlassen(): void {
    this.planungStore.closePlanung();
    this.kontext.loeschen();
    this.pepStore.zuruecksetzen();
  }

  // ---- Vorlage bearbeiten -------------------------------------------------------------

  /** Öffnet eine vorhandene Vorlage im Editor-Zustand; Fehler (auch „nicht gefunden“) im Ergebnis. */
  async vorlageOeffnen(id: string): Promise<SpeicherErgebnis> {
    const stand = await this.vorlagenStore.vorlageLaden(id);
    if (!stand) {
      return {
        ok: false,
        konflikt: false,
        fehler: this.vorlagenStore.fehler() || 'Die Vorlage wurde nicht gefunden.',
      };
    }
    const jetzt = new Date().toISOString();
    const planung = pepInhaltZuPlanung(
      { ...stand.daten.inhalt, einsatzkraefte: [], einsatzleiterId: null },
      { id: stand.daten.id, name: stand.daten.titel, start: jetzt, end: jetzt },
    );
    this.kontext.setzen({ art: 'vorlage', vorlageId: stand.daten.id, version: stand.version });
    this.planungStore.oeffneGespeichert(planung);
    return OK;
  }

  /** Beginnt eine neue, noch nicht gespeicherte Vorlage (Anlegen erst beim Speichern). */
  neueVorlage(): void {
    const jetzt = new Date().toISOString();
    const planung: Planung = {
      id: crypto.randomUUID(),
      name: 'Neue Vorlage',
      start: jetzt,
      end: jetzt,
      beschreibung: null,
      posten: [],
      einsatzkraefte: [],
      einsatzleiter: null,
    };
    this.kontext.setzen({ art: 'vorlage', vorlageId: planung.id, version: null });
    this.planungStore.oeffneGespeichert(planung);
  }

  private async vorlageSpeichern(planung: Planung): Promise<SpeicherErgebnis> {
    const ziel = this.kontext.ziel();
    if (ziel?.art !== 'vorlage') {
      return { ok: false, konflikt: false, fehler: 'Es ist keine Vorlage geöffnet.' };
    }
    const vorlage: PepVorlage = {
      id: ziel.vorlageId,
      titel: planung.name.trim(),
      inhalt: planungZuPepVorlageInhalt(planung),
    };
    if (!istPepVorlage(vorlage)) {
      return {
        ok: false,
        konflikt: false,
        fehler:
          'Die Vorlage ist nicht speicherbar: Titel (1–200 Zeichen), Posten und Texte müssen die Grenzen einhalten.',
      };
    }
    const version =
      ziel.version === null
        ? await this.vorlagenStore.anlegen(vorlage)
        : await this.vorlagenStore.speichern(vorlage, ziel.version);
    if (version === null) {
      return {
        ok: false,
        konflikt: this.vorlagenStore.konflikt(),
        fehler: this.vorlagenStore.fehler(),
      };
    }
    this.kontext.setzen({ art: 'vorlage', vorlageId: vorlage.id, version });
    this.planungStore.gespeichertMerken(planung);
    return OK;
  }
}
