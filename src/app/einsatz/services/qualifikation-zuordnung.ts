/**
 * Übernommenes EFS-Mapping von HiOrg-Qualifikationsbezeichnungen auf die
 * Kürzel aus `MEDIZINISCH_ORDER`/`TAKTISCH_ORDER`. EFS (`efs-api.service.ts`)
 * und die HiOrg-Server-API (`hiorg-personal.service.ts`) liefern dieselben
 * Bezeichnungen aus den Qualifikationslisten der Organisation; beide nutzen
 * deshalb genau diese Tabellen. Nicht erweitern oder umsortieren ohne
 * fachlichen Nachweis (siehe CLAUDE.md, „Dateiformate und Fachverträge").
 */
export const MEDIZINISCHE_BEZEICHNUNGEN: Readonly<Record<string, string>> = {
  'Erste-Hilfe': 'EH',
  'Sanitätshelfer/in': 'SanH',
  'Rettungshelfer/in': 'RH',
  'Rettungssanitäter/in': 'RS',
  'Rettungsassistent/in': 'RA',
  'Notfallsanitäter/in': 'NotSan',
  'Arzt/Ärztin': 'A',
  Notarzt: 'NA',
  'Notarzt / Notärztin': 'NA',
};

export const TAKTISCHE_BEZEICHNUNGEN: Readonly<Record<string, string>> = {
  'Helfer:in in Ausbildung': 'H',
  'Gruppenführer:in': 'GF',
  'Zugführer:in': 'ZF',
  'ZF mit Stabsausbildung': 'ZF',
  'Verbandsführer:in': 'VF',
  'Verbandführer:in': 'VF',
};

/**
 * Die HiOrg-Server-API nennt die Liste einer Qualifikation nur als frei
 * vergebenen Namen; welche Liste medizinisch oder taktisch ist, ist dort nicht
 * belegt. Deshalb wird nur die Bezeichnung nachgeschlagen – bekannte Werte
 * werden zum Kürzel, alles andere bleibt unverändert als Zusatzangabe.
 */
export function bezeichnungZuKuerzel(bezeichnung: string): string {
  return (
    MEDIZINISCHE_BEZEICHNUNGEN[bezeichnung] ?? TAKTISCHE_BEZEICHNUNGEN[bezeichnung] ?? bezeichnung
  );
}
