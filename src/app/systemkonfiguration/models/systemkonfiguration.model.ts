/**
 * Betriebseinstellungen aus `GET /api/systemkonfiguration`. Hier stehen
 * ausschließlich Werte, die in der Oberfläche gesetzt werden – niemals
 * Zugangsdaten: Absenderadresse und API-Token bleiben Secrets am Worker und
 * erscheinen bewusst in keiner Antwort (siehe CLAUDE.md, "Worker und
 * Zugangsschutz").
 */

export type Versandweg = 'email-routing' | 'resend';

export const VERSANDWEGE: readonly Versandweg[] = ['email-routing', 'resend'];

export const VERSANDWEG_LABEL: Readonly<Record<Versandweg, string>> = {
  'email-routing': 'Cloudflare Email Routing',
  resend: 'Mail-API (Resend)',
};

/**
 * Warum ein Weg nicht benutzbar sein kann. Beide Hinweise beschreiben eine
 * Einrichtung außerhalb dieser Anwendung; die Oberfläche benennt das ehrlich,
 * statt den Versand erst beim Absenden scheitern zu lassen.
 */
export const VERSANDWEG_HINWEIS: Readonly<Record<Versandweg, string>> = {
  'email-routing':
    'Die Empfängeradresse muss in Cloudflare Email Routing als Zieladresse bestätigt sein, ' +
    'und der Worker braucht das send_email-Binding.',
  resend: 'Der Worker braucht ein hinterlegtes API-Token des Anbieters.',
};

export interface Einstellungen {
  /** Leer heißt: noch nicht festgelegt, der Versand ist dann gesperrt. */
  kmBerichtEmpfaenger: string;
  kmBerichtVersandweg: Versandweg;
  kmBerichtBetreff: string;
  /**
   * Ampel-Schwellenwerte der Kilometerübersicht in Monaten Puffer (siehe
   * `ermittleKilometerAmpel` in `fahrzeuge/services/kilometer-soll.ts`):
   * grün bleibt es, solange die Rest-km beim Mindesttempo der verbleibenden
   * Monate zzgl. dieses Puffers noch erreichbar sind.
   */
  kmAmpelSchwellenwertGelbMonate: number;
  /** Ab diesem Puffer in Monaten wird die Ampel rot statt gelb. */
  kmAmpelSchwellenwertRotMonate: number;
}

/** Ob ein Versandweg am Worker tatsächlich eingerichtet ist. */
export interface VersandwegStatus {
  weg: Versandweg;
  verfuegbar: boolean;
}

export interface Systemkonfiguration {
  einstellungen: Einstellungen;
  versandwege: VersandwegStatus[];
}
