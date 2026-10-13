import type { Benutzer } from './anmeldung';
import {
  verarbeiteDateiVorlage,
  type DateiVorlageKonfiguration,
  type VorlagenArt,
} from './datei-vorlage';

/**
 * PDF-Formular „Antrag auf Verleihung einer Auszeichnung“ (Seite „Offene Ehrungen“): im
 * Verwaltungsbereich hinterlegt, im Browser mit den Daten des Ehrungsmanagers gefüllt
 * (`personal/services/ehrungsantrag-pdf.ts`). Der Worker verwahrt die Datei nur; Ablage gemeinsam
 * mit der Führerschein-Vorlage in `datei-vorlage.ts`, Migration 0018.
 */
export type EhrungsantragVorlageKonfiguration = DateiVorlageKonfiguration;

export const EHRUNGSANTRAG_VORLAGE_PFAD = '/api/personal/ehrungsantrag-vorlage';
export const EHRUNGSANTRAG_VORLAGE_DATEI_PFAD = '/api/personal/ehrungsantrag-vorlage/datei';

/** `%PDF-` am Dateianfang. */
export function istPdf(inhalt: Uint8Array): boolean {
  return (
    inhalt.length >= 5 &&
    inhalt[0] === 0x25 &&
    inhalt[1] === 0x50 &&
    inhalt[2] === 0x44 &&
    inhalt[3] === 0x46 &&
    inhalt[4] === 0x2d
  );
}

const EHRUNGSANTRAG_VORLAGE: VorlagenArt = {
  tabelle: 'ehrungsantrag_vorlage',
  id: 'ehrungsantrag',
  pfad: EHRUNGSANTRAG_VORLAGE_PFAD,
  dateiPfad: EHRUNGSANTRAG_VORLAGE_DATEI_PFAD,
  inhaltstyp: 'application/pdf',
  dateinameMuster: /^[^\\/"\x00-\x1f]{1,200}\.pdf$/i,
  pruefeInhalt: istPdf,
  code: 'EHRUNGSANTRAG_VORLAGE',
  bezeichnung: 'Ehrungsantrag-Vorlage',
};

export function verarbeiteEhrungsantragVorlage(
  anfrage: Request,
  umgebung: EhrungsantragVorlageKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  return verarbeiteDateiVorlage(EHRUNGSANTRAG_VORLAGE, anfrage, umgebung, identitaet);
}
