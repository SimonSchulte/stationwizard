import {
  AUFBAU_GRENZEN,
  AufbauArtikelEintrag,
  AufbauEinheit,
  AufbauEintrag,
  AufbauFreierEintrag,
  AufbauInhalt,
  AufbauKistenEintrag,
  AufbauKistenPosition,
  AufbauPhase,
  EinheitTyp,
} from '../models/aufbau.model';
import { Artikel, Kiste } from '../models/stammdaten.model';
import { ABSCHNITT_FARBEN, AbschnittFarbe } from '../models/druck.model';

/**
 * Reine Änderungen am Aufbau (unveränderlich, jeweils ein neuer Inhalt). Der Editor ruft sie auf;
 * die Grenzen aus dem Vertrag prüft der Aufrufer über `istAufbauInhalt()`.
 */

export const LEERER_AUFBAU: AufbauInhalt = { anweisungen: '', einheiten: [] };

const neueId = (): string => crypto.randomUUID();

/** Alle Einheiten (auch Wagen in Fahrzeugen) flach, in Reihenfolge. */
export function alleEinheiten(inhalt: AufbauInhalt): AufbauEinheit[] {
  return inhalt.einheiten.flatMap((e) => [
    e,
    ...e.inhalt.flatMap((x) => (x.art === 'wagen' ? [x.einheit] : [])),
  ]);
}

export function findeEinheit(inhalt: AufbauInhalt, id: string): AufbauEinheit | undefined {
  return alleEinheiten(inhalt).find((e) => e.id === id);
}

/** Nächste Farbe der Palette, die noch keine oberste Einheit trägt (sonst reihum). */
export function naechsteFarbe(inhalt: AufbauInhalt): AbschnittFarbe {
  const belegt = new Set(inhalt.einheiten.map((e) => e.farbe));
  return (
    ABSCHNITT_FARBEN.find((f) => !belegt.has(f)) ??
    ABSCHNITT_FARBEN[inhalt.einheiten.length % ABSCHNITT_FARBEN.length]!
  );
}

function ersetzeEinheit(
  inhalt: AufbauInhalt,
  id: string,
  aendern: (e: AufbauEinheit) => AufbauEinheit,
): AufbauInhalt {
  const bearbeite = (e: AufbauEinheit): AufbauEinheit => {
    if (e.id === id) return aendern(e);
    let geaendert = false;
    const neuerInhalt = e.inhalt.map((x) => {
      if (x.art === 'wagen' && x.einheit.id === id) {
        geaendert = true;
        return { ...x, einheit: aendern(x.einheit) };
      }
      return x;
    });
    return geaendert ? { ...e, inhalt: neuerInhalt } : e;
  };
  return { ...inhalt, einheiten: inhalt.einheiten.map(bearbeite) };
}

export function einheitHinzufuegen(
  inhalt: AufbauInhalt,
  typ: EinheitTyp,
  name: string,
  inFahrzeugId: string | null = null,
): { inhalt: AufbauInhalt; id: string } {
  const einheit: AufbauEinheit = {
    id: neueId(),
    typ,
    name: name.trim() || (typ === 'fahrzeug' ? 'Fahrzeug' : 'Wagen'),
    // Ein Wagen im Fahrzeug startet in der Farbe des Fahrzeugs, bleibt aber frei wählbar.
    farbe:
      (typ === 'wagen' && inFahrzeugId ? findeEinheit(inhalt, inFahrzeugId)?.farbe : undefined) ??
      naechsteFarbe(inhalt),
    anweisung: '',
    bemerkung: '',
    inhalt: [],
  };
  if (typ === 'wagen' && inFahrzeugId) {
    const eintrag: AufbauEintrag = { art: 'wagen', id: neueId(), einheit };
    return {
      inhalt: ersetzeEinheit(inhalt, inFahrzeugId, (f) => ({
        ...f,
        inhalt: [...f.inhalt, eintrag],
      })),
      id: einheit.id,
    };
  }
  return { inhalt: { ...inhalt, einheiten: [...inhalt.einheiten, einheit] }, id: einheit.id };
}

