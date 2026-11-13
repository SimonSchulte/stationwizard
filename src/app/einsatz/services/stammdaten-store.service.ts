import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Artikel,
  ArtikelEingabe,
  ArtikelEinheit,
  Kiste,
  KisteEingabe,
  Lager,
  Platz,
  STAMMDATEN_GRENZEN,
} from '../models/stammdaten.model';
import { ApiStammdatenStorage } from '../storage/api-stammdaten-storage';
import { StammdatenKonfliktFehler, StammdatenStorage } from '../storage/stammdaten-storage';
import { lagerSchluessel } from './lager';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error
    ? fehler.message
    : 'Die Stammdaten konnten nicht verarbeitet werden.';
}

function nachReihenfolge(liste: readonly Lager[]): Lager[] {
  return [...liste].sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name));
}

function nachName<T extends { name: string }>(liste: readonly T[]): T[] {
  return [...liste].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Zustand der Stammdaten Lager und Artikel. Jede Zeile wird einzeln mit ihrer eigenen Version
 * gespeichert (wie beim Preiskatalog). Doppelte Namen und Grenzen prüft der Store vorab, damit
 * kein Schreibzugriff ohne Aussicht auf Erfolg entsteht; verbindlich bleibt der Worker.
 */
@Injectable({ providedIn: 'root' })
export class StammdatenStoreService {
  private readonly storage: StammdatenStorage = inject(ApiStammdatenStorage);

  readonly lager = signal<Lager[]>([]);
  readonly artikel = signal<Artikel[]>([]);
  readonly kisten = signal<Kiste[]>([]);
  readonly laedt = signal(false);
  readonly ladeFehler = signal('');

  /** Id der Zeile, die gerade gespeichert oder gelöscht wird, sonst `null`. */
  readonly beschaeftigtId = signal<string | null>(null);
  readonly fehler = signal('');
  /** `true`, wenn der Fehler ein Versionskonflikt ist: neu laden löst ihn. */
  readonly konflikt = signal(false);

  readonly lagerNachId = computed(() => new Map(this.lager().map((l) => [l.id, l])));

  /** Zahl der Artikel je Heimatlager (Schlüssel: Lager-Id). */
  readonly artikelJeLager = computed(() => {
    const zaehlung = new Map<string, number>();
    for (const a of this.artikel()) {
      if (a.lagerId) zaehlung.set(a.lagerId, (zaehlung.get(a.lagerId) ?? 0) + 1);
    }
    return zaehlung;
  });

  readonly artikelNachId = computed(() => new Map(this.artikel().map((a) => [a.id, a])));

  /** Zahl der Kisten je Heimatlager (Schlüssel: Lager-Id). */
  readonly kistenJeLager = computed(() => {
    const zaehlung = new Map<string, number>();
    for (const k of this.kisten()) {
      if (k.lagerId) zaehlung.set(k.lagerId, (zaehlung.get(k.lagerId) ?? 0) + 1);
    }
    return zaehlung;
  });

  /** Zahl der Kisten, in denen ein Artikel steckt (Schlüssel: Artikel-Id). */
  readonly kistenJeArtikel = computed(() => {
    const zaehlung = new Map<string, number>();
    for (const k of this.kisten()) {
      for (const p of k.inhalt) zaehlung.set(p.artikelId, (zaehlung.get(p.artikelId) ?? 0) + 1);
    }
    return zaehlung;
  });

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.ladeFehler.set('');
    try {
      const [lager, artikel, kisten] = await Promise.all([
        this.storage.ladeLager(),
        this.storage.ladeArtikel(),
        this.storage.ladeKisten(),
      ]);
      this.lager.set(nachReihenfolge(lager));
      this.artikel.set(nachName(artikel));
      this.kisten.set(nachName(kisten));
    } catch (fehler) {
      this.ladeFehler.set(fehlermeldung(fehler));
    } finally {
      this.laedt.set(false);
    }
  }

  async lagerAnlegen(name: string): Promise<boolean> {
    const bereinigt = name.trim().replace(/\s+/g, ' ');
    if (bereinigt === '') return false;
    if (this.lager().length >= STAMMDATEN_GRENZEN.lager) {
      return this.abgelehnt(`Es sind höchstens ${STAMMDATEN_GRENZEN.lager} Lager möglich.`);
    }
    if (this.lagerNameVergeben(bereinigt, null))
      return this.abgelehnt('Dieses Lager gibt es schon.');
    return this.ausfuehren(null, async () => {
      const neu = await this.storage.speichereLager(
        { id: crypto.randomUUID(), name: bereinigt, plaetze: [] },
        null,
      );
      this.lager.update((liste) => nachReihenfolge([...liste, neu]));
    });
  }

  async lagerUmbenennen(lager: Lager, name: string): Promise<boolean> {
    const bereinigt = name.trim().replace(/\s+/g, ' ');
    if (bereinigt === '' || bereinigt === lager.name) return false;
    if (this.lagerNameVergeben(bereinigt, lager.id)) {
      return this.abgelehnt('Dieses Lager gibt es schon.');
    }
    return this.ausfuehren(lager.id, async () => {
      const neu = await this.storage.speichereLager(
        { id: lager.id, name: bereinigt, plaetze: lager.plaetze },
        lager.version,
      );
      this.lager.update((liste) => nachReihenfolge(liste.map((l) => (l.id === neu.id ? neu : l))));
    });
  }

  /** Zahl der Artikel und Kisten je Platz (Schlüssel: Platz-Id); der Aufbau zählt hier nicht mit. */
  readonly verwendungJePlatz = computed(() => {
    const zaehlung = new Map<string, number>();
    for (const eintrag of [...this.artikel(), ...this.kisten()]) {
      if (eintrag.platzId) zaehlung.set(eintrag.platzId, (zaehlung.get(eintrag.platzId) ?? 0) + 1);
    }
    return zaehlung;
  });

  /** Speichert die Plätze eines Lagers in einem Schreibvorgang (mit dem Lager, `If-Match`). */
  async lagerPlaetzeSpeichern(lager: Lager, plaetze: readonly Platz[]): Promise<boolean> {
    const bereinigt = plaetze.map((p) => ({ id: p.id, name: p.name.trim().replace(/\s+/g, ' ') }));
    if (bereinigt.some((p) => p.name === ''))
      return this.abgelehnt('Ein Platz braucht einen Namen.');
    if (bereinigt.length > STAMMDATEN_GRENZEN.plaetze) {
      return this.abgelehnt(
        `Es sind höchstens ${STAMMDATEN_GRENZEN.plaetze} Plätze je Lager möglich.`,
      );
    }
    const schluessel = bereinigt.map((p) => lagerSchluessel(p.name));
    if (new Set(schluessel).size !== schluessel.length) {
      return this.abgelehnt('Diesen Platz gibt es in diesem Lager schon.');
    }
    const bleiben = new Set(bereinigt.map((p) => p.id));
    const belegt = lager.plaetze.find(
      (p) => !bleiben.has(p.id) && (this.verwendungJePlatz().get(p.id) ?? 0) > 0,
    );
    if (belegt) {
      return this.abgelehnt(
        `Der Platz „${belegt.name}“ wird noch von Artikeln oder Kisten verwendet.`,
      );
    }
    return this.ausfuehren(lager.id, async () => {
      const neu = await this.storage.speichereLager(
        { id: lager.id, name: lager.name, plaetze: bereinigt },
        lager.version,
      );
      this.lager.update((liste) => nachReihenfolge(liste.map((l) => (l.id === neu.id ? neu : l))));
    });
  }

  /**
   * Stellt ein Lager samt Plätzen sicher (für die Packlisten-Übernahme): fehlende Lager und Plätze werden
   * angelegt, vorhandene bleiben unberührt (Vergleich ohne Groß-/Kleinschreibung). Liefert das Lager im
   * aktuellen Stand, bei Ablehnung oder Fehler `null`.
   */
  async lagerMitPlaetzenSicherstellen(
    name: string,
    platzNamen: readonly string[],
  ): Promise<Lager | null> {
    const finde = () => this.lager().find((l) => lagerSchluessel(l.name) === lagerSchluessel(name));
    if (!finde() && !(await this.lagerAnlegen(name))) return null;
    let lager = finde();
    if (!lager) return null;
    const vorhanden = new Set(lager.plaetze.map((p) => lagerSchluessel(p.name)));
    const neu = platzNamen
      .map((n) => n.trim().replace(/\s+/g, ' '))
      .filter(
        (n, i, alle) =>
          n !== '' && alle.findIndex((x) => lagerSchluessel(x) === lagerSchluessel(n)) === i,
      )
      .filter((n) => !vorhanden.has(lagerSchluessel(n)))
      .map((n) => ({ id: crypto.randomUUID(), name: n }));
    if (neu.length > 0) {
      if (!(await this.lagerPlaetzeSpeichern(lager, [...lager.plaetze, ...neu]))) return null;
      lager = finde();
    }
    return lager ?? null;
  }

  async lagerLoeschen(lager: Lager): Promise<boolean> {
    if (
      (this.artikelJeLager().get(lager.id) ?? 0) > 0 ||
      (this.kistenJeLager().get(lager.id) ?? 0) > 0
    ) {
      return this.abgelehnt('Dieses Lager ist noch Heimatlager von Artikeln oder Kisten.');
    }
    return this.ausfuehren(lager.id, async () => {
      await this.storage.loescheLager(lager.id, lager.version);
      this.lager.update((liste) => liste.filter((l) => l.id !== lager.id));
    });
  }

  /** Verschiebt ein Lager von `von` nach `nach` (Indizes der angezeigten Liste). */
  async lagerVerschieben(von: number, nach: number): Promise<boolean> {
    const liste = [...this.lager()];
    if (von === nach || von < 0 || nach < 0 || von >= liste.length || nach >= liste.length) {
      return false;
    }
    const [bewegt] = liste.splice(von, 1);
    liste.splice(nach, 0, bewegt);
    const vorher = this.lager();
    // Sofort sichtbar; schlägt das Speichern fehl, kommt der alte Stand zurück.
    this.lager.set(liste.map((l, index) => ({ ...l, reihenfolge: index + 1 })));
    const erfolg = await this.ausfuehren(null, async () => {
      const neu = await this.storage.setzeLagerReihenfolge(liste.map((l) => l.id));
      this.lager.set(nachReihenfolge(neu));
    });
    if (!erfolg) this.lager.set(vorher);
    return erfolg;
  }

  /** Legt einen Artikel an; mit `id` bleibt die Kennung dem Aufrufer bekannt (etwa zum Verknüpfen). */
  async artikelAnlegen(eingabe: Omit<ArtikelEingabe, 'id'> & { id?: string }): Promise<boolean> {
    const name = eingabe.name.trim().replace(/\s+/g, ' ');
    if (name === '') return false;
    if (this.artikel().length >= STAMMDATEN_GRENZEN.artikel) {
      return this.abgelehnt(`Es sind höchstens ${STAMMDATEN_GRENZEN.artikel} Artikel möglich.`);
    }
    if (this.artikelNameVergeben(name, null))
      return this.abgelehnt('Diesen Artikel gibt es schon.');
    return this.ausfuehren(null, async () => {
      const neu = await this.storage.speichereArtikel(
        { ...eingabe, name, id: eingabe.id ?? crypto.randomUUID() },
        null,
      );
      this.artikel.update((liste) => nachName([...liste, neu]));
    });
  }

  async artikelAendern(
    artikel: Artikel,
    aenderung: Partial<{
      name: string;
      einheit: ArtikelEinheit;
      lagerId: string | null;
      platzId: string | null;
    }>,
  ): Promise<boolean> {
    const name = (aenderung.name ?? artikel.name).trim().replace(/\s+/g, ' ');
    const einheit = aenderung.einheit ?? artikel.einheit;
    const lagerId = aenderung.lagerId === undefined ? artikel.lagerId : aenderung.lagerId;
    // Ein Platz gehört zu seinem Lager: mit dem Lager wechselt oder entfällt er.
    const platzId =
      aenderung.platzId !== undefined
        ? aenderung.platzId
        : lagerId === artikel.lagerId
          ? (artikel.platzId ?? null)
          : null;
    if (
      name === '' ||
      (name === artikel.name &&
        einheit === artikel.einheit &&
        lagerId === artikel.lagerId &&
        platzId === (artikel.platzId ?? null))
    ) {
      return false;
    }
    if (this.artikelNameVergeben(name, artikel.id)) {
      return this.abgelehnt('Diesen Artikel gibt es schon.');
    }
    return this.ausfuehren(artikel.id, async () => {
      const neu = await this.storage.speichereArtikel(
        { id: artikel.id, name, einheit, lagerId, platzId },
        artikel.version,
      );
      this.artikel.update((liste) => nachName(liste.map((a) => (a.id === neu.id ? neu : a))));
    });
  }

  async artikelLoeschen(artikel: Artikel): Promise<boolean> {
    if ((this.kistenJeArtikel().get(artikel.id) ?? 0) > 0) {
      return this.abgelehnt('Dieser Artikel ist noch in einer Kiste enthalten.');
    }
    return this.ausfuehren(artikel.id, async () => {
      await this.storage.loescheArtikel(artikel.id, artikel.version);
      this.artikel.update((liste) => liste.filter((a) => a.id !== artikel.id));
    });
  }

  /** Legt eine leere Kiste an und liefert sie zurück (`null` bei Ablehnung oder Fehler). */
  async kisteAnlegen(name: string): Promise<Kiste | null> {
    const bereinigt = name.trim().replace(/\s+/g, ' ');
    if (bereinigt === '') return null;
    if (this.kisten().length >= STAMMDATEN_GRENZEN.kisten) {
      this.abgelehnt(`Es sind höchstens ${STAMMDATEN_GRENZEN.kisten} Kisten möglich.`);
      return null;
    }
    if (this.kisteNameVergeben(bereinigt, null)) {
      this.abgelehnt('Diese Kiste gibt es schon.');
      return null;
    }
    let angelegt: Kiste | null = null;
    await this.ausfuehren(null, async () => {
      const neu = await this.storage.speichereKiste(
        { id: crypto.randomUUID(), name: bereinigt, lagerId: null, platzId: null, inhalt: [] },
        null,
      );
      this.kisten.update((liste) => nachName([...liste, neu]));
      angelegt = neu;
    });
    return angelegt;
  }

  /** Speichert Name, Heimatlager und Inhalt der Kiste in einem Schreibvorgang. */
  async kisteSpeichern(
    kiste: Kiste,
    aenderung: Pick<KisteEingabe, 'name' | 'lagerId' | 'platzId' | 'inhalt'>,
  ): Promise<Kiste | null> {
    const name = aenderung.name.trim().replace(/\s+/g, ' ');
    if (name === '') {
      this.abgelehnt('Die Kiste braucht einen Namen.');
      return null;
    }
    if (this.kisteNameVergeben(name, kiste.id)) {
      this.abgelehnt('Diese Kiste gibt es schon.');
      return null;
    }
    let gespeichert: Kiste | null = null;
    await this.ausfuehren(kiste.id, async () => {
      const neu = await this.storage.speichereKiste(
        {
          id: kiste.id,
          name,
          lagerId: aenderung.lagerId,
          platzId: aenderung.platzId ?? null,
          inhalt: aenderung.inhalt,
        },
        kiste.version,
      );
      this.kisten.update((liste) => nachName(liste.map((k) => (k.id === neu.id ? neu : k))));
      gespeichert = neu;
    });
    return gespeichert;
  }

  async kisteLoeschen(kiste: Kiste): Promise<boolean> {
    return this.ausfuehren(kiste.id, async () => {
      await this.storage.loescheKiste(kiste.id, kiste.version);
      this.kisten.update((liste) => liste.filter((k) => k.id !== kiste.id));
    });
  }

  private kisteNameVergeben(name: string, ausser: string | null): boolean {
    const schluessel = lagerSchluessel(name);
    return this.kisten().some((k) => k.id !== ausser && lagerSchluessel(k.name) === schluessel);
  }

  private lagerNameVergeben(name: string, ausser: string | null): boolean {
    const schluessel = lagerSchluessel(name);
    return this.lager().some((l) => l.id !== ausser && lagerSchluessel(l.name) === schluessel);
  }

  /** Der Katalogartikel mit diesem Namen (ohne Groß-/Kleinschreibung und überzählige Leerzeichen). */
  artikelFinden(name: string): Artikel | undefined {
    const schluessel = lagerSchluessel(name);
    return this.artikel().find((a) => lagerSchluessel(a.name) === schluessel);
  }

  private artikelNameVergeben(name: string, ausser: string | null): boolean {
    const schluessel = lagerSchluessel(name);
    return this.artikel().some((a) => a.id !== ausser && lagerSchluessel(a.name) === schluessel);
  }

  private abgelehnt(meldung: string): false {
    this.fehler.set(meldung);
    this.konflikt.set(false);
    return false;
  }

  private async ausfuehren(id: string | null, vorgang: () => Promise<void>): Promise<boolean> {
    this.beschaeftigtId.set(id);
    this.fehler.set('');
    this.konflikt.set(false);
    try {
      await vorgang();
      return true;
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler));
      this.konflikt.set(fehler instanceof StammdatenKonfliktFehler);
      return false;
    } finally {
      this.beschaeftigtId.set(null);
    }
  }
}
