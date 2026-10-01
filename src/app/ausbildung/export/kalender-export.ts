import { Jahresblatt, Termin } from '../models/plan.model';

/**
 * Vorbereitete Exportschnittstelle des Kalenders – **nur der Vertrag, noch keine
 * Implementierung**. Hier docken künftige Formate an, ohne dass Kalenderseite
 * oder Datenhaltung sich ändern müssen.
 *
 * Ein Format bekommt einen bereits aus der Datenbank geladenen, geprüften
 * Ausschnitt (`KalenderExportDaten`) und erzeugt daraus eine Datei. Es ruft
 * selbst keine API auf, schreibt nichts zurück und kennt keine Zugangsdaten;
 * der Download läuft über `dateiHerunterladen()` aus `kern/storage`.
 *
 * Denkbare Formate (offen, siehe docs/arbeitsstand.md): iCalendar (`.ics`) für
 * Kalender-Apps, CSV für Tabellen, ein Übertrag nach HiOrg-Server (erst nach
 * Nachweis gegen die echte API) und die bestehende Excel-Arbeitsmappe, die
 * heute noch direkt über `excel-schreiben.ts` als Rettungskopie entsteht.
 */
export interface KalenderExportDaten {
  /** Die einbezogenen Jahre, aufsteigend. */
  jahre: readonly Jahresblatt[];
  /** Offene Ideen (Termine ohne Datum), jahresübergreifend. */
  ideen: readonly Termin[];
  /** Optionaler Ausschnitt als lokale Kalendertage `YYYY-MM-DD` (einschließlich). */
  zeitraum: { von: string; bis: string } | null;
}

export interface KalenderExportDatei {
  daten: Blob;
  dateiname: string;
}

export interface KalenderExportFormat {
  /** Stabile Kennung, etwa `ical` oder `csv`. */
  readonly id: string;
  /** Deutsche Bezeichnung für ein späteres Exportmenü. */
  readonly bezeichnung: string;
  readonly medientyp: string;
  /** Dateiendung ohne Punkt. */
  readonly dateiendung: string;
  erzeuge(daten: KalenderExportDaten): Promise<KalenderExportDatei>;
}

/**
 * Registrierte Formate. Bewusst leer: solange hier nichts steht, zeigt die
 * Oberfläche kein Exportmenü an.
 */
export const KALENDER_EXPORTFORMATE: readonly KalenderExportFormat[] = [];
