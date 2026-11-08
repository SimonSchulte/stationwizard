import { Injectable, computed, inject, signal } from '@angular/core';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import {
  AbschnittFarbe,
  VB_GRENZEN,
  VbAbschnitt,
  VbInhalt,
  VbLaufzettel,
  VbPosition,
  VbVorlage,
  Vorbereitung,
} from '../models/vb.model';
import { ApiVbVorlagenStorage } from '../storage/api-vb-vorlagen-storage';
import { ApiVorbereitungStorage } from '../storage/api-vorbereitung-storage';
import { EinsatzplanungKonfliktFehler } from '../storage/einsatzplanung-fehler';
import { versionAlsZahl } from '../storage/einsatzplanung-version';
import { MitVersion } from '../storage/mit-version';
import { VbVorlagenStorage } from '../storage/vb-vorlagen-storage';
import { VorbereitungStorage } from '../storage/vorbereitung-storage';
import { LaufzettelLayoutWahl } from './laufzettel-layout-wahl';
import { laufzettelPlatz, ueberlaufPositionen } from './laufzettel-platz';
import { VbAenderung, vbAbgleich, wendeAenderungenAn } from './vb-abgleich';
import {
  inhaltAlsVorlage,
  kopiereVorlage,
  laufzettelDuplizieren as dupliziereLaufzettel,
  laufzettelTeilen as teileLaufzettel,
  laufzettelZusammenfuehren as fuehreZusammen,
  leererInhalt,
  naechsteAbschnittFarbe,
  neuePosition,
  neuerAbschnitt,
  neuerLaufzettel,
} from './vb-kopie';
import { vbInhaltProbleme } from './vb-pruefung';

export type EditorModus = 'vorbereitung' | 'vorlage';
export type SpeicherZustand = 'ruhig' | 'speichert' | 'konflikt' | 'fehler';

/**
 * Arbeitsstand eines Editors, für Vorbereitung und Vorlage gleich. Bei einer Vorlage ist
 * `titel` der Vorlagentitel und `vorlageId`/`vorlageVersion` bleiben `null`; bei einer
 * Vorbereitung ist `titel` leer.
 */
export interface VbEditorStand {
  titel: string;
  vorlageId: string | null;
  vorlageVersion: number | null;
  inhalt: VbInhalt;
}

/** Mindestens 30 Schritte laut Vorgabe; großzügig bemessen. */
const UNDO_TIEFE = 50;

function fehlermeldung(fehler: unknown, vorgabe: string): string {
  return fehler instanceof Error ? fehler.message : vorgabe;
}

function standVonVorbereitung(v: Vorbereitung): VbEditorStand {
  return {
    titel: '',
    vorlageId: v.vorlageId,
    vorlageVersion: v.vorlageVersion,
    inhalt: structuredClone(v.inhalt),
  };
}

function standVonVorlage(v: VbVorlage): VbEditorStand {
  return {
    titel: v.titel,
    vorlageId: null,
    vorlageVersion: null,
    inhalt: structuredClone(v.inhalt),
  };
}

