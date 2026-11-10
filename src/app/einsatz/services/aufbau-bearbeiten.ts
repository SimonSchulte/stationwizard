import {
  AUFBAU_GRENZEN,
  AufbauArtikelEintrag,
  AufbauEinheit,
  AufbauEintrag,
  AufbauFreierEintrag,
  AufbauInhalt,
  AufbauKistenEintrag,
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
    farbe: naechsteFarbe(inhalt),
    anweisung: '',
    bemerkung: '',
    inhalt: [],
  };
  if (typ === 'wagen' && inFahrzeugId) {
    const eintrag: AufbauEintrag = { art: 'wagen', id: neueId(), einheit };
    // Ein Wagen im Fahrzeug erbt die Farbe des Fahrzeugs beim Druck; die eigene wird nicht gezeigt.
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
): AufbauInhalt {
  const eintrag: AufbauFreierEintrag = {
    art: 'frei',
    id: neueId(),
    name: name.trim().replace(/\s+/g, ' '),
    einheit: einheit.trim(),
    menge,
    bemerkung: '',
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

export function eintragAendern(
  inhalt: AufbauInhalt,
  einheitId: string,
  eintragId: string,
  aenderung: {
    menge?: number;
    bemerkung?: string;
    anzahl?: number;
    lagerId?: string | null;
    phase?: AufbauPhase | null;
  },
): AufbauInhalt {
  return ersetzeEinheit(inhalt, einheitId, (e) => ({
    ...e,
    inhalt: e.inhalt.map((x) => {
      if (x.id !== eintragId || x.art === 'wagen') return x;
      if (x.art === 'frei') {
        return {
          ...x,
          ...(aenderung.menge !== undefined && { menge: aenderung.menge }),
          ...(aenderung.bemerkung !== undefined && { bemerkung: aenderung.bemerkung }),
          ...(aenderung.phase !== undefined && { phase: aenderung.phase }),
        };
      }
      if (x.art === 'artikel') {
        return {
          ...x,
          ...(aenderung.menge !== undefined && { menge: aenderung.menge }),
          ...(aenderung.bemerkung !== undefined && { bemerkung: aenderung.bemerkung }),
          ...(aenderung.lagerId !== undefined && { lagerId: aenderung.lagerId }),
          ...(aenderung.phase !== undefined && { phase: aenderung.phase }),
        };
      }
      return {
        ...x,
        ...(aenderung.anzahl !== undefined && { anzahl: aenderung.anzahl }),
        ...(aenderung.phase !== undefined && { phase: aenderung.phase }),
      };
    }),
  }));
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
            ...x,
            name: kiste.name,
            lagerId: kiste.lagerId,
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
