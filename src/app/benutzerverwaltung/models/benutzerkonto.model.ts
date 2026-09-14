/**
 * Domänenmodell der Benutzerverwaltung. Cloudflare Access entscheidet
 * weiterhin allein, wer sich überhaupt anmelden darf (feste Zugriffsliste in
 * Zero Trust) – dieses Modell kennt nur, wer sich bereits mindestens einmal
 * geprüft angemeldet hat, und eine optionale Rollenzuordnung dazu. Keine
 * Nutzerverwaltung im Sinne von Anlegen/Löschen von Zugängen.
 */

export type Hauptrolle =
  | 'zugfuehrung'
  | 'gruppenfuehrung-sanitaet'
  | 'gruppenfuehrung-betreuung'
  | 'gruppenfuehrung-tesi'
  | 'gruppenfuehrung-verpflegung'
  | 'gruppenfuehrung-fuehrung'
  | 'helfer';

export const HAUPTROLLEN: readonly Hauptrolle[] = [
  'zugfuehrung',
  'gruppenfuehrung-sanitaet',
  'gruppenfuehrung-betreuung',
  'gruppenfuehrung-tesi',
  'gruppenfuehrung-verpflegung',
  'gruppenfuehrung-fuehrung',
  'helfer',
];

export const HAUPTROLLE_LABEL: Readonly<Record<Hauptrolle, string>> = {
  zugfuehrung: 'Zugführung',
  'gruppenfuehrung-sanitaet': 'Gruppenführung Sanität',
  'gruppenfuehrung-betreuung': 'Gruppenführung Betreuung',
  'gruppenfuehrung-tesi': 'Gruppenführung TeSi',
  'gruppenfuehrung-verpflegung': 'Gruppenführung Verpflegung',
  'gruppenfuehrung-fuehrung': 'Gruppenführung Führung',
  helfer: 'Helfer',
};

/**
 * Zusatzrollen neben der Hauptrolle, unabhängig kombinierbar: Verwaltungshelfer
 * schaltet den Verwaltungsbereich frei (Fahrzeugimport, Benutzerverwaltung),
 * Sanitätsdienste die Einsatzplanung (PEP). Bewusst als Liste statt
 * Einzelfeldern, damit künftige weitere Sonderrollen ohne Modelländerung
 * dazukommen. Die Hauptrolle Zugführung schließt beide ein, unabhängig davon,
 * ob sie hier zusätzlich gesetzt sind – eine künftige Berechtigungsprüfung
 * muss `rolle === 'zugfuehrung' || sonderrollen.includes(...)` prüfen, nicht
 * nur `sonderrollen.includes(...)`.
 */
export type Sonderrolle = 'verwaltungshelfer' | 'sanitaetsdienste';

export const SONDERROLLEN: readonly Sonderrolle[] = ['verwaltungshelfer', 'sanitaetsdienste'];

export const SONDERROLLE_LABEL: Readonly<Record<Sonderrolle, string>> = {
  verwaltungshelfer: 'Verwaltungshelfer',
  sanitaetsdienste: 'Sanitätsdienste',
};

export interface Benutzerkonto {
  email: string;
  rolle: Hauptrolle | null;
  sonderrollen: Sonderrolle[];
  /** ISO-Zeitstempel der ersten geprüften Anmeldung. */
  ersterZugriffAm: string;
  /** ISO-Zeitstempel der letzten geprüften Anmeldung. */
  letzterZugriffAm: string;
  /** ISO-Zeitstempel der letzten Rollenänderung, oder `null` ohne Zuordnung. */
  rolleGeaendertAm: string | null;
  /** Geprüfte Access-E-Mail-Adresse, die die Rolle zuletzt geändert hat. */
  rolleGeaendertVon: string | null;
}