export function einheitAendern(
  inhalt: AufbauInhalt,
  id: string,
  aenderung: Partial<Pick<AufbauEinheit, 'name' | 'farbe' | 'anweisung' | 'bemerkung' | 'foto'>>,
): AufbauInhalt {
  return ersetzeEinheit(inhalt, id, (e) => {
    const neu = { ...e, ...aenderung };
    if ('foto' in aenderung && aenderung.foto === undefined) delete neu.foto;
    return neu;
  });
}

export function einheitEntfernen(inhalt: AufbauInhalt, id: string): AufbauInhalt {
  return {
    ...inhalt,
    einheiten: inhalt.einheiten
      .filter((e) => e.id !== id)
      .map((e) => ({
        ...e,
        inhalt: e.inhalt.filter((x) => !(x.art === 'wagen' && x.einheit.id === id)),
      })),
  };
}

/** Kopiert den aktuellen Stand einer Stammdaten-Kiste als Momentaufnahme in die Einheit. */
export function kisteHinzufuegen(
  inhalt: AufbauInhalt,
  einheitId: string,
  kiste: Kiste,
  anzahl = 1,
): AufbauInhalt {
  const eintrag: AufbauKistenEintrag = {
    art: 'kiste',
    id: neueId(),
    kisteId: kiste.id,
    name: kiste.name,
    lagerId: kiste.lagerId,
    ...(kiste.platzId && { platzId: kiste.platzId }),
    anzahl: Math.min(Math.max(1, Math.round(anzahl)), AUFBAU_GRENZEN.kistenAnzahl),
    inhalt: kiste.inhalt.map((p) => ({ ...p })),
    phase: null,
  };
  return ersetzeEinheit(inhalt, einheitId, (e) => ({ ...e, inhalt: [...e.inhalt, eintrag] }));
}

/** Fügt einen Artikel mit Menge hinzu; das Lager ist vorerst das Heimatlager des Artikels. */
export function artikelHinzufuegen(
  inhalt: AufbauInhalt,
  einheitId: string,
  artikel: Artikel,
  menge = 1,
  bemerkung = '',
): AufbauInhalt {
  const eintrag: AufbauArtikelEintrag = {
    art: 'artikel',
    id: neueId(),
    artikelId: artikel.id,
    menge,
    bemerkung,
    lagerId: artikel.lagerId,
    ...(artikel.platzId && { platzId: artikel.platzId }),
    phase: null,
  };
  return ersetzeEinheit(inhalt, einheitId, (e) => ({ ...e, inhalt: [...e.inhalt, eintrag] }));
}

/** Fügt einen freien Artikel hinzu: Name und Einheit gehören dem Aufbau, nicht dem Katalog. */
export function freienArtikelHinzufuegen(
  inhalt: AufbauInhalt,
  einheitId: string,
  name: string,
  einheit: string,
  menge = 1,
  lagerId: string | null = null,
): AufbauInhalt {
  const eintrag: AufbauFreierEintrag = {
    art: 'frei',
    id: neueId(),
    name: name.trim().replace(/\s+/g, ' '),
    einheit: einheit.trim(),
    menge,
    bemerkung: '',
    lagerId,
    phase: null,
  };
  return ersetzeEinheit(inhalt, einheitId, (e) => ({ ...e, inhalt: [...e.inhalt, eintrag] }));
}

/** Fügt eine neue, leere Kiste ohne Bezug zu den Stammdaten hinzu. */
export function freieKisteHinzufuegen(
  inhalt: AufbauInhalt,
  einheitId: string,
  name: string,
  anzahl = 1,
): AufbauInhalt {
  const eintrag: AufbauKistenEintrag = {
    art: 'kiste',
    id: neueId(),
    kisteId: null,
    name: name.trim().replace(/\s+/g, ' '),
    lagerId: null,
    anzahl: Math.min(Math.max(1, Math.round(anzahl)), AUFBAU_GRENZEN.kistenAnzahl),
    inhalt: [],
    phase: null,
  };
  return ersetzeEinheit(inhalt, einheitId, (e) => ({ ...e, inhalt: [...e.inhalt, eintrag] }));
}

