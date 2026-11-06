import { HiorgArt, HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';
import { EinsatzListenEintrag, VbKennzahlen } from '../models/einsatz.model';
import { PepKennzahlen } from '../models/pep.model';
import { EinsatzZiel, einsatzZielSchluessel } from './einsatz-aktionen';
import { abstandInTagen, istDringend, lokalerBeginn } from './einsatz-anzeige';
import { MONATSNAMEN, jahrVon, monatIndex } from '../../kern/kalender/datum';
import { artAusVeranstaltungsId } from './hiorg-veranstaltungen';

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
  /** Dienst oder Veranstaltung; `null` ohne HiOrg-Bezug und bei Altbestand ohne Art. */
  art: HiorgArt | null;
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
 * Führt HiOrg-Veranstaltungen (Kalenderfeed) und gespeicherte Einsätze zu einer Liste zusammen.
 * Vergangen ist, was ein Ende vor `jetzt` hat; ohne lesbares Datum bleibt es anstehend.
 * Anstehend nach Beginn aufsteigend (ohne Beginn zuletzt), vergangen neueste zuerst.
 *
 * Ein gespeicherter Einsatz, dessen Veranstaltung der Feed nicht (mehr) liefert – das Fenster
 * des Feeds ist begrenzt –, erscheint mit seinen gespeicherten Angaben weiter, damit PEP und
 * VB erreichbar bleiben.
 */
export function baueEinsatzListe(
  veranstaltungen: readonly HiorgVeranstaltung[],
  einsaetze: readonly EinsatzListenEintrag[],
  jetzt: Date,
): EinsatzListe {
  const jetztText = lokalerBeginn(jetzt.toISOString()) ?? '';
  const jeVeranstaltung = new Map<string, EinsatzListenEintrag>();
  for (const einsatz of einsaetze) {
    if (einsatz.hiorgVeranstaltungId) jeVeranstaltung.set(einsatz.hiorgVeranstaltungId, einsatz);
  }
  const imFeed = new Set(veranstaltungen.map((v) => v.veranstaltungId));
  const eintraege: { zeile: EinsatzListenZeile; ende: string | null }[] = [];
  for (const veranstaltung of veranstaltungen) {
    const einsatz = jeVeranstaltung.get(veranstaltung.veranstaltungId) ?? null;
    eintraege.push({
      zeile: {
        schluessel: einsatzZielSchluessel(veranstaltung),
        ziel: veranstaltung,
        titel: veranstaltung.titel,
        beginn: veranstaltung.beginn,
        schichten: veranstaltung.schichten.length,
        ort: einsatz?.ort ?? null,
        herkunft: 'hiorg',
        art: veranstaltung.art,
        pepVorhanden: (einsatz?.pep ?? null) !== null,
        pep: einsatz?.pep ?? null,
        vb: einsatz?.vb ?? null,
      },
      ende: veranstaltung.ende,
    });
  }
  for (const einsatz of einsaetze) {
    if (einsatz.hiorgVeranstaltungId && imFeed.has(einsatz.hiorgVeranstaltungId)) continue;
    eintraege.push({
      zeile: {
        schluessel: einsatzZielSchluessel(einsatz),
        ziel: einsatz,
        titel: einsatz.titel,
        beginn: lokalerBeginn(einsatz.beginn),
        schichten: null,
        ort: einsatz.ort,
        herkunft: einsatz.hiorgVeranstaltungId ? 'hiorg' : 'eigen',
        art: artAusVeranstaltungsId(einsatz.hiorgVeranstaltungId),
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
  /** `alle` oder nur Dienste bzw. nur Veranstaltungen; Einsätze ohne Art fallen dann heraus. */
  art: 'alle' | HiorgArt;
}

export const KEIN_FILTER: EinsatzFilter = {
  suche: '',
  pepFehlt: false,
  vbFehlt: false,
  ohneHiorg: false,
  art: 'alle',
};

export function istFilterAktiv(filter: EinsatzFilter): boolean {
  return (
    filter.suche.trim() !== '' ||
    filter.pepFehlt ||
    filter.vbFehlt ||
    filter.ohneHiorg ||
    filter.art !== 'alle'
  );
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
    if (filter.art !== 'alle' && zeile.art !== filter.art) return false;
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
