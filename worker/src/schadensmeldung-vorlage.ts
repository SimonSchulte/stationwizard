import type { Benutzer } from './anmeldung';
import {
  verarbeiteDateiVorlage,
  type DateiVorlageKonfiguration,
  type VorlagenArt,
} from './datei-vorlage';
import { istPdf } from './ehrungsantrag-vorlage';

/**
 * PDF-Formular „Schadens- und Verlustmeldung“ (Anlage 5): im Verwaltungsbereich hinterlegt, im
 * Browser mit den Daten der Meldung gefüllt (`vorgaenge/services/schadensmeldung-pdf.ts`). Der
 * Worker verwahrt die Datei nur; Ablage gemeinsam in `datei-vorlage.ts`, Migration 0029.
 */
export type SchadensmeldungVorlageKonfiguration = DateiVorlageKonfiguration;

export const SCHADENSMELDUNG_VORLAGE_PFAD = '/api/vorlagen/schadensmeldung';
export const SCHADENSMELDUNG_VORLAGE_DATEI_PFAD = '/api/vorlagen/schadensmeldung/datei';

const SCHADENSMELDUNG_VORLAGE: VorlagenArt = {
  tabelle: 'schadensmeldung_vorlage',
  id: 'schadensmeldung',
  pfad: SCHADENSMELDUNG_VORLAGE_PFAD,
  dateiPfad: SCHADENSMELDUNG_VORLAGE_DATEI_PFAD,
  inhaltstyp: 'application/pdf',
  dateinameMuster: /^[^\\/"\x00-\x1f]{1,200}\.pdf$/i,
  pruefeInhalt: istPdf,
  code: 'SCHADENSMELDUNG_VORLAGE',
  bezeichnung: 'Schadensmeldung-Vorlage',
};

export function verarbeiteSchadensmeldungVorlage(
  anfrage: Request,
  umgebung: SchadensmeldungVorlageKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  return verarbeiteDateiVorlage(SCHADENSMELDUNG_VORLAGE, anfrage, umgebung, identitaet);
}