/** Macht aus einem freien Artikel einen Katalogartikel; Id, Menge, Bemerkung und Phase bleiben. */
export function freienArtikelVerknuepfen(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  artikel: Artikel,
): AufbauInhalt {
  return ersetzeEinheit(inhalt, einheitId, (e) => ({
    ...e,
    inhalt: e.inhalt.map((x): AufbauEintrag => {
      if (x.id !== eintragId || x.art !== 'frei') return x;
      return {
        art: 'artikel',
        id: x.id,
        artikelId: artikel.id,
        menge: x.menge,
        bemerkung: x.bemerkung,
        // Das gewählte Quelllager bleibt; ohne eins gilt das Heimatlager des Katalogartikels.
        lagerId: x.lagerId ?? artikel.lagerId,
        ...platzFuerVerknuepfung(x, artikel),
        phase: x.phase,
      };
    }),
  }));
}

/** Verknüpft eine freie Kistenposition mit einem Katalogartikel; ist er schon in der Kiste, addiert sich die Menge. */
export function freiePositionVerknuepfen(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  index: number,
  artikel: Artikel,
): AufbauInhalt {
  return kistePositionen(inhalt, einheitId, eintragId, (liste) => {
    const position = liste[index];
    if (!position || position.artikelId !== null) return liste;
    const verknuepft: AufbauKistenPosition = {
      artikelId: artikel.id,
      menge: position.menge,
      bemerkung: position.bemerkung,
    };
    const vorhanden = liste.findIndex((p, i) => i !== index && p.artikelId === artikel.id);
    if (vorhanden < 0) return liste.map((p, i) => (i === index ? verknuepft : p));
    return liste
      .map((p, i) => (i === vorhanden ? { ...p, menge: p.menge + verknuepft.menge } : p))
      .filter((_, i) => i !== index);
  });
}

/** Eine Stelle im Baum der Packliste (Zeile eines Fahrzeugs, Wagens oder einer Kiste). */
export interface BaumOrt {
  art: 'einheit' | 'kiste';
  /** Einheit-Id bei einer Einheit, Eintrag-Id bei einer Kiste. */
  id: string;
  /** Einheit, die die Zeile ist (Einheit) oder in der sie steht (Kiste). */
  einheitId: string;
  /** Oberste Einheit der Zeile. */
  wurzelId: string;
  tiefe: 0 | 1 | 2;
}

/**
 * Verschiebt eine Zeile der Packliste hinter `anker` (die Zeile davor nach dem Ablegen, `null`:
 * ganz nach oben). Eine **Kiste** wandert in die Einheit des Ankers, hinter dessen Kiste; ein
 * **Wagen im Fahrzeug** in das Fahrzeug des Ankers (nie in einen freien Wagen); ein **Fahrzeug oder
 * freier Wagen** ändert nur seinen Platz auf oberster Ebene und nimmt seinen Inhalt mit. Unzulässige
 * Ziele lassen den Inhalt unverändert.
 */
export function verschiebeImBaum(
  inhalt: AufbauInhalt,
  quelle: BaumOrt,
  anker: BaumOrt | null,
  ebene?: 'tiefer' | 'hoeher',
): AufbauInhalt {
  if (anker && anker.art === quelle.art && anker.id === quelle.id) return inhalt;
  if (quelle.art === 'kiste') return verschiebeKiste(inhalt, quelle, anker);
  if (quelle.tiefe === 0) {
    const frei = inhalt.einheiten.find((e) => e.id === quelle.id);
    if (ebene === 'tiefer' && frei?.typ === 'wagen') return wagenInFahrzeug(inhalt, frei, anker);
    return verschiebeObersteEinheit(inhalt, quelle, anker);
  }
  if (ebene === 'hoeher') return wagenHerausnehmen(inhalt, quelle, anker);
  return verschiebeWagen(inhalt, quelle, anker);
}

