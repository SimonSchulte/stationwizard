import {
  AblesungEingabe,
  Aenderungseintrag,
  Eigentuemer,
  Fahrzeugstamm,
  Kilometerstand,
  Wartungstermin,
} from '../models/fahrzeug.model';
import { EIGENTUEMER_LABEL } from '../services/eigentuemer-label';
import {
  AblesungHatKorrekturFehler,
  FahrzeugKonfliktFehler,
  FahrzeugMitVersion,
  FahrzeugStorage,
} from '../storage/fahrzeug-storage';

let laufendeId = 0;
function naechsteId(praefix: string): string {
  laufendeId += 1;
  return `${praefix}-${laufendeId}`;
}

const STAMMDATEN_FELDER: readonly {
  schluessel: 'bezeichnung' | 'funkrufname' | 'kennzeichen' | 'fahrgestellnummer' | 'eigentuemer';
  label: string;
}[] = [
  { schluessel: 'bezeichnung', label: 'Bezeichnung' },
  { schluessel: 'funkrufname', label: 'Funkrufname' },
  { schluessel: 'kennzeichen', label: 'Kennzeichen' },
  { schluessel: 'fahrgestellnummer', label: 'Fahrgestellnummer' },
  { schluessel: 'eigentuemer', label: 'Eigentümer' },
];

function feldAnzeige(wert: string | null, eigentuemer: boolean): string {
  if (wert === null || wert === '') return '(leer)';
  return eigentuemer ? EIGENTUEMER_LABEL[wert as Eigentuemer] : wert;
}

/** Vereinfachtes Gegenstück zum serverseitigen Diff (`worker/src/fahrzeuge.ts`, `diffFahrzeug`). */
function diffFahrzeug(alt: Fahrzeugstamm, neu: Fahrzeugstamm): string[] {
  const zeilen: string[] = [];
  for (const { schluessel, label } of STAMMDATEN_FELDER) {
    if (alt[schluessel] !== neu[schluessel]) {
      zeilen.push(
        `${label} geändert: ${feldAnzeige(alt[schluessel], schluessel === 'eigentuemer')} → ${feldAnzeige(neu[schluessel], schluessel === 'eigentuemer')}`,
      );
    }
  }
  if (alt.bemerkung !== neu.bemerkung) {
    zeilen.push('Bemerkung geändert');
  }
  const altIds = new Set(alt.wartungstermine.map((t) => t.id));
  const neuIds = new Set(neu.wartungstermine.map((t) => t.id));
  for (const termin of neu.wartungstermine) {
    if (!altIds.has(termin.id)) zeilen.push(`Wartungstermin „${termin.bezeichnung}" hinzugefügt`);
  }
  for (const termin of alt.wartungstermine) {
    if (!neuIds.has(termin.id)) zeilen.push(`Wartungstermin „${termin.bezeichnung}" entfernt`);
  }
  for (const neuerTermin of neu.wartungstermine) {
    const alterTermin = alt.wartungstermine.find((t) => t.id === neuerTermin.id);
    if (alterTermin && !terminGleich(alterTermin, neuerTermin)) {
      zeilen.push(`Wartungstermin „${neuerTermin.bezeichnung}" geändert`);
    }
  }
  return zeilen;
}

function terminGleich(a: Wartungstermin, b: Wartungstermin): boolean {
  return (
    a.bezeichnung === b.bezeichnung &&
    a.faelligAm === b.faelligAm &&
    a.erinnerungTage === b.erinnerungTage &&
    a.erledigtAm === b.erledigtAm
  );
}

/**
 * Referenzadapter für Tests. Bildet dieselben Regeln nach wie ein echtes
 * Backend (Versionsprüfung, serverseitige Identität), damit Fachtests
 * unabhängig von der späteren Backendentscheidung bleiben.
 */
