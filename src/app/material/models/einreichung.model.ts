import { Checkposition } from './check.model';

/**
 * Eine öffentlich eingereichte Prüfung, die noch nicht freigegeben ist.
 *
 * Sie ist kein Check: erst die Freigabe durch eine geprüfte Identität macht
 * daraus einen. Bis dahin taucht sie in keiner Kennzahl auf.
 */
export interface CheckEinreichung {
  id: string;
  behaelterId: string;
  behaelterBezeichnung: string;
  fahrzeugBezeichnung: string;
  vorlageBezeichnung: string;
  geprueftAm: string;
  eingereichtAm: string;
  /** Ungeprüfte Selbstauskunft der meldenden Person. */
  eingereichtVonName: string;
  verfallsdatumErfasst: boolean;
  bemerkung: string;
  positionenGesamt: number;
  positionenGeprueft: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
}

/** Vollständige Einreichung für die Durchsicht vor der Freigabe. */
export interface CheckEinreichungDetail extends CheckEinreichung {
  grundlage: string;
  positionen: Checkposition[];
}

export type FreigabeErgebnis = 'freigegeben' | 'nicht-gefunden' | 'nicht-offen' | 'nicht-erlaubt';

export const FREIGABE_ERGEBNIS_TEXT: Readonly<Record<FreigabeErgebnis, string>> = {
  freigegeben: 'freigegeben',
  'nicht-gefunden': 'nicht mehr vorhanden',
  'nicht-offen': 'zwischenzeitlich bereits entschieden',
  'nicht-erlaubt': 'dafür fehlt die Berechtigung',
};

export interface FreigabeAntwort {
  id: string;
  status: FreigabeErgebnis;
  checkId?: string;
}
