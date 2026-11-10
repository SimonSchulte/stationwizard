import { AufbauInhalt, AufbauKistenEintrag } from '../models/aufbau.model';
import { Artikel, Kiste, Lager } from '../models/stammdaten.model';
import { leiteZettelAb } from './aufbau-zettel';

/**
 * Abgleich des Aufbaus mit den Stammdaten und Prüfung vor dem Drucken (Konzept Abschnitt 5, Punkt 3).
 * Alles reine Berechnungen: die Hinweise erscheinen im Editor und im Druckdialog.
 */

export interface AufbauStammdaten {
  lager: readonly Lager[];
  artikel: readonly Artikel[];
  kisten: readonly Kiste[];
}

/** `fehler` verhindert nichts, sagt aber, dass der Druck unvollständig wird; `hinweis` informiert. */
export type ProblemSchwere = 'fehler' | 'hinweis';

export interface AufbauProblem {
  schwere: ProblemSchwere;
  art:
    | 'zettel-zu-voll'
    | 'ohne-foto'
    | 'ohne-heimatlager'
    | 'kiste-weicht-ab'
    | 'kiste-entfallen'
    | 'artikel-entfallen'
    | 'leere-einheit';
  text: string;
  einheitId: string;
  eintragId?: string;
}

function gleicherInhalt(a: AufbauKistenEintrag['inhalt'], b: Kiste['inhalt']): boolean {
  if (a.length !== b.length) return false;
  const nachArtikel = new Map(b.map((p) => [p.artikelId, p]));
  return a.every((p) => {
    const gegen = nachArtikel.get(p.artikelId);
    return !!gegen && gegen.menge === p.menge && gegen.bemerkung.trim() === p.bemerkung.trim();
  });
}

/** Weicht die Momentaufnahme im Aufbau vom aktuellen Stammdatum ab (Name, Lager oder Inhalt)? */
export function kisteWeichtAb(eintrag: AufbauKistenEintrag, kiste: Kiste): boolean {
  return (
    eintrag.name !== kiste.name ||
    eintrag.lagerId !== kiste.lagerId ||
    !gleicherInhalt(eintrag.inhalt, kiste.inhalt)
  );
}

function einheitenMitName(inhalt: AufbauInhalt) {
  const liste: {
    id: string;
    name: string;
    foto: boolean;
    inhalt: AufbauInhalt['einheiten'][number]['inhalt'];
  }[] = [];
  for (const e of inhalt.einheiten) {
    liste.push({ id: e.id, name: e.name, foto: !!e.foto, inhalt: e.inhalt });
    for (const eintrag of e.inhalt) {
      if (eintrag.art === 'wagen') {
        const w = eintrag.einheit;
        liste.push({ id: w.id, name: w.name, foto: !!w.foto, inhalt: w.inhalt });
      }
    }
  }
  return liste;
}

export function pruefeAufbau(inhalt: AufbauInhalt, daten: AufbauStammdaten): AufbauProblem[] {
  const probleme: AufbauProblem[] = [];
  const kisten = new Map(daten.kisten.map((k) => [k.id, k]));
  const artikel = new Set(daten.artikel.map((a) => a.id));
  for (const e of einheitenMitName(inhalt)) {
    if (e.inhalt.length === 0) {
      probleme.push({
        schwere: 'hinweis',
        art: 'leere-einheit',
        text: `${e.name} ist leer.`,
        einheitId: e.id,
      });
    }
    if (!e.foto) {
      probleme.push({
        schwere: 'hinweis',
        art: 'ohne-foto',
        text: `${e.name} hat kein Foto; das Schild druckt einen leeren Rahmen.`,
        einheitId: e.id,
      });
    }
    for (const eintrag of e.inhalt) {
      if (eintrag.art === 'artikel') {
        if (!artikel.has(eintrag.artikelId)) {
          probleme.push({
            schwere: 'fehler',
            art: 'artikel-entfallen',
            text: `Ein Artikel in ${e.name} gibt es in den Stammdaten nicht mehr.`,
            einheitId: e.id,
            eintragId: eintrag.id,
          });
        }
        if (eintrag.lagerId === null) {
          probleme.push({
            schwere: 'fehler',
            art: 'ohne-heimatlager',
            text: `Ein Artikel in ${e.name} hat kein Lager; er steht am Zettelende.`,
            einheitId: e.id,
            eintragId: eintrag.id,
          });
        }
      } else if (eintrag.art === 'kiste' && eintrag.kisteId) {
        const stamm = kisten.get(eintrag.kisteId);
        if (!stamm) {
          probleme.push({
            schwere: 'hinweis',
            art: 'kiste-entfallen',
            text: `${eintrag.name} (${e.name}) gibt es in den Stammdaten nicht mehr.`,
            einheitId: e.id,
            eintragId: eintrag.id,
          });
        } else if (kisteWeichtAb(eintrag, stamm)) {
          probleme.push({
            schwere: 'hinweis',
            art: 'kiste-weicht-ab',
            text: `${eintrag.name} (${e.name}) weicht von den Stammdaten ab.`,
            einheitId: e.id,
            eintragId: eintrag.id,
          });
        }
      }
    }
  }
  for (const z of leiteZettelAb(inhalt, daten)) {
    if (z.streifen > 1) {
      probleme.push({
        schwere: 'hinweis',
        art: 'zettel-zu-voll',
        text: `Der Zettel ${z.name} braucht ${z.streifen} Streifen (${z.belegt} von ${z.kapazitaet} Zeilen).`,
        einheitId: z.einheitId,
      });
    }
  }
  return probleme;
}
