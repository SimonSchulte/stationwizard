import { AUFBAU_GRENZEN } from '../models/aufbau.model';
import { lagerSchluessel } from './lager';

/**
 * Übernahme einer Excel-Packliste in einen Aufbau (einmalig, Verwaltungsbereich). Reine Berechnung in zwei
 * Schritten: `leitePacklisteAb()` macht aus den Zeilen einen **Plan** mit Namen (Fahrzeuge, Wagen, Kisten,
 * freie Artikel, Lager und Plätze, dazu Warnungen); erst die Seite legt fehlende Lager und Plätze an und
 * baut den Aufbau mit echten Kennungen (`baueAufbauInhalt()` in `packliste-aufbau.ts`).
 *
 * Spalten: Anzahl, Material, Lagerort, Lagerplatz (optional), Transport mit. „Transport mit“ ist das Ziel:
 * ein Fahrzeug (Name kommt nie als Material vor), ein Wagen (Name enthält „wagen“), sonst eine Kiste.
 * Es entstehen nur **freie** Artikel und freie Kistenpositionen; der Artikelkatalog bleibt unberührt und
 * lässt sich im Aufbau nachträglich per „In den Artikelkatalog übernehmen“ füllen.
 */

export interface PacklisteZeile {
  /** Zeile in der Excel-Datei (ab 1), für die Warnungen. */
  zeile: number;
  anzahl: unknown;
  material: string;
  lagerort: string;
  lagerplatz: string;
  transportMit: string;
}

export interface PlanFrei {
  art: 'frei';
  name: string;
  menge: number;
  bemerkung: string;
  lager: string | null;
  platz: string | null;
}

export interface PlanKistenPosition {
  name: string;
  menge: number;
  bemerkung: string;
}

export interface PlanKiste {
  art: 'kiste';
  name: string;
  anzahl: number;
  lager: string | null;
  platz: string | null;
  /** Keine Positionen: gleichbleibend bestückt, nicht aufgelistet. */
  standard: boolean;
  inhalt: PlanKistenPosition[];
}

export interface PlanWagen {
  art: 'wagen';
  name: string;
  eintraege: (PlanFrei | PlanKiste)[];
}

export interface PlanEinheit {
  typ: 'fahrzeug' | 'wagen';
  name: string;
  eintraege: (PlanFrei | PlanKiste | PlanWagen)[];
}

export interface PacklistePlan {
  einheiten: PlanEinheit[];
  /** Lager in der Reihenfolge des ersten Vorkommens, je mit ihren Plätzen. */
  lager: { name: string; plaetze: string[] }[];
}

export interface PacklisteErgebnis {
  plan: PacklistePlan;
  warnungen: string[];
  /** Zahlen für die Vorschau. */
  zahlen: { fahrzeuge: number; wagen: number; kisten: number; artikel: number; positionen: number };
}

/** `Kiste "Verkaufsmaterial"` (auch mit typografischen Anführungszeichen) → `Verkaufsmaterial`. */
const KISTE_MUSTER = /^Kiste\s*[„"“”](.+?)[“"”]$/i;

function bereinigt(wert: unknown): string {
  return typeof wert === 'string' ? wert.replace(/\s+/g, ' ').trim() : '';
}

function behaelterName(text: string): string {
  return KISTE_MUSTER.exec(text)?.[1]?.trim() ?? text;
}

function istKistenschreibweise(text: string): boolean {
  return KISTE_MUSTER.test(text);
}

/** Schlüssel eines Behälters: `Kiste "X"` und ein gleich benannter Artikel „X“ sind verschieden. */
function behaelterSchluessel(text: string): string {
  return (istKistenschreibweise(text) ? 'kiste:' : '') + lagerSchluessel(behaelterName(text));
}

interface Menge {
  menge: number;
  bemerkung: string;
  warnung: string | null;
}

/** Menge laut Vertrag: größer 0, höchstens drei Nachkommastellen; Text wie „80-90“ wird die Mitte. */
export function liesMenge(roh: unknown): Menge {
  if (typeof roh === 'number' && Number.isFinite(roh) && roh > 0) {
    return { menge: Math.round(roh * 1000) / 1000, bemerkung: '', warnung: null };
  }
  const text = bereinigt(typeof roh === 'string' ? roh : roh == null ? '' : String(roh));
  const spanne = /^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/.exec(text);
  if (spanne) {
    const von = Number(spanne[1]!.replace(',', '.'));
    const bis = Number(spanne[2]!.replace(',', '.'));
    return {
      menge: Math.round(((von + bis) / 2) * 1000) / 1000,
      bemerkung: `${spanne[1]}–${spanne[2]}`,
      warnung: null,
    };
  }
  const zahl = /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : NaN;
  if (Number.isFinite(zahl) && zahl > 0) return { menge: zahl, bemerkung: '', warnung: null };
  return {
    menge: 1,
    bemerkung: text === '' ? 'Menge klären' : text,
    warnung:
      text === ''
        ? 'Keine Menge angegeben, 1 angenommen.'
        : `Menge „${text}“ unklar, 1 angenommen.`,
  };
}

