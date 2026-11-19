import {
  AUFBAU_GRENZEN,
  AufbauEinheit,
  AufbauEintrag,
  AufbauInhalt,
  AufbauKistenEintrag,
  AufbauKistenPosition,
  AufbauPhase,
} from '../models/aufbau.model';
import { Artikel, Kiste, Lager, STAMMDATEN_GRENZEN } from '../models/stammdaten.model';
import { lagerSchluessel } from './lager';
import { naechsteFarbe } from './aufbau-bearbeiten';
import { besterTreffer } from './name-abgleich';
import { istGueltigeMenge } from './stammdaten-pruefung';

/**
 * Tabellenfassung des Aufbaus für den Excel-Austausch: je Fahrzeug, Wagen, Eintrag und Kistenposition
 * eine Zeile. Die Datei lässt sich bearbeiten (Mengen, Namen, Lager, Phase, Bemerkung, Zeilen
 * ergänzen oder löschen) und wieder einlesen. Beides sind reine Funktionen; gespeichert wird erst,
 * wenn der Editor den eingelesenen Stand mit „Speichern“ sichert.
 *
 * Zuordnung beim Einlesen: Fahrzeug- und Wagenzeilen über die ID (damit Farbe, Foto und
 * Anweisung erhalten bleiben), alle anderen Zeilen über die Namen in den Spalten „Fahrzeug“ und
 * „Wagen“. Zeilen ohne ID sind neu; vorhandene Einträge, die in der Datei fehlen, entfallen.
 */

export const TABELLEN_KOPF = [
  'Ebene',
  'Fahrzeug',
  'Wagen',
  'Kiste',
  'Name',
  'Menge',
  'Maßeinheit',
  'Lager',
  'Platz',
  'Phase',
  'Bemerkung',
  'Standard-Kiste',
  'ID',
] as const;

export const EBENE = {
  fahrzeug: 'Fahrzeug',
  wagen: 'Wagen',
  artikel: 'Artikel',
  frei: 'Freier Artikel',
  kiste: 'Kiste',
  position: 'Kistenposition',
} as const;

export const PHASE_TEXT = { vorher: 'vorher', 'zum-schluss': 'zum Schluss' } as const;

/** Eine Zeile der Tabelle; `zeile` ist die Zeilennummer in Excel (nur beim Einlesen gesetzt). */
export interface AufbauTabellenZeile {
  zeile: number;
  ebene: string;
  fahrzeug: string;
  wagen: string;
  kiste: string;
  name: string;
  menge: string;
  masseinheit: string;
  lager: string;
  platz: string;
  phase: string;
  bemerkung: string;
  standard: string;
  id: string;
}

export interface TabellenStammdaten {
  lager: readonly Lager[];
  artikel: readonly Artikel[];
  /** Kisten der Stammdaten: eine Kiste ohne bekannte Verknüpfung wird über ihren Namen verlinkt. */
  kisten?: readonly Kiste[];
}

export interface AufbauEinlesen {
  inhalt: AufbauInhalt;
  /** Fachliche Hinweise mit Zeilennummer; die betroffene Zeile wurde angepasst oder übersprungen. */
  warnungen: string[];
}

export interface AufbauUnterschied {
  neu: number;
  entfernt: number;
  geaendert: number;
}

const leereZeile = (): AufbauTabellenZeile => ({
  zeile: 0,
  ebene: '',
  fahrzeug: '',
  wagen: '',
  kiste: '',
  name: '',
  menge: '',
  masseinheit: '',
  lager: '',
  platz: '',
  phase: '',
  bemerkung: '',
  standard: '',
  id: '',
});

const schluessel = (text: string): string => lagerSchluessel(text);
const bereinigt = (text: string): string => text.trim().replace(/\s+/g, ' ');

// ------------------------------------------------------------------------------------ Ausgabe

