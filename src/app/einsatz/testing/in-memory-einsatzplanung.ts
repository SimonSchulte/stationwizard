import { Einsatz, EinsatzListenEintrag, VbKennzahlen } from '../models/einsatz.model';
import { VbInhalt, VbVorlage, VbVorlageKopf, Vorbereitung } from '../models/vb.model';
import { EinsatzStorage } from '../storage/einsatz-storage';
import {
  EinsatzplanungBereitsVorhandenFehler,
  EinsatzplanungKonfliktFehler,
} from '../storage/einsatzplanung-fehler';
import { MitVersion } from '../storage/mit-version';
import { VbVorlagenStorage } from '../storage/vb-vorlagen-storage';
import { VorbereitungStorage } from '../storage/vorbereitung-storage';

/**
 * Referenzadapter für Tests: bilden die Versions- und Eindeutigkeitsregeln des Workers nach
 * (`If-Match`, `If-None-Match: *`, 404 → `null`, 409, 412). Versionen sind ETags der Form
 * `"<n>"`, damit `versionAlsZahl()` darauf arbeitet.
 */
interface Eintrag<T> {
  daten: T;
  version: number;
}

function etag(version: number): string {
  return `"${version}"`;
}

function istAktuell(eintrag: Eintrag<unknown> | undefined, version: string): boolean {
  return eintrag !== undefined && etag(eintrag.version) === version.replace(/^W\//, '');
}

export function kennzahlenVon(inhalt: VbInhalt): VbKennzahlen {
  const laufzettel = inhalt.abschnitte.flatMap((a) => a.laufzettel);
  return {
    laufzettel: laufzettel.length,
    positionen: laufzettel.reduce((summe, l) => summe + l.positionen.length, 0),
  };
}

export class InMemoryVorbereitungStorage implements VorbereitungStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';
  private readonly eintraege = new Map<string, Eintrag<Vorbereitung>>();

  async ladeVorbereitung(einsatzId: string): Promise<MitVersion<Vorbereitung> | null> {
    const eintrag = this.eintraege.get(einsatzId);
    return eintrag
      ? { daten: structuredClone(eintrag.daten), version: etag(eintrag.version) }
      : null;
  }

  async legeVorbereitungAn(einsatzId: string, vorbereitung: Vorbereitung): Promise<string> {
    if (this.eintraege.has(einsatzId)) throw new EinsatzplanungBereitsVorhandenFehler(null);
    this.eintraege.set(einsatzId, { daten: structuredClone(vorbereitung), version: 1 });
    return etag(1);
  }

  async speichereVorbereitung(
    einsatzId: string,
    vorbereitung: Vorbereitung,
    version: string,
  ): Promise<string> {
    const eintrag = this.eintraege.get(einsatzId);
    if (!eintrag || !istAktuell(eintrag, version)) {
      throw new EinsatzplanungKonfliktFehler('Die Vorbereitung');
    }
    eintrag.daten = structuredClone(vorbereitung);
    eintrag.version += 1;
    return etag(eintrag.version);
  }

  async loescheVorbereitung(einsatzId: string, version: string): Promise<void> {
    if (!istAktuell(this.eintraege.get(einsatzId), version)) {
      throw new EinsatzplanungKonfliktFehler('Die Vorbereitung');
    }
    this.eintraege.delete(einsatzId);
  }

  /** Nur für Tests und `InMemoryEinsatzStorage`. */
  kennzahlen(einsatzId: string): VbKennzahlen | null {
    const eintrag = this.eintraege.get(einsatzId);
    return eintrag ? kennzahlenVon(eintrag.daten.inhalt) : null;
  }

  /** Nur für Tests: direkt vorbelegen. */
  _vorbelegen(einsatzId: string, vorbereitung: Vorbereitung): string {
    this.eintraege.set(einsatzId, { daten: structuredClone(vorbereitung), version: 1 });
    return etag(1);
  }
}

