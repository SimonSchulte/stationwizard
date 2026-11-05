import { EfsEinsatzGruppe } from '../models/planung.model';
import { EinsatzListenEintrag, VbKennzahlen } from '../models/einsatz.model';
import { PepKennzahlen } from '../models/pep.model';
import { EinsatzZiel, einsatzZielSchluessel } from './einsatz-aktionen';
import { abstandInTagen, istDringend, lokalerBeginn } from './einsatz-anzeige';
import { MONATSNAMEN, jahrVon, monatIndex } from '../../kern/kalender/datum';

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
  /** Kennzahlen der PEP, `null` ohne PEP. */
  pep: PepKennzahlen | null;
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
        pepVorhanden: (einsatz?.pep ?? null) !== null,
        pep: einsatz?.pep ?? null,
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
        pepVorhanden: einsatz.pep !== null,
        pep: einsatz.pep,
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

/** Filter der Übersicht; alle gesetzten Bedingungen gelten zugleich (UND). */
export interface EinsatzFilter {
  /** Teiltext in Titel oder Ort, Groß-/Kleinschreibung egal. */
  suche: string;
  pepFehlt: boolean;
  vbFehlt: boolean;
  ohneHiorg: boolean;
}

export const KEIN_FILTER: EinsatzFilter = {
  suche: '',
  pepFehlt: false,
  vbFehlt: false,
  ohneHiorg: false,
};

export function istFilterAktiv(filter: EinsatzFilter): boolean {
  return filter.suche.trim() !== '' || filter.pepFehlt || filter.vbFehlt || filter.ohneHiorg;
}

/** Behält die Zeilen, die alle Bedingungen des Filters erfüllen; die Reihenfolge bleibt. */
export function filtereEinsaetze(
  zeilen: readonly EinsatzListenZeile[],
  filter: EinsatzFilter,
): EinsatzListenZeile[] {
  const suche = filter.suche.trim().toLocaleLowerCase('de-DE');
  return zeilen.filter((zeile) => {
    if (
      suche &&
      !zeile.titel.toLocaleLowerCase('de-DE').includes(suche) &&
      !(zeile.ort ?? '').toLocaleLowerCase('de-DE').includes(suche)
    ) {
      return false;
    }
    if (filter.pepFehlt && zeile.pepVorhanden) return false;
    if (filter.vbFehlt && zeile.vb !== null) return false;
    if (filter.ohneHiorg && zeile.herkunft !== 'eigen') return false;
    return true;
  });
}

/** Eine Karte samt Abstandshinweis (nur für anstehende Einsätze gesetzt). */
export interface EinsatzKartenEintrag extends EinsatzListenZeile {
  /** Tage bis zum Beginn (heute = 0); `null`, wenn kein Hinweis gezeigt wird. */
  abstandTage: number | null;
  /** Gelb: Beginn in höchstens 14 Tagen und PEP oder VB fehlt. */
  dringend: boolean;
}

/** Ergänzt Abstandshinweis und Dringlichkeit; ohne `anzeigen` (Vergangenes) bleibt beides leer. */
export function mitAbstand(
  zeilen: readonly EinsatzListenZeile[],
  jetzt: Date,
  anzeigen: boolean,
): EinsatzKartenEintrag[] {
  return zeilen.map((zeile) => {
    const tage = anzeigen ? abstandInTagen(zeile.beginn, jetzt) : null;
    const hinweis = tage !== null && tage >= 0 ? tage : null;
    return {
      ...zeile,
      abstandTage: hinweis,
      dringend: istDringend(hinweis, !zeile.pepVorhanden, zeile.vb === null),
    };
  });
}

export interface MonatsGruppe<T> {
  /** `JJJJ-MM` oder `ohne-datum`. */
  schluessel: string;
  /** „November 2026“ bzw. „Ohne Datum“. */
  titel: string;
  eintraege: T[];
}

/**
 * Gruppiert nach Monat des Beginns in der Reihenfolge des ersten Auftretens (die Sortierung der
 * Liste bleibt also erhalten, auch absteigend). Einträge ohne Beginn stehen in einer letzten
 * Gruppe „Ohne Datum“. Der Monat wird aus dem lokalen Text gelesen, nie über `Date`.
 */
export function gruppiereNachMonat<T extends { beginn: string | null }>(
  eintraege: readonly T[],
): MonatsGruppe<T>[] {
  const gruppen = new Map<string, MonatsGruppe<T>>();
  const ohneDatum: MonatsGruppe<T> = {
    schluessel: 'ohne-datum',
    titel: 'Ohne Datum',
    eintraege: [],
  };
  for (const eintrag of eintraege) {
    const lokal = lokalerBeginn(eintrag.beginn);
    if (lokal === null) {
      ohneDatum.eintraege.push(eintrag);
      continue;
    }
    const schluessel = lokal.slice(0, 7);
    let gruppe = gruppen.get(schluessel);
    if (!gruppe) {
      gruppe = {
        schluessel,
        titel: `${MONATSNAMEN[monatIndex(lokal)]} ${jahrVon(lokal)}`,
        eintraege: [],
      };
      gruppen.set(schluessel, gruppe);
    }
    gruppe.eintraege.push(eintrag);
  }
  return ohneDatum.eintraege.length > 0 ? [...gruppen.values(), ohneDatum] : [...gruppen.values()];
}