/** Stellt einen freien Wagen (samt Inhalt) als Wagen in das Fahrzeug des Ankers. */
function wagenInFahrzeug(
  inhalt: AufbauInhalt,
  wagen: AufbauEinheit,
  anker: BaumOrt | null,
): AufbauInhalt {
  const ziel = anker ? inhalt.einheiten.find((e) => e.id === anker.wurzelId) : undefined;
  if (!anker || !ziel || ziel.typ !== 'fahrzeug') return inhalt;
  const ohne: AufbauInhalt = {
    ...inhalt,
    einheiten: inhalt.einheiten.filter((e) => e.id !== wagen.id),
  };
  const eintrag: AufbauEintrag = { art: 'wagen', id: neueId(), einheit: wagen };
  return ersetzeEinheit(ohne, ziel.id, (e) => {
    const nach = e.inhalt.findIndex((x) => x.art === 'wagen' && x.einheit.id === anker.einheitId);
    const ersterWagen = e.inhalt.findIndex((x) => x.art === 'wagen');
    const index = nach >= 0 ? nach + 1 : ersterWagen >= 0 ? ersterWagen : e.inhalt.length;
    return { ...e, inhalt: [...e.inhalt.slice(0, index), eintrag, ...e.inhalt.slice(index)] };
  });
}

/** Macht einen Wagen im Fahrzeug zum freien Wagen auf oberster Ebene, hinter der Gruppe des Ankers. */
function wagenHerausnehmen(
  inhalt: AufbauInhalt,
  quelle: BaumOrt,
  anker: BaumOrt | null,
): AufbauInhalt {
  const wagen = findeEinheit(inhalt, quelle.id);
  if (!wagen || wagen.typ !== 'wagen') return inhalt;
  const ohne: AufbauInhalt = {
    ...inhalt,
    einheiten: inhalt.einheiten.map((e) => ({
      ...e,
      inhalt: e.inhalt.filter((x) => !(x.art === 'wagen' && x.einheit.id === quelle.id)),
    })),
  };
  const nach = anker ? ohne.einheiten.findIndex((e) => e.id === anker.wurzelId) : -1;
  const index = nach >= 0 ? nach + 1 : 0;
  return {
    ...ohne,
    einheiten: [...ohne.einheiten.slice(0, index), wagen, ...ohne.einheiten.slice(index)],
  };
}

function verschiebeKiste(
  inhalt: AufbauInhalt,
  quelle: BaumOrt,
  anker: BaumOrt | null,
): AufbauInhalt {
  const eintrag = findeEinheit(inhalt, quelle.einheitId)?.inhalt.find(
    (x) => x.id === quelle.id && x.art === 'kiste',
  );
  const zielId = anker?.einheitId ?? inhalt.einheiten[0]?.id;
  if (!eintrag || !zielId) return inhalt;
  const ohne = ersetzeEinheit(inhalt, quelle.einheitId, (e) => ({
    ...e,
    inhalt: e.inhalt.filter((x) => x.id !== quelle.id),
  }));
  return ersetzeEinheit(ohne, zielId, (e) => {
    const nach = anker?.art === 'kiste' ? e.inhalt.findIndex((x) => x.id === anker.id) : -1;
    const index = nach >= 0 ? nach + 1 : 0;
    return { ...e, inhalt: [...e.inhalt.slice(0, index), eintrag, ...e.inhalt.slice(index)] };
  });
}

function verschiebeObersteEinheit(
  inhalt: AufbauInhalt,
  quelle: BaumOrt,
  anker: BaumOrt | null,
): AufbauInhalt {
  if (anker?.wurzelId === quelle.id) return inhalt;
  const einheit = inhalt.einheiten.find((e) => e.id === quelle.id);
  if (!einheit) return inhalt;
  const rest = inhalt.einheiten.filter((e) => e.id !== quelle.id);
  const nach = anker ? rest.findIndex((e) => e.id === anker.wurzelId) : -1;
  const index = nach >= 0 ? nach + 1 : 0;
  return { ...inhalt, einheiten: [...rest.slice(0, index), einheit, ...rest.slice(index)] };
}

function verschiebeWagen(
  inhalt: AufbauInhalt,
  quelle: BaumOrt,
  anker: BaumOrt | null,
): AufbauInhalt {
  const ziel = anker ? inhalt.einheiten.find((e) => e.id === anker.wurzelId) : undefined;
  if (!anker || !ziel || ziel.typ !== 'fahrzeug' || anker.einheitId === quelle.id) return inhalt;
  const eintrag = inhalt.einheiten
    .flatMap((e) => e.inhalt)
    .find((x) => x.art === 'wagen' && x.einheit.id === quelle.id);
  if (!eintrag) return inhalt;
  const ohne: AufbauInhalt = {
    ...inhalt,
    einheiten: inhalt.einheiten.map((e) => ({
      ...e,
      inhalt: e.inhalt.filter((x) => x !== eintrag),
    })),
  };
  return ersetzeEinheit(ohne, ziel.id, (e) => {
    const nach = e.inhalt.findIndex((x) => x.art === 'wagen' && x.einheit.id === anker.einheitId);
    const ersterWagen = e.inhalt.findIndex((x) => x.art === 'wagen');
    const index = nach >= 0 ? nach + 1 : ersterWagen >= 0 ? ersterWagen : e.inhalt.length;
    return { ...e, inhalt: [...e.inhalt.slice(0, index), eintrag, ...e.inhalt.slice(index)] };
  });
}