export class InMemoryFahrzeugStorage implements FahrzeugStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';

  private readonly fahrzeuge = new Map<string, { daten: Fahrzeugstamm; version: string }>();
  private readonly ablesungen = new Map<string, Kilometerstand[]>();
  private readonly aenderungen = new Map<string, Aenderungseintrag[]>();

  constructor(private readonly jetzigeIdentitaet = () => 'test@example.invalid') {}

  private protokolliere(fahrzeugId: string, beschreibung: string): void {
    const liste = this.aenderungen.get(fahrzeugId) ?? [];
    liste.unshift({
      id: naechsteId('aenderung'),
      fahrzeugId,
      zeitpunkt: new Date().toISOString(),
      von: this.jetzigeIdentitaet(),
      beschreibung,
    });
    this.aenderungen.set(fahrzeugId, liste);
  }

  async ladeFahrzeuge(): Promise<Fahrzeugstamm[]> {
    return [...this.fahrzeuge.values()].map((eintrag) => ({ ...eintrag.daten }));
  }

  async ladeFahrzeug(id: string): Promise<FahrzeugMitVersion | null> {
    const eintrag = this.fahrzeuge.get(id);
    return eintrag ? { daten: { ...eintrag.daten }, version: eintrag.version } : null;
  }

  async speichereFahrzeug(fahrzeug: Fahrzeugstamm, version: string | null): Promise<string> {
    const bestehend = this.fahrzeuge.get(fahrzeug.id);
    if (version === null) {
      if (bestehend) {
        throw new FahrzeugKonfliktFehler(fahrzeug.id);
      }
    } else if (!bestehend || bestehend.version !== version) {
      throw new FahrzeugKonfliktFehler(fahrzeug.id);
    }
    const neueVersion = naechsteId('version');
    this.fahrzeuge.set(fahrzeug.id, { daten: { ...fahrzeug }, version: neueVersion });
    if (!bestehend) {
      this.protokolliere(fahrzeug.id, 'Fahrzeug angelegt');
    } else {
      const aenderungen = diffFahrzeug(bestehend.daten, fahrzeug);
      if (aenderungen.length > 0) {
        this.protokolliere(fahrzeug.id, aenderungen.join('\n'));
      }
    }
    return neueVersion;
  }

  async ladeAblesungen(fahrzeugId: string, vonJahr?: number): Promise<Kilometerstand[]> {
    const alle = this.ablesungen.get(fahrzeugId) ?? [];
    const gefiltert =
      vonJahr === undefined
        ? alle
        : alle.filter((a) => Number(a.abgelesenAm.slice(0, 4)) >= vonJahr);
    return gefiltert.map((a) => ({ ...a }));
  }

  async ergaenzeAblesung(eingabe: AblesungEingabe): Promise<Kilometerstand> {
    const ablesung: Kilometerstand = {
      id: naechsteId('ablesung'),
      fahrzeugId: eingabe.fahrzeugId,
      abgelesenAm: eingabe.abgelesenAm,
      stand: eingabe.stand,
      erfasstAm: new Date().toISOString(),
      erfasstVon: this.jetzigeIdentitaet(),
      quelle: eingabe.quelle,
      korrigiert: eingabe.korrigiert,
      bemerkung: eingabe.bemerkung,
    };
    const liste = this.ablesungen.get(eingabe.fahrzeugId) ?? [];
    liste.push(ablesung);
    this.ablesungen.set(eingabe.fahrzeugId, liste);
    this.protokolliere(
      eingabe.fahrzeugId,
      eingabe.korrigiert !== null
        ? `Kilometerstand korrigiert: ${eingabe.stand} km am ${eingabe.abgelesenAm}`
        : `Kilometerstand erfasst: ${eingabe.stand} km am ${eingabe.abgelesenAm}`,
    );
    return { ...ablesung };
  }

  async loescheAblesung(fahrzeugId: string, ablesungId: string): Promise<void> {
    const liste = this.ablesungen.get(fahrzeugId) ?? [];
    if (liste.some((a) => a.korrigiert === ablesungId)) {
      throw new AblesungHatKorrekturFehler(ablesungId);
    }
    const geloescht = liste.find((a) => a.id === ablesungId);
    this.ablesungen.set(
      fahrzeugId,
      liste.filter((a) => a.id !== ablesungId),
    );
    if (geloescht) {
      this.protokolliere(
        fahrzeugId,
        `Kilometerstand gelöscht: ${geloescht.stand} km vom ${geloescht.abgelesenAm}`,
      );
    }
  }

  async ladeAenderungen(fahrzeugId: string): Promise<Aenderungseintrag[]> {
    return (this.aenderungen.get(fahrzeugId) ?? []).map((eintrag) => ({ ...eintrag }));
  }

  /** Nur für Tests: Ablesungen direkt vorbelegen, ohne den Identitätsweg zu durchlaufen. */
  _vorbelegenAblesungen(fahrzeugId: string, ablesungen: Kilometerstand[]): void {
    this.ablesungen.set(fahrzeugId, [...ablesungen]);
  }
}