export class InMemoryEinsatzStorage implements EinsatzStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';
  private readonly eintraege = new Map<string, Eintrag<Einsatz>>();

  constructor(private readonly vorbereitungen?: InMemoryVorbereitungStorage) {}

  async ladeEinsaetze(): Promise<EinsatzListenEintrag[]> {
    return [...this.eintraege.values()].map((eintrag) => ({
      ...structuredClone(eintrag.daten),
      version: eintrag.version,
      vb: this.vorbereitungen?.kennzahlen(eintrag.daten.id) ?? null,
    }));
  }

  async ladeEinsatz(id: string): Promise<MitVersion<Einsatz> | null> {
    const eintrag = this.eintraege.get(id);
    return eintrag
      ? { daten: structuredClone(eintrag.daten), version: etag(eintrag.version) }
      : null;
  }

  async legeEinsatzAn(einsatz: Einsatz): Promise<string> {
    if (this.eintraege.has(einsatz.id)) throw new EinsatzplanungBereitsVorhandenFehler(null);
    this.pruefeVeranstaltung(einsatz);
    this.eintraege.set(einsatz.id, { daten: structuredClone(einsatz), version: 1 });
    return etag(1);
  }

  async speichereEinsatz(einsatz: Einsatz, version: string): Promise<string> {
    const eintrag = this.eintraege.get(einsatz.id);
    if (!eintrag || !istAktuell(eintrag, version)) {
      throw new EinsatzplanungKonfliktFehler('Der Einsatz');
    }
    this.pruefeVeranstaltung(einsatz);
    eintrag.daten = structuredClone(einsatz);
    eintrag.version += 1;
    return etag(eintrag.version);
  }

  private pruefeVeranstaltung(einsatz: Einsatz): void {
    if (einsatz.hiorgVeranstaltungId === null) return;
    const vergeben = [...this.eintraege.values()].some(
      (e) =>
        e.daten.id !== einsatz.id && e.daten.hiorgVeranstaltungId === einsatz.hiorgVeranstaltungId,
    );
    if (vergeben) {
      throw new EinsatzplanungBereitsVorhandenFehler('EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN');
    }
  }

  /** Nur für Tests: direkt vorbelegen. */
  _vorbelegen(einsatz: Einsatz): string {
    this.eintraege.set(einsatz.id, { daten: structuredClone(einsatz), version: 1 });
    return etag(1);
  }
}

export class InMemoryVbVorlagenStorage implements VbVorlagenStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';
  private readonly eintraege = new Map<string, Eintrag<VbVorlage> & { geaendertAm: string }>();

  async ladeVorlagen(): Promise<VbVorlageKopf[]> {
    return [...this.eintraege.values()].map((e) => ({
      id: e.daten.id,
      titel: e.daten.titel,
      version: e.version,
      abschnitte: e.daten.inhalt.abschnitte.length,
      ...kennzahlenVon(e.daten.inhalt),
      geaendertAm: e.geaendertAm,
    }));
  }

  async ladeVorlage(id: string): Promise<MitVersion<VbVorlage> | null> {
    const eintrag = this.eintraege.get(id);
    return eintrag
      ? { daten: structuredClone(eintrag.daten), version: etag(eintrag.version) }
      : null;
  }

  async legeVorlageAn(vorlage: VbVorlage): Promise<string> {
    if (this.eintraege.has(vorlage.id)) throw new EinsatzplanungBereitsVorhandenFehler(null);
    this.eintraege.set(vorlage.id, {
      daten: structuredClone(vorlage),
      version: 1,
      geaendertAm: new Date().toISOString(),
    });
    return etag(1);
  }

  async speichereVorlage(vorlage: VbVorlage, version: string): Promise<string> {
    const eintrag = this.eintraege.get(vorlage.id);
    if (!eintrag || !istAktuell(eintrag, version)) {
      throw new EinsatzplanungKonfliktFehler('Die Vorlage');
    }
    eintrag.daten = structuredClone(vorlage);
    eintrag.version += 1;
    eintrag.geaendertAm = new Date().toISOString();
    return etag(eintrag.version);
  }

  async loescheVorlage(id: string, version: string): Promise<void> {
    if (!istAktuell(this.eintraege.get(id), version)) {
      throw new EinsatzplanungKonfliktFehler('Die Vorlage');
    }
    this.eintraege.delete(id);
  }

  /** Nur für Tests: direkt vorbelegen; Version 1. */
  _vorbelegen(vorlage: VbVorlage): string {
    this.eintraege.set(vorlage.id, {
      daten: structuredClone(vorlage),
      version: 1,
      geaendertAm: new Date().toISOString(),
    });
    return etag(1);
  }
}