/** „Kaltlager (Spinde)“ → Lager „Kaltlager“, Platz „Spinde“; ein eigener Lagerplatz geht vor. */
function lagerUndPlatz(
  lagerort: string,
  lagerplatz: string,
): { lager: string | null; platz: string | null } {
  const ort = bereinigt(lagerort);
  const platz = bereinigt(lagerplatz);
  if (ort === '') return { lager: null, platz: null };
  const klammer = /^(.*?)\s*\((.+)\)$/.exec(ort);
  if (klammer && klammer[1]) {
    return { lager: klammer[1], platz: platz || klammer[2]!.trim() };
  }
  return { lager: ort, platz: platz || null };
}

type Art = 'fahrzeug' | 'wagen' | 'kiste';

interface Zeilenwert {
  zeile: PacklisteZeile;
  material: string;
  ziel: string;
  menge: Menge;
  lager: string | null;
  platz: string | null;
}

/**
 * Plan aus den Zeilen der Liste. Nichts geht still verloren: Zeilen ohne Ziel, Kisten ohne eigene Zeile und
 * Kisten in Kisten landen mit einer Warnung am Ende, ein „Ohne Ziel“-Fahrzeug nimmt sie auf.
 */
export function leitePacklisteAb(zeilen: readonly PacklisteZeile[]): PacklisteErgebnis {
  const warnungen: string[] = [];
  const warne = (zeile: PacklisteZeile, text: string): void => {
    warnungen.push(`Zeile ${zeile.zeile} („${bereinigt(zeile.material)}“): ${text}`);
  };

  const werte: Zeilenwert[] = [];
  for (const zeile of zeilen) {
    const material = bereinigt(zeile.material);
    if (material === '') continue;
    const menge = liesMenge(zeile.anzahl);
    if (menge.warnung) warne(zeile, menge.warnung);
    const { lager, platz } = lagerUndPlatz(zeile.lagerort, zeile.lagerplatz);
    werte.push({ zeile, material, ziel: bereinigt(zeile.transportMit), menge, lager, platz });
  }

  // Wer ist ein Behälter? Jeder Name, der irgendwo als Ziel steht.
  const zielNamen = new Map<string, string>();
  for (const w of werte) {
    if (w.ziel !== '') zielNamen.set(behaelterSchluessel(w.ziel), w.ziel);
  }
  const zeileJeName = new Map<string, Zeilenwert>();
  for (const w of werte) {
    const schluessel = behaelterSchluessel(w.material);
    // Behälter ist, was als Ziel vorkommt, und jede Zeile in der Schreibweise `Kiste "…"` (auch ohne Inhalt).
    const istBehaelter = zielNamen.has(schluessel) || istKistenschreibweise(w.material);
    if (istBehaelter && !zeileJeName.has(schluessel)) zeileJeName.set(schluessel, w);
  }
  const artVon = (zielText: string): Art => {
    const schluessel = behaelterSchluessel(zielText);
    const eigene = zeileJeName.get(schluessel);
    if (!eigene) return istKistenschreibweise(zielText) ? 'kiste' : 'fahrzeug';
    return /wagen/i.test(behaelterName(eigene.material)) ? 'wagen' : 'kiste';
  };

  const einheiten: PlanEinheit[] = [];
  const einheitJeName = new Map<string, PlanEinheit>();
  const wagenJeName = new Map<string, PlanWagen>();
  const kisteJeName = new Map<string, PlanKiste>();
  /** Kiste in Kiste: der Schlüssel der inneren verweist auf den der äußeren. */
  const kisteAlias = new Map<string, string>();
  const lagerPlaene = new Map<string, { name: string; plaetze: string[] }>();
  const merkeLager = (lager: string | null, platz: string | null): void => {
    if (!lager) return;
    const schluessel = lagerSchluessel(lager);
    let eintrag = lagerPlaene.get(schluessel);
    if (!eintrag) {
      eintrag = { name: lager, plaetze: [] };
      lagerPlaene.set(schluessel, eintrag);
    }
    if (platz && !eintrag.plaetze.some((p) => lagerSchluessel(p) === lagerSchluessel(platz))) {
      eintrag.plaetze.push(platz);
    }
  };

  const fahrzeug = (name: string): PlanEinheit => {
    const schluessel = lagerSchluessel(name);
    let einheit = einheitJeName.get(schluessel);
    if (!einheit) {
      einheit = { typ: 'fahrzeug', name, eintraege: [] };
      einheitJeName.set(schluessel, einheit);
      einheiten.push(einheit);
    }
    return einheit;
  };
  let ohneZiel: PlanEinheit | null = null;
  const ohneZielEinheit = (): PlanEinheit => {
    if (!ohneZiel) {
      ohneZiel = { typ: 'fahrzeug', name: 'Ohne Ziel (bitte prüfen)', eintraege: [] };
      einheiten.push(ohneZiel);
    }
    return ohneZiel;
  };

  // 1. Behälter anlegen: Wagen, dann Kisten (Reihenfolge der Liste).
  for (const w of werte) {
    const name = behaelterName(w.material);
    const schluessel = behaelterSchluessel(w.material);
    if (zeileJeName.get(schluessel) !== w) continue;
    const art = artVon(w.material);
    if (art === 'wagen') {
      const wagen: PlanWagen = { art: 'wagen', name, eintraege: [] };
      wagenJeName.set(schluessel, wagen);
      if (w.ziel === '') {
        einheiten.push({ typ: 'wagen', name, eintraege: [] });
        // Ein freier Wagen ist selbst eine oberste Einheit; sein Inhalt kommt in diese Einheit.
        wagenJeName.delete(schluessel);
        einheitJeName.set(schluessel, einheiten[einheiten.length - 1]!);
        warne(w.zeile, 'Der Wagen hat kein Ziel und steht als freier Wagen.');
      } else if (artVon(w.ziel) === 'fahrzeug') {
        fahrzeug(w.ziel).eintraege.push(wagen);
      } else {
        warne(
          w.zeile,
          `Ein Wagen kann nur in einem Fahrzeug stehen („${w.ziel}“); er steht als freier Wagen.`,
        );
        wagenJeName.delete(schluessel);
        einheiten.push({ typ: 'wagen', name, eintraege: [] });
        einheitJeName.set(schluessel, einheiten[einheiten.length - 1]!);
      }
    } else if (art === 'kiste') {
      merkeLager(w.lager, w.platz);
      kisteJeName.set(schluessel, {
        art: 'kiste',
        name,
        anzahl: 1,
        lager: w.lager,
        platz: w.platz,
        standard: false,
        inhalt: [],
      });
    }
  }

  // Kisten in ihr Ziel stellen.
  const einheitZiel = (ziel: string): PlanWagen | PlanEinheit | null => {
    const schluessel = behaelterSchluessel(ziel);
    return wagenJeName.get(schluessel) ?? einheitJeName.get(schluessel) ?? null;
  };
  for (const w of werte) {
    const schluessel = behaelterSchluessel(w.material);
    const kiste = kisteJeName.get(schluessel);
    if (!kiste || zeileJeName.get(schluessel) !== w) continue;
    const anzahl = Number.isInteger(w.menge.menge) && w.menge.menge >= 1 ? w.menge.menge : 1;
    kiste.anzahl = Math.min(anzahl, AUFBAU_GRENZEN.kistenAnzahl);
    if (w.ziel === '') {
      warne(w.zeile, 'Die Kiste hat kein Ziel („Transport mit“).');
      ohneZielEinheit().eintraege.push(kiste);
    } else if (artVon(w.ziel) === 'kiste') {
      // Eine Kiste enthält keine Kiste: die innere wird eine Position der äußeren.
      const aussen = kisteJeName.get(behaelterSchluessel(w.ziel));
      warne(
        w.zeile,
        `Eine Kiste kann nicht in einer Kiste stehen („${w.ziel}“); sie wird Position davon.`,
      );
      aussen?.inhalt.push({ name: kiste.name, menge: kiste.anzahl, bemerkung: '' });
      kisteJeName.delete(schluessel);
      kisteAlias.set(schluessel, behaelterSchluessel(w.ziel));
    } else {
      const ziel = einheitZiel(w.ziel) ?? fahrzeug(w.ziel);
      ziel.eintraege.push(kiste);
    }
  }

  // 2. Alle übrigen Zeilen: freie Artikel (in Fahrzeug oder Wagen) beziehungsweise Kistenpositionen.
  let artikel = 0;
  let positionen = 0;
  for (const w of werte) {
    const schluessel = behaelterSchluessel(w.material);
    if (zeileJeName.get(schluessel) === w) continue;
    const zusatz = w.menge.bemerkung;
    if (w.ziel === '') {
      warne(w.zeile, 'Kein Ziel („Transport mit“); der Artikel steht unter „Ohne Ziel“.');
      merkeLager(w.lager, w.platz);
      ohneZielEinheit().eintraege.push({
        art: 'frei',
        name: w.material,
        menge: w.menge.menge,
        bemerkung: zusatz,
        lager: w.lager,
        platz: w.platz,
      });
      artikel += 1;
      continue;
    }
    const art = artVon(w.ziel);
    if (art === 'kiste') {
      const zielSchluessel = behaelterSchluessel(w.ziel);
      const kiste = kisteJeName.get(kisteAlias.get(zielSchluessel) ?? zielSchluessel);
      if (!kiste) {
        warne(
          w.zeile,
          `Die Kiste „${behaelterName(w.ziel)}“ hat keine eigene Zeile; der Artikel steht unter „Ohne Ziel“.`,
        );
        merkeLager(w.lager, w.platz);
        ohneZielEinheit().eintraege.push({
          art: 'frei',
          name: w.material,
          menge: w.menge.menge,
          bemerkung: zusatz,
          lager: w.lager,
          platz: w.platz,
        });
        artikel += 1;
        continue;
      }
      kiste.inhalt.push({ name: w.material, menge: w.menge.menge, bemerkung: zusatz });
      positionen += 1;
      continue;
    }
    merkeLager(w.lager, w.platz);
    const ziel = einheitZiel(w.ziel) ?? fahrzeug(w.ziel);
    ziel.eintraege.push({
      art: 'frei',
      name: w.material,
      menge: w.menge.menge,
      bemerkung: zusatz,
      lager: w.lager,
      platz: w.platz,
    });
    artikel += 1;
  }

  // 3. Kisten ohne eigenes Lager erben das häufigste Lager ihrer Positionen; ohne Positionen: Standard-Kiste.
  for (const [schluessel, kiste] of kisteJeName) {
    if (kiste.inhalt.length === 0) {
      kiste.standard = true;
      continue;
    }
    if (kiste.lager) continue;
    const haeufigkeit = new Map<string, number>();
    for (const w of werte) {
      if (!w.lager || behaelterSchluessel(w.ziel) !== schluessel) continue;
      haeufigkeit.set(w.lager, (haeufigkeit.get(w.lager) ?? 0) + 1);
    }
    const haeufigstes = [...haeufigkeit.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (haeufigstes) {
      kiste.lager = haeufigstes;
      merkeLager(haeufigstes, null);
    } else {
      warnungen.push(`Kiste „${kiste.name}“: kein Lager erkennbar.`);
    }
  }

  const zaehlung = { fahrzeuge: 0, wagen: 0, kisten: 0 };
  const zaehle = (liste: (PlanFrei | PlanKiste | PlanWagen)[]): void => {
    for (const e of liste) {
      if (e.art === 'kiste') zaehlung.kisten += 1;
      else if (e.art === 'wagen') {
        zaehlung.wagen += 1;
        zaehle(e.eintraege);
      }
    }
  };
  for (const einheit of einheiten) {
    if (einheit.typ === 'fahrzeug') zaehlung.fahrzeuge += 1;
    else zaehlung.wagen += 1;
    zaehle(einheit.eintraege);
  }
  if (einheiten.length > AUFBAU_GRENZEN.einheiten) {
    warnungen.push(
      `Mehr als ${AUFBAU_GRENZEN.einheiten} Einheiten; der Aufbau lässt sich so nicht speichern.`,
    );
  }
  for (const einheit of einheiten) {
    if (einheit.eintraege.length > AUFBAU_GRENZEN.eintraegeJeEinheit) {
      warnungen.push(
        `„${einheit.name}“ hat mehr als ${AUFBAU_GRENZEN.eintraegeJeEinheit} Einträge.`,
      );
    }
  }

  return {
    plan: { einheiten, lager: [...lagerPlaene.values()] },
    warnungen,
    zahlen: { ...zaehlung, artikel, positionen },
  };
}
