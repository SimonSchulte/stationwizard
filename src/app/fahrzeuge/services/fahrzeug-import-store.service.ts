import { Injectable, computed, inject, signal } from '@angular/core';
import { Fahrzeugstamm } from '../models/fahrzeug.model';
import { ApiFahrzeugStorage } from '../storage/api-fahrzeug-storage';
import { FahrzeugKonfliktFehler, FahrzeugStorage } from '../storage/fahrzeug-storage';
import { ImportErgebnis, ImportVorschau, ImportZeile, leseFahrzeugImport } from './fahrzeug-import';
import { normalisiereKennzeichen } from './kennzeichen';

function fehlermeldung(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Der Import ist fehlgeschlagen.';
}

const LEERE_VORSCHAU: ImportVorschau = { spaltenfehler: [], hinweise: [], zeilen: [] };

/**
 * Zustand des Stammdatenimports. Legt jedes Fahrzeug einzeln über den
 * bestehenden Neuanlagepfad an (`speichereFahrzeug(fahrzeug, null)` →
 * `POST /api/fahrzeuge` mit `If-None-Match: *`); es gibt bewusst keinen
 * Masseneinfügepfad und damit keine neue API-Oberfläche.
 *
 * Der Import ist nicht transaktional: bricht er mittendrin ab, bleiben die
 * bereits angelegten Fahrzeuge stehen. Der Bericht weist Zeile für Zeile aus,
 * was tatsächlich angelegt wurde.
 */
@Injectable({ providedIn: 'root' })
export class FahrzeugImportStoreService {
  private readonly storage: FahrzeugStorage = inject(ApiFahrzeugStorage);

  readonly dateiname = signal('');
  readonly vorschau = signal<ImportVorschau>(LEERE_VORSCHAU);
  readonly liestEin = signal(false);
  readonly fehler = signal('');

  readonly laeuftGerade = signal(false);
  readonly erledigt = signal(0);
  readonly ergebnisse = signal<ImportErgebnis[]>([]);

  readonly uebernehmbar = computed(() =>
    this.vorschau().zeilen.filter((zeile) => zeile.befund === 'uebernehmen'),
  );
  readonly gesamt = computed(() => this.uebernehmbar().length);
  /**
   * Ein abgeschlossener Lauf sperrt den Knopf: sonst lädt die Seite zum
   * zweiten Klick ein, der nur noch Abweisungen produzieren könnte. Für einen
   * weiteren Versuch wird die Datei neu gewählt.
   */
  readonly bereit = computed(
    () =>
      this.vorschau().spaltenfehler.length === 0 &&
      this.gesamt() > 0 &&
      !this.laeuftGerade() &&
      this.ergebnisse().length === 0,
  );
  readonly angelegteAnzahl = computed(
    () => this.ergebnisse().filter((eintrag) => eintrag.angelegt).length,
  );

