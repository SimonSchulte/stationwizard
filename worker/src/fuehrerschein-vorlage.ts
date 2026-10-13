import type { Benutzer } from './anmeldung';
import { istZip } from './binaer-lesen';
import {
  verarbeiteDateiVorlage,
  type DateiVorlageKonfiguration,
  type VorlagenArt,
} from './datei-vorlage';

/**
 * Word-Vorlage der Führerscheinliste (`personal/pages/fuehrerscheinliste/`):
 * ein einzelnes, hinterlegtes `.docx`, das im Verwaltungsbereich ersetzt
 * werden kann (`personal/pages/fuehrerschein-vorlage-verwaltung/`) und dessen
 * Tabelle der Client mit den Fahrerlaubnisdaten füllt (siehe
 * `personal/services/fuehrerschein-dokument.ts`). Die Ablage selbst steht
 * gemeinsam in `datei-vorlage.ts`; Migration 0012.
 */
export type FuehrerscheinVorlageKonfiguration = DateiVorlageKonfiguration;

export const FUEHRERSCHEIN_VORLAGE_PFAD = '/api/personal/fuehrerschein-vorlage';
export const FUEHRERSCHEIN_VORLAGE_DATEI_PFAD = '/api/personal/fuehrerschein-vorlage/datei';

const FUEHRERSCHEIN_VORLAGE: VorlagenArt = {
  tabelle: 'fuehrerschein_vorlage',
  id: 'fuehrerscheinliste',
  pfad: FUEHRERSCHEIN_VORLAGE_PFAD,
  dateiPfad: FUEHRERSCHEIN_VORLAGE_DATEI_PFAD,
  inhaltstyp: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dateinameMuster: /^[^\\/"\x00-\x1f]{1,200}\.docx$/i,
  pruefeInhalt: istZip,
  code: 'FUEHRERSCHEIN_VORLAGE',
  bezeichnung: 'Führerschein-Vorlage',
};

export function verarbeiteFuehrerscheinVorlage(
  anfrage: Request,
  umgebung: FuehrerscheinVorlageKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  return verarbeiteDateiVorlage(FUEHRERSCHEIN_VORLAGE, anfrage, umgebung, identitaet);
}