/** Leitet die Tabellenzeilen aus dem Aufbau ab (Reihenfolge wie im Editor). */
export function aufbauZuZeilen(
  inhalt: AufbauInhalt,
  daten: TabellenStammdaten,
): AufbauTabellenZeile[] {
  const lagerNachId = new Map(daten.lager.map((l) => [l.id, l]));
  const artikelNachId = new Map(daten.artikel.map((a) => [a.id, a]));
  const zeilen: AufbauTabellenZeile[] = [];

  const lagerText = (lagerId: string | null, platzId?: string) => {
    const lager = lagerId ? lagerNachId.get(lagerId) : undefined;
    return {
      lager: lager?.name ?? '',
      platz: (platzId && lager?.plaetze.find((p) => p.id === platzId)?.name) || '',
    };
  };
  const phaseText = (phase: AufbauPhase | null) => (phase ? PHASE_TEXT[phase] : '');

  const einheit = (e: AufbauEinheit, fahrzeug: AufbauEinheit | null): void => {
    zeilen.push({
      ...leereZeile(),
      ebene: e.typ === 'fahrzeug' ? EBENE.fahrzeug : EBENE.wagen,
      fahrzeug: e.typ === 'fahrzeug' ? e.name : (fahrzeug?.name ?? ''),
      wagen: e.typ === 'wagen' ? e.name : '',
      bemerkung: e.bemerkung,
      id: e.id,
    });
    const ort = {
      fahrzeug: e.typ === 'fahrzeug' ? e.name : (fahrzeug?.name ?? ''),
      wagen: e.typ === 'wagen' ? e.name : '',
    };
    for (const eintrag of e.inhalt) {
      if (eintrag.art === 'wagen') {
        einheit(eintrag.einheit, e);
      } else if (eintrag.art === 'artikel') {
        const artikel = artikelNachId.get(eintrag.artikelId);
        zeilen.push({
          ...leereZeile(),
          ...ort,
          ebene: EBENE.artikel,
          name: artikel?.name ?? '',
          menge: String(eintrag.menge),
          masseinheit: artikel?.einheit ?? '',
          ...lagerText(eintrag.lagerId, eintrag.platzId),
          phase: phaseText(eintrag.phase),
          bemerkung: eintrag.bemerkung,
          id: eintrag.id,
        });
      } else if (eintrag.art === 'frei') {
        zeilen.push({
          ...leereZeile(),
          ...ort,
          ebene: EBENE.frei,
          name: eintrag.name,
          menge: String(eintrag.menge),
          masseinheit: eintrag.einheit,
          ...lagerText(eintrag.lagerId, eintrag.platzId),
          phase: phaseText(eintrag.phase),
          bemerkung: eintrag.bemerkung,
          id: eintrag.id,
        });
      } else {
        zeilen.push({
          ...leereZeile(),
          ...ort,
          ebene: EBENE.kiste,
          name: eintrag.name,
          menge: String(eintrag.anzahl),
          ...lagerText(eintrag.lagerId, eintrag.platzId),
          phase: phaseText(eintrag.phase),
          standard: eintrag.standardInhalt === true ? 'ja' : '',
          id: eintrag.id,
        });
        for (const position of eintrag.inhalt) {
          const artikel = position.artikelId ? artikelNachId.get(position.artikelId) : undefined;
          zeilen.push({
            ...leereZeile(),
            ...ort,
            ebene: EBENE.position,
            kiste: eintrag.name,
            name: position.artikelId === null ? position.name : (artikel?.name ?? ''),
            menge: String(position.menge),
            masseinheit: position.artikelId === null ? position.einheit : (artikel?.einheit ?? ''),
            bemerkung: position.bemerkung,
            id: eintrag.id,
          });
        }
      }
    }
  };
  for (const e of inhalt.einheiten) einheit(e, null);
  return zeilen;
}

// ----------------------------------------------------------------------------------- Einlesen

interface Ziel {
  einheit: AufbauEinheit;
  /** Schlüssel des Fahrzeugs, in dem der Wagen steht; `null` für Fahrzeuge und freie Wagen. */
  elternSchluessel: string | null;
  eintraege: AufbauEintrag[];
}

interface KistenBau {
  eintrag: AufbauKistenEintrag;
  zielSchluessel: string;
  positionen: AufbauKistenPosition[];
}

const istLeer = (z: AufbauTabellenZeile): boolean =>
  [z.ebene, z.fahrzeug, z.wagen, z.kiste, z.name, z.menge, z.masseinheit, z.lager, z.platz]
    .concat([z.phase, z.bemerkung, z.standard, z.id])
    .every((s) => s.trim() === '');