  /** Liest die gewählte Datei und bewertet sie gegen den aktuellen Bestand. */
  async dateiEinlesen(datei: File): Promise<void> {
    this.zuruecksetzen();
    this.dateiname.set(datei.name);
    this.liestEin.set(true);
    try {
      const text = await datei.text();
      this.vorschau.set(leseFahrzeugImport(text, await this.bestandskennzeichen()));
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler));
    } finally {
      this.liestEin.set(false);
    }
  }

  /**
   * Legt die übernehmbaren Zeilen nacheinander an. Vorher wird der Bestand
   * erneut gelesen und die Vorschau neu bewertet, damit zwischenzeitlich
   * angelegte Fahrzeuge nicht doch ein zweites Mal entstehen. Ein Fehler in
   * einer Zeile beendet den Lauf nicht.
   */
  async importStarten(): Promise<void> {
    if (this.laeuftGerade()) return;
    const vorschau = this.vorschau();
    if (vorschau.spaltenfehler.length > 0) return;
    this.laeuftGerade.set(true);
    this.fehler.set('');
    this.erledigt.set(0);
    this.ergebnisse.set([]);
    try {
      const vergeben = await this.bestandskennzeichen();
      const neuBewertet = this.neuBewerten(vorschau, vergeben);
      this.vorschau.set(neuBewertet);
      const ergebnisse: ImportErgebnis[] = [];
      for (const zeile of neuBewertet.zeilen) {
        if (zeile.befund !== 'uebernehmen' || zeile.fahrzeug === null) {
          ergebnisse.push(this.abgewiesen(zeile));
          continue;
        }
        ergebnisse.push(await this.anlegen(zeile, zeile.fahrzeug, vergeben));
        this.erledigt.update((anzahl) => anzahl + 1);
        this.ergebnisse.set([...ergebnisse]);
      }
      this.ergebnisse.set(ergebnisse);
    } catch (fehler) {
      this.fehler.set(fehlermeldung(fehler));
    } finally {
      this.laeuftGerade.set(false);
    }
  }

  zuruecksetzen(): void {
    this.dateiname.set('');
    this.vorschau.set(LEERE_VORSCHAU);
    this.fehler.set('');
    this.erledigt.set(0);
    this.ergebnisse.set([]);
  }

  private async anlegen(
    zeile: ImportZeile,
    fahrzeug: Fahrzeugstamm,
    vergeben: Set<string>,
  ): Promise<ImportErgebnis> {
    try {
      await this.storage.speichereFahrzeug(fahrzeug, null);
      vergeben.add(normalisiereKennzeichen(fahrzeug.kennzeichen));
      return {
        zeilennummer: zeile.zeilennummer,
        kennzeichen: zeile.kennzeichen,
        bezeichnung: zeile.bezeichnung,
        angelegt: true,
        grund: '',
      };
    } catch (fehler) {
      return {
        zeilennummer: zeile.zeilennummer,
        kennzeichen: zeile.kennzeichen,
        bezeichnung: zeile.bezeichnung,
        angelegt: false,
        grund:
          fehler instanceof FahrzeugKonfliktFehler
            ? 'Konflikt beim Anlegen – das Fahrzeug wurde nicht gespeichert.'
            : fehlermeldung(fehler),
      };
    }
  }

  private abgewiesen(zeile: ImportZeile): ImportErgebnis {
    return {
      zeilennummer: zeile.zeilennummer,
      kennzeichen: zeile.kennzeichen,
      bezeichnung: zeile.bezeichnung,
      angelegt: false,
      grund: zeile.meldungen.join(' '),
    };
  }

  /** Bewertet eine gelesene Vorschau erneut gegen einen frischen Bestand. */
  private neuBewerten(vorschau: ImportVorschau, vergeben: ReadonlySet<string>): ImportVorschau {
    const inDatei = new Set<string>();
    const zeilen = vorschau.zeilen.map((zeile) => {
      if (zeile.befund !== 'uebernehmen') return zeile;
      const normalisiert = normalisiereKennzeichen(zeile.kennzeichen);
      if (vergeben.has(normalisiert)) {
        return {
          ...zeile,
          befund: 'dublette-bestand' as const,
          fahrzeug: null,
          meldungen: [
            ...zeile.meldungen,
            'Zu diesem Kennzeichen ist bereits ein Fahrzeug angelegt.',
          ],
        };
      }
      if (inDatei.has(normalisiert)) {
        return {
          ...zeile,
          befund: 'dublette-datei' as const,
          fahrzeug: null,
          meldungen: [...zeile.meldungen, 'Dieses Kennzeichen kommt in der Datei mehrfach vor.'],
        };
      }
      inDatei.add(normalisiert);
      return zeile;
    });
    return { ...vorschau, zeilen };
  }

  private async bestandskennzeichen(): Promise<Set<string>> {
    const fahrzeuge = await this.storage.ladeFahrzeuge();
    return new Set(
      fahrzeuge
        .map((fahrzeug) => normalisiereKennzeichen(fahrzeug.kennzeichen))
        .filter((kennzeichen) => kennzeichen !== ''),
    );
  }
}