/** Übernimmt Lager und Platz einer Änderung; der Platz fällt weg, wenn das Lager wechselt oder entfällt. */
function mitLagerUndPlatz<T extends { lagerId: string | null; platzId?: string }>(
  eintrag: T,
  aenderung: { lagerId?: string | null; platzId?: string | null },
): T {
  const { platzId: _alt, ...rest } = eintrag;
  const lagerId = aenderung.lagerId === undefined ? eintrag.lagerId : aenderung.lagerId;
  const platzId =
    aenderung.platzId !== undefined
      ? aenderung.platzId
      : lagerId === eintrag.lagerId
        ? (_alt ?? null)
        : null;
  return { ...rest, lagerId, ...(lagerId && platzId && { platzId }) } as T;
}

/** Platz bei der Übernahme eines freien Artikels in den Katalog: bleibt, solange das Quelllager bleibt. */
function platzFuerVerknuepfung(
  frei: { lagerId: string | null; platzId?: string },
  artikel: Artikel,
): { platzId?: string } {
  if (frei.lagerId) return frei.platzId ? { platzId: frei.platzId } : {};
  return artikel.platzId ? { platzId: artikel.platzId } : {};
}

export function eintragAendern(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  aenderung: {
    name?: string;
    menge?: number;
    bemerkung?: string;
    anzahl?: number;
    lagerId?: string | null;
    /** Platz im (neuen) Lager; ohne Angabe fällt der Platz weg, sobald das Lager wechselt. */
    platzId?: string | null;
    phase?: AufbauPhase | null;
    /** Standard-Kiste an- oder abschalten; angeschaltet wird nur bei leerem Inhalt. */
    standardInhalt?: boolean;
  },
): AufbauInhalt {
  return ersetzeEinheit(inhalt, einheitId, (e) => ({
    ...e,
    inhalt: e.inhalt.map((x) => {
      if (x.id !== eintragId || x.art === 'wagen') return x;
      if (x.art === 'frei') {
        return {
          ...mitLagerUndPlatz(x, aenderung),
          ...(aenderung.menge !== undefined && { menge: aenderung.menge }),
          ...(aenderung.bemerkung !== undefined && { bemerkung: aenderung.bemerkung }),
          ...(aenderung.phase !== undefined && { phase: aenderung.phase }),
        };
      }
      if (x.art === 'artikel') {
        return {
          ...mitLagerUndPlatz(x, aenderung),
          ...(aenderung.menge !== undefined && { menge: aenderung.menge }),
          ...(aenderung.bemerkung !== undefined && { bemerkung: aenderung.bemerkung }),
          ...(aenderung.phase !== undefined && { phase: aenderung.phase }),
        };
      }
      const { standardInhalt: _alt, ...ohneStandard } = x;
      const standard = aenderung.standardInhalt ?? _alt === true;
      return {
        ...mitLagerUndPlatz(ohneStandard, aenderung),
        ...(standard && x.inhalt.length === 0 && { standardInhalt: true }),
        ...(aenderung.name !== undefined &&
          aenderung.name.trim() !== '' && { name: aenderung.name.trim().replace(/\s+/g, ' ') }),
        ...(aenderung.anzahl !== undefined && { anzahl: aenderung.anzahl }),
        ...(aenderung.phase !== undefined && { phase: aenderung.phase }),
      };
    }),
  }));
}