function ebeneErkennen(text: string): keyof typeof EBENE | null {
  switch (schluessel(text)) {
    case 'fahrzeug':
      return 'fahrzeug';
    case 'wagen':
      return 'wagen';
    case 'artikel':
      return 'artikel';
    case 'freier artikel':
    case 'frei':
      return 'frei';
    case 'kiste':
      return 'kiste';
    case 'kistenposition':
    case 'position':
      return 'position';
    default:
      return null;
  }
}

/** Gleiche Werte, unabhängig von Schlüsselreihenfolge; `undefined` zählt als fehlend. */
function stabil(wert: unknown): string {
  return JSON.stringify(wert, (_schluessel, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Liest die Tabelle gegen den bisherigen Aufbau ein; fehlerhafte Zeilen führen zu Hinweisen, nie zum Abbruch. */
export function zeilenZuAufbau(
  zeilen: readonly AufbauTabellenZeile[],
  alt: AufbauInhalt,
  daten: TabellenStammdaten,
): AufbauEinlesen {
  const warnungen: string[] = [];
  const warne = (z: AufbauTabellenZeile, text: string): void => {
    warnungen.push(`Zeile ${z.zeile}: ${text}`);
  };

  const einheitenAlt = new Map<string, AufbauEinheit>();
  const eintraegeAlt = new Map<string, AufbauEintrag>();
  const wagenEintragIds = new Map<string, string>();
  const sammle = (e: AufbauEinheit): void => {
    einheitenAlt.set(e.id, e);
    for (const x of e.inhalt) {
      if (x.art === 'wagen') {
        wagenEintragIds.set(x.einheit.id, x.id);
        sammle(x.einheit);
      } else {
        eintraegeAlt.set(x.id, x);
      }
    }
  };
  alt.einheiten.forEach(sammle);

  const katalog = new Map<string, Artikel>();
  for (const a of daten.artikel)
    if (!katalog.has(schluessel(a.name))) katalog.set(schluessel(a.name), a);
  const lagerNachName = new Map<string, Lager>();
  for (const l of daten.lager)
    if (!lagerNachName.has(schluessel(l.name))) lagerNachName.set(schluessel(l.name), l);

  const eintraegeNachKleinId = new Map([...eintraegeAlt].map(([id, e]) => [id.toLowerCase(), e]));
  const einheitenNachKleinId = new Map([...einheitenAlt].map(([id, e]) => [id.toLowerCase(), e]));
  const benutzteIds = new Set<string>();
  const idFuer = (z: AufbauTabellenZeile, passt: (e: AufbauEintrag) => boolean): string => {
    const bekannt = eintraegeNachKleinId.get(z.id.trim().toLowerCase());
    if (bekannt && passt(bekannt) && !benutzteIds.has(bekannt.id)) {
      benutzteIds.add(bekannt.id);
      return bekannt.id;
    }
    return crypto.randomUUID();
  };
  const altZu = (z: AufbauTabellenZeile): AufbauEintrag | undefined => {
    return eintraegeNachKleinId.get(z.id.trim().toLowerCase());
  };

  const kuerze = (z: AufbauTabellenZeile, text: string, max: number, was: string): string => {
    if (text.length <= max) return text;
    warne(z, `${was} auf ${max} Zeichen gekürzt.`);
    return text.slice(0, max);
  };

  const menge = (z: AufbauTabellenZeile, vorgabe: number): number => {
    const roh = z.menge.trim().replace(',', '.');
    if (roh === '') {
      warne(z, `Menge fehlt – ${vorgabe} verwendet.`);
      return vorgabe;
    }
    const zahl = Number(roh);
    if (!istGueltigeMenge(zahl)) {
      warne(
        z,
        `Menge „${z.menge.trim()}“ ungültig (größer 0, höchstens drei Nachkommastellen) – ${vorgabe} verwendet.`,
      );
      return vorgabe;
    }
    return zahl;
  };
  const anzahl = (z: AufbauTabellenZeile, vorgabe: number): number => {
    const roh = z.menge.trim().replace(',', '.');
    const zahl = Number(roh);
    if (roh === '' || !Number.isInteger(zahl) || zahl < 1 || zahl > AUFBAU_GRENZEN.kistenAnzahl) {
      warne(
        z,
        `Anzahl „${z.menge.trim()}“ ungültig (ganze Zahl 1 bis ${AUFBAU_GRENZEN.kistenAnzahl}) – ${vorgabe} verwendet.`,
      );
      return vorgabe;
    }
    return zahl;
  };
  const phase = (z: AufbauTabellenZeile, vorgabe: AufbauPhase | null): AufbauPhase | null => {
    const s = schluessel(z.phase).replace('-', ' ');
    if (s === '') return null;
    if (s === 'vorher') return 'vorher';
    if (s === 'zum schluss') return 'zum-schluss';
    warne(
      z,
      `Phase „${z.phase.trim()}“ unbekannt (leer, vorher oder zum Schluss) – nicht geändert.`,
    );
    return vorgabe;
  };
  /** Lager und Platz einer Zeile; `ok: false` bei unbekannten Namen (dann gilt der bisherige Wert). */
  const ort = (
    z: AufbauTabellenZeile,
  ): { ok: boolean; lagerId: string | null; platzId?: string } => {
    const lagerName = schluessel(z.lager);
    if (lagerName === '') {
      if (schluessel(z.platz) !== '') warne(z, 'Platz ohne Lager ignoriert.');
      return { ok: true, lagerId: null };
    }
    const lager = lagerNachName.get(lagerName);
    if (!lager) {
      warne(z, `Lager „${z.lager.trim()}“ ist in den Stammdaten nicht vorhanden – nicht geändert.`);
      return { ok: false, lagerId: null };
    }
    const platzName = schluessel(z.platz);
    if (platzName === '') return { ok: true, lagerId: lager.id };
    const platz = lager.plaetze.find((p) => schluessel(p.name) === platzName);
    if (!platz) {
      warne(
        z,
        `Platz „${z.platz.trim()}“ gibt es im Lager „${lager.name}“ nicht – ohne Platz übernommen.`,
      );
      return { ok: true, lagerId: lager.id };
    }
    return { ok: true, lagerId: lager.id, platzId: platz.id };
  };

  // -- Einheiten
  const ziele = new Map<string, Ziel>();
  const obersteReihenfolge: string[] = [];
  const fahrzeugSchluessel = (name: string): string => `f|${schluessel(name)}`;
  const wagenSchluessel = (fahrzeug: string, wagen: string): string =>
    `w|${schluessel(fahrzeug)}|${schluessel(wagen)}`;
  const zielFuer = (z: AufbauTabellenZeile): string | null => {
    if (bereinigt(z.wagen) !== '') return wagenSchluessel(z.fahrzeug, z.wagen);
    if (bereinigt(z.fahrzeug) !== '') return fahrzeugSchluessel(z.fahrzeug);
    return null;
  };

  const benutzteEinheiten = new Set<string>();
  const neueEinheit = (
    z: AufbauTabellenZeile,
    typ: 'fahrzeug' | 'wagen',
    name: string,
    farbeVorgabe: string | null,
  ): AufbauEinheit => {
    const bekannt = einheitenNachKleinId.get(z.id.trim().toLowerCase());
    const bemerkung = kuerze(z, z.bemerkung.trim(), AUFBAU_GRENZEN.bemerkung, 'Bemerkung');
    if (bekannt && bekannt.typ === typ && !benutzteEinheiten.has(bekannt.id)) {
      benutzteEinheiten.add(bekannt.id);
      return { ...bekannt, name, bemerkung, inhalt: [] };
    }
    const bisher = {
      anweisungen: '',
      einheiten: [...ziele.values()]
        .filter((x) => x.elternSchluessel === null)
        .map((x) => x.einheit),
    };
    return {
      id: crypto.randomUUID(),
      typ,
      name,
      farbe: (farbeVorgabe as AufbauEinheit['farbe'] | null) ?? naechsteFarbe(bisher),
      anweisung: '',
      bemerkung,
      inhalt: [],
    };
  };

  // Fahrzeuge zuerst, damit Wagen ihr Fahrzeug finden, egal in welcher Zeilenfolge.
  for (const z of zeilen) {
    if (ebeneErkennen(z.ebene) !== 'fahrzeug') continue;
    const name = kuerze(z, bereinigt(z.fahrzeug), AUFBAU_GRENZEN.name, 'Name');
    if (name === '') {
      warne(z, 'Fahrzeug ohne Namen übersprungen.');
      continue;
    }
    const key = fahrzeugSchluessel(name);
    if (ziele.has(key)) {
      warne(z, `Fahrzeug „${name}“ kommt mehrfach vor – nur die erste Zeile gilt.`);
      continue;
    }
    ziele.set(key, {
      einheit: neueEinheit(z, 'fahrzeug', name, null),
      elternSchluessel: null,
      eintraege: [],
    });
    obersteReihenfolge.push(key);
  }
  for (const z of zeilen) {
    if (ebeneErkennen(z.ebene) !== 'wagen') continue;
    const name = kuerze(z, bereinigt(z.wagen), AUFBAU_GRENZEN.name, 'Name');
    if (name === '') {
      warne(z, 'Wagen ohne Namen übersprungen.');
      continue;
    }
    const fahrzeugName = bereinigt(z.fahrzeug);
    const eltern = fahrzeugName === '' ? null : fahrzeugSchluessel(fahrzeugName);
    if (eltern !== null && !ziele.has(eltern)) {
      warne(
        z,
        `Wagen „${name}“: Fahrzeug „${fahrzeugName}“ ist in der Datei nicht aufgeführt – übersprungen.`,
      );
      continue;
    }
    const key = wagenSchluessel(fahrzeugName, name);
    if (ziele.has(key)) {
      warne(z, `Wagen „${name}“ kommt mehrfach vor – nur die erste Zeile gilt.`);
      continue;
    }
    ziele.set(key, {
      einheit: neueEinheit(z, 'wagen', name, eltern ? ziele.get(eltern)!.einheit.farbe : null),
      elternSchluessel: eltern,
      eintraege: [],
    });
    if (eltern === null) obersteReihenfolge.push(key);
  }

  // -- Einträge in Zeilenfolge
  const kistenNachId = new Map<string, KistenBau>();
  const kistenListe: KistenBau[] = [];
  const positionsZeilen: AufbauTabellenZeile[] = [];
  const eingehaengt = new Set<string>();

  for (const z of zeilen) {
    if (istLeer(z)) continue;
    const ebene = ebeneErkennen(z.ebene);
    if (ebene === null) {
      warne(z, `Ebene „${z.ebene.trim()}“ unbekannt – Zeile übersprungen.`);
      continue;
    }
    if (ebene === 'fahrzeug') continue;
    if (ebene === 'wagen') {
      const eltern = bereinigt(z.fahrzeug) === '' ? null : fahrzeugSchluessel(z.fahrzeug);
      const key = wagenSchluessel(z.fahrzeug, z.wagen);
      const ziel = ziele.get(key);
      if (eltern !== null && ziel && ziel.elternSchluessel === eltern && !eingehaengt.has(key)) {
        eingehaengt.add(key);
        const bisherId = wagenEintragIds.get(ziel.einheit.id);
        ziele.get(eltern)?.eintraege.push({
          art: 'wagen',
          id: bisherId ?? crypto.randomUUID(),
          einheit: ziel.einheit,
        });
      }
      continue;
    }
    if (ebene === 'position') {
      positionsZeilen.push(z);
      continue;
    }
    const zielKey = zielFuer(z);
    const ziel = zielKey ? ziele.get(zielKey) : undefined;
    if (!ziel) {
      warne(
        z,
        zielKey
          ? 'Fahrzeug beziehungsweise Wagen ist in der Datei nicht aufgeführt – Zeile übersprungen.'
          : 'Weder Fahrzeug noch Wagen angegeben – Zeile übersprungen.',
      );
      continue;
    }
    const name = bereinigt(z.name);
    if (name === '') {
      warne(z, 'Name fehlt – Zeile übersprungen.');
      continue;
    }
    const vorher = altZu(z);

    if (ebene === 'kiste') {
      const bisher = vorher?.art === 'kiste' ? vorher : undefined;
      const o = ort(z);
      const lagerId = o.ok ? o.lagerId : (bisher?.lagerId ?? null);
      const platz = o.ok ? o.platzId : bisher?.platzId;
      const eintrag: AufbauKistenEintrag = {
        art: 'kiste',
        id: idFuer(z, (e) => e.art === 'kiste'),
        kisteId: bisher?.kisteId ?? besterTreffer(name, daten.kisten ?? [])?.id ?? null,
        name: kuerze(z, name, AUFBAU_GRENZEN.name, 'Name'),
        lagerId,
        ...(platz && lagerId && { platzId: platz }),
        anzahl: anzahl(z, bisher?.anzahl ?? 1),
        inhalt: [],
        ...(schluessel(z.standard) === 'ja' && { standardInhalt: true }),
        phase: phase(z, bisher?.phase ?? null),
      };
      const bau: KistenBau = { eintrag, zielSchluessel: zielKey!, positionen: [] };
      kistenListe.push(bau);
      if (!kistenNachId.has(eintrag.id)) kistenNachId.set(eintrag.id, bau);
      ziel.eintraege.push(eintrag);
      continue;
    }

    // Artikel oder freier Artikel
    const bisher =
      vorher && (vorher.art === 'artikel' || vorher.art === 'frei') ? vorher : undefined;
    const o = ort(z);
    const bisherLager = bisher?.lagerId ?? null;
    const bisherPlatz = bisher?.platzId;
    const artikel = ebene === 'artikel' ? katalog.get(schluessel(name)) : undefined;
    if (ebene === 'artikel' && !artikel) {
      warne(z, `Artikel „${name}“ steht nicht im Katalog – als freier Artikel übernommen.`);
    }
    const lagerId = o.ok
      ? (o.lagerId ?? (bisher ? null : (artikel?.lagerId ?? null)))
      : bisherLager;
    const platz = o.ok
      ? (o.platzId ?? (bisher || o.lagerId ? undefined : (artikel?.platzId ?? undefined)))
      : bisherPlatz;
    const gemeinsam = {
      id: idFuer(z, (e) => e.art === 'artikel' || e.art === 'frei'),
      menge: menge(z, bisher?.menge ?? 1),
      bemerkung: kuerze(z, z.bemerkung.trim(), AUFBAU_GRENZEN.bemerkung, 'Bemerkung'),
      lagerId,
      ...(platz && lagerId && { platzId: platz }),
      phase: phase(z, bisher?.phase ?? null),
    };
    ziel.eintraege.push(
      artikel
        ? { art: 'artikel', ...gemeinsam, artikelId: artikel.id }
        : {
            art: 'frei',
            ...gemeinsam,
            name: kuerze(z, name, AUFBAU_GRENZEN.name, 'Name'),
            einheit: kuerze(z, z.masseinheit.trim(), AUFBAU_GRENZEN.einheit, 'Maßeinheit'),
          },
    );
  }

  // -- Kistenpositionen
  for (const z of positionsZeilen) {
    const zielKey = zielFuer(z);
    if (!zielKey || !ziele.has(zielKey)) {
      warne(
        z,
        'Fahrzeug beziehungsweise Wagen ist in der Datei nicht aufgeführt – Kistenposition übersprungen.',
      );
      continue;
    }
    const nachId = z.id.trim() === '' ? undefined : kistenNachId.get(altZu(z)?.id ?? z.id.trim());
    const kiste =
      nachId && nachId.zielSchluessel === zielKey
        ? nachId
        : kistenListe.find(
            (k) =>
              k.zielSchluessel === zielKey && schluessel(k.eintrag.name) === schluessel(z.kiste),
          );
    if (!kiste) {
      warne(
        z,
        `Kiste „${z.kiste.trim()}“ ist in dieser Einheit nicht aufgeführt – Kistenposition übersprungen.`,
      );
      continue;
    }
    const name = bereinigt(z.name);
    if (name === '') {
      warne(z, 'Name fehlt – Kistenposition übersprungen.');
      continue;
    }
    const bemerkung = kuerze(z, z.bemerkung.trim(), AUFBAU_GRENZEN.bemerkung, 'Bemerkung');
    const m = menge(z, 1);
    const artikel = katalog.get(schluessel(name));
    const vorhanden = artikel
      ? kiste.positionen.find((p) => p.artikelId === artikel.id)
      : undefined;
    if (vorhanden) {
      vorhanden.menge = Math.round((vorhanden.menge + m) * 1000) / 1000;
      warne(z, `Artikel „${name}“ steht in der Kiste mehrfach – Mengen zusammengezählt.`);
    } else if (artikel) {
      kiste.positionen.push({ artikelId: artikel.id, menge: m, bemerkung });
    } else {
      kiste.positionen.push({
        artikelId: null,
        name: kuerze(z, name, AUFBAU_GRENZEN.name, 'Name'),
        einheit: kuerze(z, z.masseinheit.trim(), AUFBAU_GRENZEN.einheit, 'Maßeinheit'),
        menge: m,
        bemerkung,
      });
    }
  }
  for (const k of kistenListe) {
    k.eintrag.inhalt = k.positionen;
    if (k.positionen.length > 0) delete k.eintrag.standardInhalt;
    if (k.positionen.length > STAMMDATEN_GRENZEN.kistenPositionen) {
      warnungen.push(
        `Kiste „${k.eintrag.name}“ hat mehr als ${STAMMDATEN_GRENZEN.kistenPositionen} Positionen.`,
      );
    }
  }

  // -- Zusammensetzen: Wagen tragen ihren Inhalt, Fahrzeuge ihre Wagen
  const baue = (key: string): AufbauEinheit => {
    const ziel = ziele.get(key)!;
    return {
      ...ziel.einheit,
      inhalt: ziel.eintraege.map((x) =>
        x.art === 'wagen' ? { ...x, einheit: baue(wagenSchluesselVon(x.einheit.id)) } : x,
      ),
    };
  };
  const wagenSchluesselVon = (einheitId: string): string =>
    [...ziele.entries()].find(([, z]) => z.einheit.id === einheitId)![0];
  const neu: AufbauInhalt = {
    anweisungen: alt.anweisungen,
    einheiten: obersteReihenfolge.map(baue),
  };
  return { inhalt: angleichen(neu, alt), warnungen };
}

/** Übernimmt für alles Unveränderte das Originalobjekt, damit nur echte Änderungen übrig bleiben. */
function angleichen(neu: AufbauInhalt, alt: AufbauInhalt): AufbauInhalt {
  const einheitenAlt = new Map<string, AufbauEinheit>();
  const eintraegeAlt = new Map<string, AufbauEintrag>();
  const sammle = (e: AufbauEinheit): void => {
    einheitenAlt.set(e.id, e);
    for (const x of e.inhalt) {
      if (x.art === 'wagen') {
        eintraegeAlt.set(x.id, x);
        sammle(x.einheit);
      } else eintraegeAlt.set(x.id, x);
    }
  };
  alt.einheiten.forEach(sammle);
  const gleich = (a: unknown, b: unknown): boolean => stabil(a) === stabil(b);
  const einheit = (e: AufbauEinheit): AufbauEinheit => {
    const inhalt = e.inhalt.map((x): AufbauEintrag => {
      if (x.art === 'wagen') {
        const wagen = { ...x, einheit: einheit(x.einheit) };
        const frueher = eintraegeAlt.get(x.id);
        return frueher && gleich(frueher, wagen) ? frueher : wagen;
      }
      const frueher = eintraegeAlt.get(x.id);
      return frueher && gleich(frueher, x) ? frueher : x;
    });
    const neuEinheit = { ...e, inhalt };
    const frueher = einheitenAlt.get(e.id);
    return frueher && gleich(frueher, neuEinheit) ? frueher : neuEinheit;
  };
  return { anweisungen: neu.anweisungen, einheiten: neu.einheiten.map(einheit) };
}

/** Zählt, was beim Einlesen neu hinzukommt, entfällt oder sich ändert (Einheiten und Einträge je Id). */
export function vergleicheAufbau(alt: AufbauInhalt, neu: AufbauInhalt): AufbauUnterschied {
  const erfasse = (inhalt: AufbauInhalt): Map<string, string> => {
    const karte = new Map<string, string>();
    const einheit = (e: AufbauEinheit): void => {
      karte.set(e.id, stabil({ ...e, inhalt: undefined }));
      for (const x of e.inhalt) {
        if (x.art === 'wagen') einheit(x.einheit);
        else karte.set(x.id, stabil(x));
      }
    };
    inhalt.einheiten.forEach(einheit);
    return karte;
  };
  const vorher = erfasse(alt);
  const nachher = erfasse(neu);
  let neuZahl = 0;
  let geaendert = 0;
  for (const [id, signatur] of nachher) {
    const frueher = vorher.get(id);
    if (frueher === undefined) neuZahl++;
    else if (frueher !== signatur) geaendert++;
  }
  const entfernt = [...vorher.keys()].filter((id) => !nachher.has(id)).length;
  return { neu: neuZahl, entfernt, geaendert };
}

/** Gleicher Aufbau inklusive Reihenfolge? */
export function istGleicherAufbau(a: AufbauInhalt, b: AufbauInhalt): boolean {
  return stabil(a) === stabil(b);
}
