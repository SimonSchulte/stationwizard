import { PreiskatalogArt } from './preiskatalog.model';

/**
 * Domänenmodell der Angebote. Kennt ausschließlich eigene Typen – kein
 * Datenbank-, ETag- oder HTTP-Bezug, analog zu `fahrzeuge/models/fahrzeug.model.ts`.
 */

export interface Position {
  id: string;
  /** Ursprungseintrag im Preiskatalog, rein zur Nachverfolgung/Anzeige – keine Fremdschlüsselbindung. */
  herkunftEintragId: string | null;
  art: PreiskatalogArt;
  /** Eigene, editierbare Momentaufnahme – Änderungen hier wirken nie auf den Preiskatalog zurück. */
  bezeichnung: string;
  einzelpreisCent: number;
  anzahl: number;
  /** Nur bei art 'einsatzkraft' gesetzt; bei 'fahrzeug' immer null. */
  stunden: number | null;
}

export interface Schicht {
  id: string;
  /** ISO-Kalendertag (`YYYY-MM-DD`); eine Schicht ist immer eintägig. */
  datum: string;
  /** `HH:MM`, lokal (Europe/Berlin, kein UTC-Umweg). */
  von: string;
  /** `HH:MM`; muss > `von` sein – ein Dienst über Mitternacht wird als zwei Schichten erfasst. */
  bis: string;
  positionen: Position[];
}

export interface Angebot {
  id: string;
  bezeichnung: string;
  auftraggeber: string;
  bemerkung: string;
  schichten: Schicht[];
  pauschalpreisAktiv: boolean;
  /** Nur gültig/relevant, wenn `pauschalpreisAktiv === true`. */
  pauschalpreisCent: number | null;
  geaendertAm: string;
  geaendertVon: string;
}