function kistePositionen(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  aendern: (positionen: AufbauKistenPosition[]) => AufbauKistenPosition[],
): AufbauInhalt {
  return ersetzeEinheit(inhalt, einheitId, (e) => ({
    ...e,
    inhalt: e.inhalt.map((x) => {
      if (x.id !== eintragId || x.art !== 'kiste') return x;
      const { standardInhalt: _standard, ...ohneStandard } = x;
      const neu = aendern(x.inhalt);
      // Das Kennzeichen „Standard-Kiste“ gilt nur für eine leere Kiste und fällt mit dem ersten Inhalt weg.
      return {
        ...ohneStandard,
        ...(x.standardInhalt && neu.length === 0 && { standardInhalt: true }),
        inhalt: neu,
      };
    }),
  }));
}

/** Fügt einer Kiste im Aufbau eine Position hinzu; ein bereits enthaltener Katalogartikel zählt hoch. */
export function kistePositionHinzufuegen(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  position: AufbauKistenPosition,
): AufbauInhalt {
  return kistePositionen(inhalt, einheitId, eintragId, (liste) => {
    const vorhanden = position.artikelId
      ? liste.findIndex((p) => p.artikelId === position.artikelId)
      : -1;
    if (vorhanden < 0) return [...liste, position];
    return liste.map((p, i) => (i === vorhanden ? { ...p, menge: p.menge + position.menge } : p));
  });
}

export function kistePositionAendern(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  index: number,
  aenderung: { menge?: number; bemerkung?: string },
): AufbauInhalt {
  return kistePositionen(inhalt, einheitId, eintragId, (liste) =>
    liste.map((p, i) => (i === index ? { ...p, ...aenderung } : p)),
  );
}

export function kistePositionEntfernen(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  index: number,
): AufbauInhalt {
  return kistePositionen(inhalt, einheitId, eintragId, (liste) =>
    liste.filter((_, i) => i !== index),
  );
}

export function eintragEntfernen(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
): AufbauInhalt {
  return ersetzeEinheit(inhalt, einheitId, (e) => ({
    ...e,
    inhalt: e.inhalt.filter((x) => x.id !== eintragId),
  }));
}

/** Übernimmt den aktuellen Stand der Stammdaten-Kiste in die Momentaufnahme („Übernehmen“). */
export function kisteAbgleichen(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  kiste: Kiste,
): AufbauInhalt {
  return ersetzeEinheit(inhalt, einheitId, (e) => ({
    ...e,
    inhalt: e.inhalt.map((x) =>
      x.id === eintragId && x.art === 'kiste'
        ? {
            ...mitLagerUndPlatz(x, { lagerId: kiste.lagerId, platzId: kiste.platzId ?? null }),
            name: kiste.name,
            inhalt: kiste.inhalt.map((p) => ({ ...p })),
          }
        : x,
    ),
  }));
}

/** Kopie eines Inhalts mit durchweg neuen Ids (für Vorlagen anwenden und als Vorlage sichern). */
export function mitNeuenIds(inhalt: AufbauInhalt): AufbauInhalt {
  const kopiereEintrag = (x: AufbauEintrag): AufbauEintrag =>
    x.art === 'wagen'
      ? { ...x, id: neueId(), einheit: kopiereEinheit(x.einheit) }
      : structuredClone({ ...x, id: neueId() });
  const kopiereEinheit = (e: AufbauEinheit): AufbauEinheit => ({
    ...structuredClone({ ...e, inhalt: [] }),
    id: neueId(),
    inhalt: e.inhalt.map(kopiereEintrag),
  });
  return { anweisungen: inhalt.anweisungen, einheiten: inhalt.einheiten.map(kopiereEinheit) };
}

/** Kennzahlen wie der Worker sie setzt: Einheiten (auch Wagen), Kisten (nach Anzahl) und Positionen. */
export function zaehleAufbauInhalt(inhalt: AufbauInhalt): {
  einheiten: number;
  kisten: number;
  positionen: number;
} {
  let kisten = 0;
  let positionen = 0;
  const einheiten = alleEinheiten(inhalt);
  for (const e of einheiten) {
    for (const x of e.inhalt) {
      if (x.art === 'kiste') {
        kisten += x.anzahl;
        positionen += x.inhalt.length;
      } else if (x.art === 'artikel' || x.art === 'frei') {
        positionen += 1;
      }
    }
  }
  return { einheiten: einheiten.length, kisten, positionen };
}
