import { EfsEinsatzGruppe } from '../models/planung.model';
import { EinsatzListenEintrag, VbKennzahlen } from '../models/einsatz.model';
import { EinsatzZiel, einsatzZielSchluessel } from './einsatz-aktionen';
import { lokalerBeginn } from './einsatz-anzeige';

/** Eine Karte der Einsatzübersicht: HiOrg-Veranstaltung oder Einsatz ohne HiOrg. */
export interface EinsatzListenZeile {
  schluessel: string;
  /** Ziel für den `EinsatzAktionenDienst`. */
  ziel: EinsatzZiel;
  titel: string;
  /** Lokal `YYYY-MM-DDTHH:mm`; `null` ohne Beginn. */
  beginn: string | null;
  schichten: number | null;
  ort: string | null;
  herkunft: 'hiorg' | 'eigen';
  pepVorhanden: boolean;
  vb: VbKennzahlen | null;
}

export interface EinsatzListe {
  anstehend: EinsatzListenZeile[];
  vergangen: EinsatzListenZeile[];
}

function nachBeginn(a: EinsatzListenZeile, b: EinsatzListenZeile): number {
  // Ohne Beginn ans Ende.
  if (a.beginn === null || b.beginn === null) {
    return a.beginn === b.beginn ? 0 : a.beginn === null ? 1 : -1;
  }
  return a.beginn.localeCompare(b.beginn);
}

/**
 * Führt HiOrg-Veranstaltungen und Einsätze ohne HiOrg zu einer Liste zusammen. Vergangen ist,
 * was ein Ende (HiOrg: `datum_bis`, sonst Beginn) vor `jetzt` hat; ohne lesbares Datum bleibt
 * es anstehend. Anstehend nach Beginn aufsteigend (ohne Beginn zuletzt), vergangen neueste zuerst.
 * Einsätze mit HiOrg-Veranstaltung, die EFS nicht liefert, erscheinen nicht.
 */
export function baueEinsatzListe(
  gruppen: readonly EfsEinsatzGruppe[],
  einsaetze: readonly EinsatzListenEintrag[],
  jetzt: Date,
): EinsatzListe {
  const jetztText = lokalerBeginn(jetzt.toISOString()) ?? '';
  const jeVeranstaltung = new Map<string, EinsatzListenEintrag>();
  for (const einsatz of einsaetze) {
    if (einsatz.hiorgVeranstaltungId) jeVeranstaltung.set(einsatz.hiorgVeranstaltungId, einsatz);
  }
  const eintraege: { zeile: EinsatzListenZeile; ende: string | null }[] = [];
  for (const gruppe of gruppen) {
    const einsatz = jeVeranstaltung.get(gruppe.veranstaltung_id) ?? null;
    const beginn = lokalerBeginn(gruppe.datum_von);
    eintraege.push({
      zeile: {
        schluessel: einsatzZielSchluessel(gruppe),
        ziel: gruppe,
        titel: gruppe.titel,
        beginn,
        schichten: gruppe.schichten.length,
        ort: gruppe.ort ?? null,
        herkunft: 'hiorg',
        pepVorhanden: !!einsatz?.pepId,
        vb: einsatz?.vb ?? null,
      },
      ende: lokalerBeginn(gruppe.datum_bis) ?? beginn,
    });
  }
  for (const einsatz of einsaetze) {
    if (einsatz.hiorgVeranstaltungId) continue;
    eintraege.push({
      zeile: {
        schluessel: einsatzZielSchluessel(einsatz),
        ziel: einsatz,
        titel: einsatz.titel,
        beginn: lokalerBeginn(einsatz.beginn),
        schichten: null,
        ort: einsatz.ort,
        herkunft: 'eigen',
        pepVorhanden: !!einsatz.pepId,
        vb: einsatz.vb,
      },
      ende: lokalerBeginn(einsatz.ende) ?? lokalerBeginn(einsatz.beginn),
    });
  }
  const istVergangen = (e: { ende: string | null }) => e.ende !== null && e.ende < jetztText;
  const anstehend = eintraege
    .filter((e) => !istVergangen(e))
    .map((e) => e.zeile)
    .sort(nachBeginn);
  const vergangen = eintraege
    .filter(istVergangen)
    .map((e) => e.zeile)
    .sort((a, b) => nachBeginn(b, a));
  return { anstehend, vergangen };
}