function gleich(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Arbeitsstand des VB-Editors, entweder für die Vorbereitung eines Einsatzes oder für eine
 * Vorlage (`modus`). `entwurf` ist der bearbeitbare Stand, `basislinie` der zuletzt
 * gespeicherte; ihr Vergleich ergibt `geaendert`. Alle Bearbeitungen sind unveränderlich,
 * rückgängig machbar und gehen über die reinen Funktionen aus `vb-kopie.ts`.
 *
 * Meldungen: wie die übrigen Stores des Projekts führt er Fehler als Signale
 * (`ladeFehler`, `speicherFehler`, `hinweis`); Seiten zeigen sie über `<app-meldung>`.
 */
/** Titel des Sammelabschnitts für Laufzettel eines gelöschten Abschnitts. */
export const OHNE_ABSCHNITT_TITEL = 'Ohne Abschnitt';

@Injectable({ providedIn: 'root' })
export class VbEditorStoreService {
  private readonly layout = inject(LaufzettelLayoutWahl);
  private readonly vorbereitungen: VorbereitungStorage = inject(ApiVorbereitungStorage);
  private readonly vorlagenStorage: VbVorlagenStorage = inject(ApiVbVorlagenStorage);

  readonly modus = signal<EditorModus | null>(null);
  /** Einsatz der geladenen Vorbereitung (nur im Modus `vorbereitung`). */
  readonly einsatzId = signal<string | null>(null);
  /** Id der bearbeiteten Vorlage (nur im Modus `vorlage`). */
  readonly vorlageId = signal<string | null>(null);

  /** Zuletzt gespeicherter Stand samt Version; `null` bei einer noch nicht gespeicherten Vorlage. */
  readonly geladen = signal<MitVersion<VbEditorStand> | null>(null);
  readonly entwurf = signal<VbEditorStand | null>(null);
  private readonly basislinie = signal<VbEditorStand | null>(null);

  readonly inhalt = computed(() => this.entwurf()?.inhalt ?? null);
  readonly titel = computed(() => this.entwurf()?.titel ?? '');
  readonly geaendert = computed(() => {
    const entwurf = this.entwurf();
    return entwurf !== null && !gleich(entwurf, this.basislinie());
  });
  readonly istNeu = computed(() => this.entwurf() !== null && this.geladen() === null);

  readonly ladeLaeuft = signal(false);
  readonly ladeFehler = signal('');
  /** Der Einsatz hat (noch) keine Vorbereitung bzw. die Vorlage gibt es nicht. */
  readonly nichtGefunden = signal(false);

  readonly speicherZustand = signal<SpeicherZustand>('ruhig');
  readonly speicherFehler = signal('');
  /** Veraltete Version: der lokale Entwurf bleibt erhalten, bis er bewusst verworfen wird. */
  readonly konflikt = computed(() => this.speicherZustand() === 'konflikt');
  readonly speichertGerade = computed(() => this.speicherZustand() === 'speichert');
  /** Kurzer Hinweis, wenn eine Bearbeitung an einer Grenze scheiterte (Seiten zeigen ihn als Meldung). */
  readonly hinweis = signal('');

  // Rückgängig
  private readonly stapel = signal<VbEditorStand[]>([]);
  readonly kannRueckgaengig = computed(() => this.stapel().length > 0);
  private letzterSammelschluessel: string | null = null;

  // Abgleich mit der Vorlage (nur Modus vorbereitung)
  /** Aktueller Stand der zugehörigen Vorlage, sobald geladen. */
  readonly abgleichVorlage = signal<MitVersion<VbVorlage> | null>(null);
  readonly vorlageFehlt = signal(false);
  readonly vorlageKonflikt = signal(false);
  private abgleichLauf: Promise<void> | null = null;

  readonly abweichungen = computed<VbAenderung[]>(() => {
    const vorlage = this.abgleichVorlage();
    const entwurf = this.entwurf();
    if (this.modus() !== 'vorbereitung' || !vorlage || !entwurf) return [];
    return vbAbgleich(vorlage.daten.inhalt, entwurf.inhalt);
  });

  constructor() {
    inject(VerlassenSchutz).registrieren(() => this.geaendert());
  }

  // ---------------------------------------------------------------- Laden und Anlegen

  async vorbereitungLaden(einsatzId: string): Promise<void> {
    this.beginneLaden();
    try {
      const stand = await this.vorbereitungen.ladeVorbereitung(einsatzId);
      if (!stand) {
        this.nichtGefunden.set(true);
        this.zuruecksetzen();
        return;
      }
      this.modus.set('vorbereitung');
      this.einsatzId.set(einsatzId);
      this.vorlageId.set(null);
      this.uebernehmeStand({ daten: standVonVorbereitung(stand.daten), version: stand.version });
      void this.abgleichVorlageLaden();
    } catch (ursache) {
      this.ladeFehler.set(fehlermeldung(ursache, 'Die Vorbereitung konnte nicht geladen werden.'));
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  async vorlageLaden(vorlageId: string): Promise<void> {
    this.beginneLaden();
    try {
      const stand = await this.vorlagenStorage.ladeVorlage(vorlageId);
      if (!stand) {
        this.nichtGefunden.set(true);
        this.zuruecksetzen();
        return;
      }
      this.modus.set('vorlage');
      this.einsatzId.set(null);
      this.vorlageId.set(vorlageId);
      this.uebernehmeStand({ daten: standVonVorlage(stand.daten), version: stand.version });
    } catch (ursache) {
      this.ladeFehler.set(fehlermeldung(ursache, 'Die Vorlage konnte nicht geladen werden.'));
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  /** Beginnt eine neue, noch ungespeicherte Vorlage (gilt sofort als geändert). */
  neueVorlageBeginnen(titel = 'Neue Vorlage', inhalt: VbInhalt = leererInhalt()): void {
    this.zuruecksetzen();
    this.modus.set('vorlage');
    this.vorlageId.set(crypto.randomUUID());
    this.entwurf.set({
      titel,
      vorlageId: null,
      vorlageVersion: null,
      inhalt: structuredClone(inhalt),
    });
  }

  /**
   * Legt die Vorbereitung des Einsatzes aus einer Vorlage an (Kopie mit neuen Ids und
   * `herkunftId`, sofort gespeichert) und lädt sie in den Editor. `true` bei Erfolg.
   */
  async ausVorlageAnlegen(einsatzId: string, vorlageId: string): Promise<boolean> {
    this.beginneLaden();
    try {
      const vorlage = await this.vorlagenStorage.ladeVorlage(vorlageId);
      if (!vorlage) {
        this.ladeFehler.set('Die Vorlage wurde nicht gefunden.');
        return false;
      }
      const version = versionAlsZahl(vorlage.version);
      if (version === null) {
        this.ladeFehler.set('Der Server hat keine gültige Vorlagenversion geliefert.');
        return false;
      }
      return await this.legeAn(einsatzId, kopiereVorlage(vorlage.daten, version));
    } catch (ursache) {
      this.ladeFehler.set(fehlermeldung(ursache, 'Die Vorbereitung konnte nicht angelegt werden.'));
      return false;
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  /** Legt eine leere Vorbereitung ohne Vorlage an und lädt sie. `true` bei Erfolg. */
  async leerAnlegen(einsatzId: string): Promise<boolean> {
    this.beginneLaden();
    try {
      return await this.legeAn(einsatzId, {
        vorlageId: null,
        vorlageVersion: null,
        inhalt: leererInhalt(),
      });
    } catch (ursache) {
      this.ladeFehler.set(fehlermeldung(ursache, 'Die Vorbereitung konnte nicht angelegt werden.'));
      return false;
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  private async legeAn(einsatzId: string, vorbereitung: Vorbereitung): Promise<boolean> {
    const version = await this.vorbereitungen.legeVorbereitungAn(einsatzId, vorbereitung);
    this.modus.set('vorbereitung');
    this.einsatzId.set(einsatzId);
    this.vorlageId.set(null);
    this.uebernehmeStand({ daten: standVonVorbereitung(vorbereitung), version });
    void this.abgleichVorlageLaden();
    return true;
  }

  /** Verwirft den lokalen Entwurf und lädt den gespeicherten Stand neu (nach einem Konflikt). */
  async neuLadenNachKonflikt(): Promise<void> {
    const einsatz = this.einsatzId();
    const vorlage = this.vorlageId();
    if (this.modus() === 'vorbereitung' && einsatz) await this.vorbereitungLaden(einsatz);
    else if (this.modus() === 'vorlage' && vorlage) await this.vorlageLaden(vorlage);
  }

  /** Verlässt den Editor ohne Speichern; alle Zustände werden geleert. */
  zuruecksetzen(): void {
    this.modus.set(null);
    this.einsatzId.set(null);
    this.vorlageId.set(null);
    this.geladen.set(null);
    this.entwurf.set(null);
    this.basislinie.set(null);
    this.stapel.set([]);
    this.letzterSammelschluessel = null;
    this.speicherZustand.set('ruhig');
    this.speicherFehler.set('');
    this.abgleichVorlage.set(null);
    this.vorlageFehlt.set(false);
    this.vorlageKonflikt.set(false);
    this.abgleichLauf = null;
    this.hinweis.set('');
  }

  private beginneLaden(): void {
    this.zuruecksetzen();
    this.ladeLaeuft.set(true);
    this.ladeFehler.set('');
    this.nichtGefunden.set(false);
  }

  private uebernehmeStand(stand: MitVersion<VbEditorStand>, stapelBehalten = false): void {
    this.geladen.set(stand);
    this.entwurf.set(structuredClone(stand.daten));
    this.basislinie.set(structuredClone(stand.daten));
    if (!stapelBehalten) this.stapel.set([]);
    this.letzterSammelschluessel = null;
    this.speicherZustand.set('ruhig');
    this.speicherFehler.set('');
  }

  // ---------------------------------------------------------------- Speichern und Löschen

  /** `true` bei Erfolg. Bei Fehler oder Konflikt bleibt der Entwurf unverändert erhalten. */
  async speichern(): Promise<boolean> {
    const entwurf = this.entwurf();
    const modus = this.modus();
    if (!entwurf || !modus) return false;
    const probleme = vbInhaltProbleme(entwurf.inhalt);
    if (modus === 'vorlage' && entwurf.titel.trim() === '')
      probleme.unshift('Eine Vorlage braucht einen Titel.');
    if (probleme.length) {
      this.speicherZustand.set('fehler');
      this.speicherFehler.set(probleme.join(' '));
      return false;
    }
    this.speicherZustand.set('speichert');
    this.speicherFehler.set('');
    try {
      const version = await this.schreibe(modus, entwurf);
      // Nach dem Speichern bleibt „Rückgängig“ verfügbar.
      this.uebernehmeStand({ daten: structuredClone(entwurf), version }, true);
      return true;
    } catch (ursache) {
      if (ursache instanceof EinsatzplanungKonfliktFehler) {
        this.speicherZustand.set('konflikt');
      } else {
        this.speicherZustand.set('fehler');
      }
      this.speicherFehler.set(fehlermeldung(ursache, 'Das Speichern ist fehlgeschlagen.'));
      return false;
    }
  }

  private async schreibe(modus: EditorModus, entwurf: VbEditorStand): Promise<string> {
    const geladen = this.geladen();
    if (modus === 'vorbereitung') {
      const einsatzId = this.einsatzId();
      if (!einsatzId || !geladen) throw new Error('Die Vorbereitung ist nicht geladen.');
      const vorbereitung: Vorbereitung = {
        vorlageId: entwurf.vorlageId,
        vorlageVersion: entwurf.vorlageVersion,
        inhalt: entwurf.inhalt,
      };
      return this.vorbereitungen.speichereVorbereitung(einsatzId, vorbereitung, geladen.version);
    }
    const id = this.vorlageId();
    if (!id) throw new Error('Die Vorlage ist nicht geladen.');
    const vorlage: VbVorlage = { id, titel: entwurf.titel, inhalt: entwurf.inhalt };
    return geladen
      ? this.vorlagenStorage.speichereVorlage(vorlage, geladen.version)
      : this.vorlagenStorage.legeVorlageAn(vorlage);
  }

  /** Löscht die geladene Vorbereitung (mit der geladenen Version). `true` bei Erfolg. */
  async vorbereitungLoeschen(): Promise<boolean> {
    const einsatzId = this.einsatzId();
    const geladen = this.geladen();
    if (this.modus() !== 'vorbereitung' || !einsatzId || !geladen) return false;
    try {
      await this.vorbereitungen.loescheVorbereitung(einsatzId, geladen.version);
      this.zuruecksetzen();
      return true;
    } catch (ursache) {
      this.speicherZustand.set(
        ursache instanceof EinsatzplanungKonfliktFehler ? 'konflikt' : 'fehler',
      );
      this.speicherFehler.set(fehlermeldung(ursache, 'Das Löschen ist fehlgeschlagen.'));
      return false;
    }
  }

  /** Löscht die geladene Vorlage. `true` bei Erfolg. */
  async vorlageLoeschen(): Promise<boolean> {
    const id = this.vorlageId();
    const geladen = this.geladen();
    if (this.modus() !== 'vorlage' || !id || !geladen) return false;
    try {
      await this.vorlagenStorage.loescheVorlage(id, geladen.version);
      this.zuruecksetzen();
      return true;
    } catch (ursache) {
      this.speicherZustand.set(
        ursache instanceof EinsatzplanungKonfliktFehler ? 'konflikt' : 'fehler',
      );
      this.speicherFehler.set(fehlermeldung(ursache, 'Das Löschen ist fehlgeschlagen.'));
      return false;
    }
  }

  /**
   * „Als neue Vorlage speichern“: legt aus dem aktuellen Entwurf (Ids neu, ohne Herkunft)
   * eine neue Vorlage an. Gibt ihre Id zurück oder `null` bei Fehler. Der Editor bleibt
   * unverändert.
   */
  async alsNeueVorlageSpeichern(titel: string): Promise<string | null> {
    const entwurf = this.entwurf();
    if (!entwurf) return null;
    const inhalt = inhaltAlsVorlage(entwurf.inhalt);
    const probleme = vbInhaltProbleme(inhalt);
    if (titel.trim() === '') probleme.unshift('Eine Vorlage braucht einen Titel.');
    if (probleme.length) {
      this.speicherFehler.set(probleme.join(' '));
      return null;
    }
    const vorlage: VbVorlage = { id: crypto.randomUUID(), titel: titel.trim(), inhalt };
    try {
      await this.vorlagenStorage.legeVorlageAn(vorlage);
      return vorlage.id;
    } catch (ursache) {
      this.speicherFehler.set(fehlermeldung(ursache, 'Die Vorlage konnte nicht angelegt werden.'));
      return null;
    }
  }

  // ---------------------------------------------------------------- Abgleich mit der Vorlage

  /** Lädt die zugehörige Vorlage für den Abgleich genau einmal je Editorlauf. */
  abgleichVorlageLaden(): Promise<void> {
    if (this.abgleichLauf) return this.abgleichLauf;
    const vorlageId = this.entwurf()?.vorlageId;
    if (this.modus() !== 'vorbereitung' || !vorlageId) return Promise.resolve();
    const einsatzId = this.einsatzId();
    const lauf = (async () => {
      try {
        const vorlage = await this.vorlagenStorage.ladeVorlage(vorlageId);
        if (this.einsatzId() !== einsatzId) return; // Editor wurde inzwischen gewechselt
        this.vorlageFehlt.set(vorlage === null);
        this.abgleichVorlage.set(vorlage);
      } catch {
        // Der Abgleich ist eine Zugabe; ohne Vorlage zeigt der Editor keine Abweichungen.
        if (this.einsatzId() === einsatzId) this.abgleichLauf = null;
      }
    })();
    this.abgleichLauf = lauf;
    return lauf;
  }

  /**
   * Quittiert einen gescheiterten Abgleich (etwa nach einem Versionskonflikt der Vorlage) und
   * lädt die Vorlage neu. Die Vorbereitung bleibt unverändert.
   */
  abgleichNeuLaden(): Promise<void> {
    this.abgleichLauf = null;
    this.vorlageKonflikt.set(false);
    this.vorlageFehlt.set(false);
    this.speicherFehler.set('');
    if (this.speicherZustand() === 'fehler') this.speicherZustand.set('ruhig');
    return this.abgleichVorlageLaden();
  }

  /**
   * Schreibt die gewählten Abweichungen auf die Vorlage zurück: lädt die Vorlage frisch,
   * wendet an, speichert sie mit `If-Match` und danach die Vorbereitung. Scheitert das
   * Speichern der Vorlage (etwa 412), bleibt die Vorbereitung vollständig unverändert und
   * `vorlageKonflikt`/`speicherFehler` melden es. `true` nur, wenn beides gespeichert ist.
   */
  async aufVorlageAnwenden(schluessel: ReadonlySet<string>): Promise<boolean> {
    const entwurf = this.entwurf();
    if (this.modus() !== 'vorbereitung' || !entwurf?.vorlageId) return false;
    this.vorlageKonflikt.set(false);
    this.speicherFehler.set('');
    const vorlageId = entwurf.vorlageId;

    let frisch: MitVersion<VbVorlage> | null;
    try {
      frisch = await this.vorlagenStorage.ladeVorlage(vorlageId);
    } catch (ursache) {
      this.speicherZustand.set('fehler');
      this.speicherFehler.set(fehlermeldung(ursache, 'Die Vorlage konnte nicht geladen werden.'));
      return false;
    }
    if (!frisch) {
      this.vorlageFehlt.set(true);
      this.speicherZustand.set('fehler');
      this.speicherFehler.set('Die Vorlage existiert nicht mehr.');
      return false;
    }

    const ergebnis = wendeAenderungenAn(frisch.daten.inhalt, entwurf.inhalt, schluessel);
    const probleme = vbInhaltProbleme(ergebnis.vorlage);
    if (probleme.length) {
      this.speicherZustand.set('fehler');
      this.speicherFehler.set(`Die Vorlage wäre ungültig: ${probleme.join(' ')}`);
      return false;
    }

    const neueVorlage: VbVorlage = { ...frisch.daten, inhalt: ergebnis.vorlage };
    let neueVersion: string;
    try {
      neueVersion = await this.vorlagenStorage.speichereVorlage(neueVorlage, frisch.version);
    } catch (ursache) {
      // Die Vorbereitung bleibt unangetastet.
      const konflikt = ursache instanceof EinsatzplanungKonfliktFehler;
      this.vorlageKonflikt.set(konflikt);
      this.speicherZustand.set('fehler');
      this.speicherFehler.set(
        konflikt
          ? 'Die Vorlage wurde zwischenzeitlich geändert. Die Vorbereitung bleibt unverändert; bitte den Abgleich neu öffnen.'
          : fehlermeldung(ursache, 'Die Vorlage konnte nicht gespeichert werden.'),
      );
      if (konflikt) {
        this.abgleichVorlage.set(null);
        this.abgleichLauf = null;
      }
      return false;
    }

    this.abgleichVorlage.set({ daten: neueVorlage, version: neueVersion });
    const zahl = versionAlsZahl(neueVersion);
    this.aendere((stand) => ({
      ...stand,
      vorlageVersion: zahl ?? stand.vorlageVersion,
      inhalt: ergebnis.vb,
    }));
    return this.speichern();
  }

  // ---------------------------------------------------------------- Rückgängig

  rueckgaengig(): void {
    const stapel = this.stapel();
    const letzter = stapel.at(-1);
    if (!letzter) return;
    this.stapel.set(stapel.slice(0, -1));
    this.entwurf.set(letzter);
    this.letzterSammelschluessel = null;
  }

  /**
   * Gemeinsamer Weg aller Bearbeitungen. Mit `sammelSchluessel` werden aufeinanderfolgende
   * Änderungen desselben Feldes (Tippen) zu einem Rückgängig-Schritt zusammengefasst.
   */
  private aendere(
    aenderung: (stand: VbEditorStand) => VbEditorStand,
    sammelSchluessel?: string,
  ): void {
    const aktuell = this.entwurf();
    if (!aktuell) return;
    const neu = aenderung(aktuell);
    if (neu === aktuell) return;
    this.hinweis.set('');
    if (!sammelSchluessel || sammelSchluessel !== this.letzterSammelschluessel) {
      this.stapel.update((s) => [...s, aktuell].slice(-UNDO_TIEFE));
    }
    this.letzterSammelschluessel = sammelSchluessel ?? null;
    this.entwurf.set(neu);
  }

  private aendereInhalt(
    aenderung: (inhalt: VbInhalt) => VbInhalt,
    sammelSchluessel?: string,
  ): void {
    this.aendere((stand) => {
      const inhalt = aenderung(stand.inhalt);
      return inhalt === stand.inhalt ? stand : { ...stand, inhalt };
    }, sammelSchluessel);
  }

  private grenze(text: string): null {
    this.hinweis.set(text);
    return null;
  }

  // ---------------------------------------------------------------- Kopf und Anweisungen

  titelAendern(titel: string): void {
    this.aendere((s) => (s.titel === titel ? s : { ...s, titel }), 'titel');
  }

  anweisungenAendern(text: string): void {
    this.aendereInhalt(
      (i) =>
        i.anweisungen === text ? i : { ...i, anweisungen: text.slice(0, VB_GRENZEN.anweisungen) },
      'anweisungen',
    );
  }

  // ---------------------------------------------------------------- Abschnitte

  /** Fügt am Ende einen Abschnitt ein; gibt seine Id zurück, `null` an der Grenze. */
  abschnittHinzufuegen(): string | null {
    const inhalt = this.inhalt();
    if (!inhalt) return null;
    if (inhalt.abschnitte.length >= VB_GRENZEN.abschnitte) {
      return this.grenze(`Höchstens ${VB_GRENZEN.abschnitte} Abschnitte sind möglich.`);
    }
    const abschnitt = neuerAbschnitt(naechsteAbschnittFarbe(inhalt));
    this.aendereInhalt((i) => ({ ...i, abschnitte: [...i.abschnitte, abschnitt] }));
    return abschnitt.id;
  }

  abschnittAendern(
    id: string,
    patch: Partial<{ titel: string; farbe: AbschnittFarbe; fachgruppe: VbAbschnitt['fachgruppe'] }>,
  ): void {
    const schluessel = `abschnitt:${id}:${Object.keys(patch).join(',')}`;
    this.aendereInhalt(
      (i) => ({
        ...i,
        abschnitte: i.abschnitte.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }),
      schluessel,
    );
  }

  abschnittVerschieben(id: string, neuerIndex: number): void {
    this.aendereInhalt((i) => {
      const von = i.abschnitte.findIndex((a) => a.id === id);
      if (von < 0) return i;
      const nach = Math.min(Math.max(neuerIndex, 0), i.abschnitte.length - 1);
      if (nach === von) return i;
      const abschnitte = [...i.abschnitte];
      const [abschnitt] = abschnitte.splice(von, 1);
      abschnitte.splice(nach, 0, abschnitt);
      return { ...i, abschnitte };
    });
  }

  /**
   * Löscht einen Abschnitt. Seine Laufzettel gehen nicht verloren, sondern wandern an das Ende
   * des Abschnitts „Ohne Abschnitt“ (wird bei Bedarf angelegt). Wird dieser Sammelabschnitt
   * selbst gelöscht, entfallen seine Laufzettel.
   */
  abschnittLoeschen(id: string): void {
    this.aendereInhalt((i) => {
      const abschnitt = i.abschnitte.find((a) => a.id === id);
      if (!abschnitt) return i;
      const uebrige = i.abschnitte.filter((a) => a.id !== id);
      if (abschnitt.laufzettel.length === 0 || abschnitt.titel === OHNE_ABSCHNITT_TITEL) {
        return { ...i, abschnitte: uebrige };
      }
      const sammel = uebrige.find((a) => a.titel === OHNE_ABSCHNITT_TITEL);
      if (sammel) {
        return {
          ...i,
          abschnitte: uebrige.map((a) =>
            a === sammel ? { ...a, laufzettel: [...a.laufzettel, ...abschnitt.laufzettel] } : a,
          ),
        };
      }
      const neu: VbAbschnitt = {
        ...neuerAbschnitt(naechsteAbschnittFarbe({ ...i, abschnitte: uebrige })),
        titel: OHNE_ABSCHNITT_TITEL,
        laufzettel: abschnitt.laufzettel,
      };
      return { ...i, abschnitte: [...uebrige, neu] };
    });
  }

  /** Setzt die Fachgruppe des Abschnitts als Fachgruppe aller seiner Laufzettel. */
  fachgruppeAufLaufzettelUebertragen(abschnittId: string): void {
    this.aendereInhalt((i) => ({
      ...i,
      abschnitte: i.abschnitte.map((a) =>
        a.id === abschnittId
          ? { ...a, laufzettel: a.laufzettel.map((l) => ({ ...l, fachgruppe: a.fachgruppe })) }
          : a,
      ),
    }));
  }

  // ---------------------------------------------------------------- Laufzettel

  private laufzettelAnzahl(): number {
    return this.inhalt()?.abschnitte.reduce((s, a) => s + a.laufzettel.length, 0) ?? 0;
  }

  /** Sucht einen Laufzettel samt Abschnitt im aktuellen Entwurf. */
  laufzettelFinden(id: string): { abschnitt: VbAbschnitt; laufzettel: VbLaufzettel } | null {
    for (const abschnitt of this.inhalt()?.abschnitte ?? []) {
      const laufzettel = abschnitt.laufzettel.find((l) => l.id === id);
      if (laufzettel) return { abschnitt, laufzettel };
    }
    return null;
  }

  /** Fügt am Ende des Abschnitts einen Laufzettel ein; gibt seine Id zurück, `null` an der Grenze. */
  laufzettelHinzufuegen(abschnittId: string): string | null {
    const abschnitt = this.inhalt()?.abschnitte.find((a) => a.id === abschnittId);
    if (!abschnitt) return null;
    if (this.laufzettelAnzahl() >= VB_GRENZEN.laufzettel) {
      return this.grenze(`Höchstens ${VB_GRENZEN.laufzettel} Laufzettel sind möglich.`);
    }
    const laufzettel = neuerLaufzettel(abschnitt);
    this.aendereLaufzettelListe(abschnittId, (liste) => [...liste, laufzettel]);
    return laufzettel.id;
  }

  laufzettelAendern(
    id: string,
    patch: Partial<
      Pick<
        VbLaufzettel,
        'ueberschrift' | 'lagerort' | 'transportMit' | 'auftraggeber' | 'fachgruppe'
      >
    >,
  ): void {
    const schluessel = `laufzettel:${id}:${Object.keys(patch).join(',')}`;
    this.aendereInhalt(
      (i) => ({
        ...i,
        abschnitte: i.abschnitte.map((a) => ({
          ...a,
          laufzettel: a.laufzettel.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      }),
      schluessel,
    );
  }

  /** Verschiebt in einen Abschnitt (auch einen anderen) an die Stelle `zielIndex`. */
  laufzettelVerschieben(id: string, zielAbschnittId: string, zielIndex: number): void {
    this.aendereInhalt((i) => {
      const gefunden = i.abschnitte.flatMap((a) => a.laufzettel).find((l) => l.id === id);
      if (!gefunden || !i.abschnitte.some((a) => a.id === zielAbschnittId)) return i;
      const ohne = i.abschnitte.map((a) => ({
        ...a,
        laufzettel: a.laufzettel.filter((l) => l.id !== id),
      }));
      const abschnitte = ohne.map((a) => {
        if (a.id !== zielAbschnittId) return a;
        const index = Math.min(Math.max(zielIndex, 0), a.laufzettel.length);
        const liste = [...a.laufzettel];
        liste.splice(index, 0, gefunden);
        return { ...a, laufzettel: liste };
      });
      return gleich(abschnitte, i.abschnitte) ? i : { ...i, abschnitte };
    });
  }

  /** Dupliziert direkt hinter das Original; gibt die Id der Kopie zurück. */
  laufzettelDuplizieren(id: string): string | null {
    const treffer = this.laufzettelFinden(id);
    if (!treffer) return null;
    if (this.laufzettelAnzahl() >= VB_GRENZEN.laufzettel) {
      return this.grenze(`Höchstens ${VB_GRENZEN.laufzettel} Laufzettel sind möglich.`);
    }
    const kopie = dupliziereLaufzettel(treffer.laufzettel);
    this.einfuegenNach(treffer.abschnitt.id, id, kopie);
    return kopie.id;
  }

  /** Teilt: die gewählten Positionen bilden einen neuen Laufzettel hinter dem Original. */
  laufzettelTeilen(id: string, positionIds: readonly string[]): string | null {
    const treffer = this.laufzettelFinden(id);
    if (!treffer) return null;
    const auswahl = new Set(positionIds);
    const anzahl = treffer.laufzettel.positionen.filter((p) => auswahl.has(p.id)).length;
    if (anzahl === 0 || anzahl === treffer.laufzettel.positionen.length) {
      return this.grenze('Zum Teilen mindestens eine, aber nicht alle Positionen wählen.');
    }
    if (this.laufzettelAnzahl() >= VB_GRENZEN.laufzettel) {
      return this.grenze(`Höchstens ${VB_GRENZEN.laufzettel} Laufzettel sind möglich.`);
    }
    const { original, abgetrennt } = teileLaufzettel(treffer.laufzettel, positionIds);
    this.aendereInhalt((i) => ({
      ...i,
      abschnitte: i.abschnitte.map((a) =>
        a.id !== treffer.abschnitt.id
          ? a
          : {
              ...a,
              laufzettel: a.laufzettel.flatMap((l) => (l.id === id ? [original, abgetrennt] : [l])),
            },
      ),
    }));
    return abgetrennt.id;
  }

  /**
   * „In zwei Laufzettel aufteilen“ bei zu vollem Laufzettel: die Positionen, die nicht mehr
   * passen, wandern in einen neuen Laufzettel. Gibt dessen Id zurück; `null`, wenn nichts zu teilen ist.
   */
  laufzettelAufteilen(id: string): string | null {
    const treffer = this.laufzettelFinden(id);
    const streifen = this.layout.streifenJeSeite();
    if (!treffer || laufzettelPlatz(treffer.laufzettel, streifen).zustand !== 'zu-voll')
      return null;
    return this.laufzettelTeilen(id, ueberlaufPositionen(treffer.laufzettel, streifen));
  }

  /**
   * Hängt die Positionen von `quelleId` an `zielId` und entfernt `quelleId`.
   * `false`, wenn der Laufzettel dadurch mehr als 50 Positionen hätte oder eine Id fehlt.
   */
  laufzettelZusammenfuehren(zielId: string, quelleId: string): boolean {
    const ziel = this.laufzettelFinden(zielId);
    const quelle = this.laufzettelFinden(quelleId);
    if (!ziel || !quelle || zielId === quelleId) return false;
    if (
      ziel.laufzettel.positionen.length + quelle.laufzettel.positionen.length >
      VB_GRENZEN.positionen
    ) {
      this.grenze(`Ein Laufzettel kann höchstens ${VB_GRENZEN.positionen} Positionen haben.`);
      return false;
    }
    const zusammen = fuehreZusammen(ziel.laufzettel, quelle.laufzettel);
    this.aendereInhalt((i) => ({
      ...i,
      abschnitte: i.abschnitte.map((a) => ({
        ...a,
        laufzettel: a.laufzettel
          .filter((l) => l.id !== quelleId)
          .map((l) => (l.id === zielId ? zusammen : l)),
      })),
    }));
    return true;
  }

  laufzettelLoeschen(id: string): void {
    this.aendereInhalt((i) => ({
      ...i,
      abschnitte: i.abschnitte.map((a) => ({
        ...a,
        laufzettel: a.laufzettel.filter((l) => l.id !== id),
      })),
    }));
  }

  private aendereLaufzettelListe(
    abschnittId: string,
    aenderung: (liste: VbLaufzettel[]) => VbLaufzettel[],
  ): void {
    this.aendereInhalt((i) => ({
      ...i,
      abschnitte: i.abschnitte.map((a) =>
        a.id === abschnittId ? { ...a, laufzettel: aenderung(a.laufzettel) } : a,
      ),
    }));
  }

  private einfuegenNach(abschnittId: string, nachId: string, laufzettel: VbLaufzettel): void {
    this.aendereLaufzettelListe(abschnittId, (liste) =>
      liste.flatMap((l) => (l.id === nachId ? [l, laufzettel] : [l])),
    );
  }

  // ---------------------------------------------------------------- Positionen

  /** Fügt am Ende des Laufzettels eine leere Position ein; gibt ihre Id zurück, `null` an der Grenze. */
  positionHinzufuegen(laufzettelId: string): string | null {
    const treffer = this.laufzettelFinden(laufzettelId);
    if (!treffer) return null;
    if (treffer.laufzettel.positionen.length >= VB_GRENZEN.positionen) {
      return this.grenze(
        `Ein Laufzettel kann höchstens ${VB_GRENZEN.positionen} Positionen haben.`,
      );
    }
    const position = neuePosition();
    this.aenderePositionen(laufzettelId, (liste) => [...liste, position]);
    return position.id;
  }

  positionAendern(id: string, patch: Partial<Pick<VbPosition, 'anzahl' | 'material'>>): void {
    const schluessel = `position:${id}:${Object.keys(patch).join(',')}`;
    this.aendereInhalt(
      (i) => ({
        ...i,
        abschnitte: i.abschnitte.map((a) => ({
          ...a,
          laufzettel: a.laufzettel.map((l) => ({
            ...l,
            positionen: l.positionen.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          })),
        })),
      }),
      schluessel,
    );
  }

  positionVerschieben(laufzettelId: string, positionId: string, neuerIndex: number): void {
    this.aenderePositionen(laufzettelId, (liste) => {
      const von = liste.findIndex((p) => p.id === positionId);
      if (von < 0) return liste;
      const nach = Math.min(Math.max(neuerIndex, 0), liste.length - 1);
      if (nach === von) return liste;
      const neu = [...liste];
      const [position] = neu.splice(von, 1);
      neu.splice(nach, 0, position);
      return neu;
    });
  }

  positionLoeschen(positionId: string): void {
    this.aendereInhalt((i) => ({
      ...i,
      abschnitte: i.abschnitte.map((a) => ({
        ...a,
        laufzettel: a.laufzettel.map((l) => ({
          ...l,
          positionen: l.positionen.filter((p) => p.id !== positionId),
        })),
      })),
    }));
  }

  private aenderePositionen(
    laufzettelId: string,
    aenderung: (liste: VbPosition[]) => VbPosition[],
  ): void {
    this.aendereInhalt((i) => {
      let geaendert = false;
      const abschnitte = i.abschnitte.map((a) => ({
        ...a,
        laufzettel: a.laufzettel.map((l) => {
          if (l.id !== laufzettelId) return l;
          const positionen = aenderung(l.positionen);
          if (positionen === l.positionen) return l;
          geaendert = true;
          return { ...l, positionen };
        }),
      }));
      return geaendert ? { ...i, abschnitte } : i;
    });
  }
}
