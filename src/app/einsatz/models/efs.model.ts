/** Einsatz (Schicht) aus der EFS-Veranstaltungsliste. Datumsfelder wie von EFS geliefert. */
export interface EfsEinsatz {
  id: string;
  titel: string;
  datum_von: string;
  datum_bis: string;
  ort?: string;
  veranstaltung_id?: string;
}

/** Schichten derselben EFS-Veranstaltung, wie der Abgleich sie als einen Treffer behandelt. */
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
  /** Qualifikationsbezeichnungen aus EFS (`med_qual`, `fuehr_qual`, `fw_qual`, `bes_ausbild`). */
  ausbildungen: string[];
  telefonnummer?: string;
}
