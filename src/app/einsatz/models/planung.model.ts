export const TAKTISCH_ORDER = ['H', 'KSH', 'GF', 'ZF', 'GdSA', 'VF'] as const;
export const MEDIZINISCH_ORDER = [
  'EH',
  'SSD',
  'SanH',
  'RH',
  'RS',
  'RA',
  'NotSan',
  'A',
  'NA',
] as const;

export type Taktisch = (typeof TAKTISCH_ORDER)[number];
export type Medizinisch = (typeof MEDIZINISCH_ORDER)[number];

export interface Requirements {
  taktisch: Taktisch | null;
  medizinisch: Medizinisch | null;
  zusatz?: string | null;
}

export interface EinsatzkraftRef {
  id: string;
  name: string;
}

export interface Fahrzeug {
  seriennummer: string;
  funkruf: string;
  hiorgId: string;
}

export interface FahrzeugRef {
  seriennummer: string | null;
  funkruf: string;
  hiorgId: string | null;
}

export interface Position {
  id: string;
  label: string;
  requirements: Requirements;
  assigned: EinsatzkraftRef | null;
  isPostenfuehrer?: boolean;
}

export interface Posten {
  id: string;
  label: string;
  fahrzeug: FahrzeugRef | null;
  positions: Position[];
  hiorg_schicht_id?: string;
  telefonnummer?: string;
}

export interface Einsatzkraft {
  id: string;
  /** "Nachname Vorname" */
  name: string;
  tags: {
    taktisch?: Taktisch[];
    medizinisch?: Medizinisch[];
    zusatz?: string[];
  };
  meta?: { notes?: string };
  /** HiOrg-Server org-scoped ID; set when imported from EFS-API */
  hiorg_org_id?: string;
  telefonnummer?: string;
}

export interface Planung {
  id: string;
  name: string;
  start: string;
  end: string;
  beschreibung?: string | null;
  posten: Posten[];
  einsatzkraefte: Einsatzkraft[];
  einsatzleiter: EinsatzkraftRef | null;
  /** HiOrg-Server Einsatz-ID; set when loaded from EFS-API */
  hiorg_einsatz_id?: string;
}

export interface PepFile {
  version: string;
  meta: { exportedAt: string; taktischeZeit?: string; locale: string };
  planung: Planung;
}

// ── EFS-API domain types ────────────────────────────────────────────────────

export interface EfsEinsatz {
  id: string;
  titel: string;
  datum_von: string;
  datum_bis: string;
  ort?: string;
  veranstaltung_id?: string;
}

export interface EfsEinsatzGruppe {
  veranstaltung_id: string;
  titel: string;
  datum_von: string;
  datum_bis: string;
  ort?: string;
  schichten: EfsEinsatz[];
}

export interface EfsEinsatzkraft {
  hiorg_org_id: string;
  vorname: string;
  nachname: string;
  ausbildungen?: string[];
  telefonnummer?: string;
}

export interface EfsEinsatzmittel {
  id: string;
  bezeichnung?: string;
  funkruf?: string;
  fugcode?: string;
}
