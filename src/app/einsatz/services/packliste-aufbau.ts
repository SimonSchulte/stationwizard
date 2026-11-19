import { ABSCHNITT_FARBEN } from '../models/druck.model';
import {
  AUFBAU_GRENZEN,
  AufbauEinheit,
  AufbauEintrag,
  AufbauInhalt,
  AufbauKistenEintrag,
  AufbauKistenPosition,
} from '../models/aufbau.model';
import { Artikel } from '../models/stammdaten.model';
import { lagerSchluessel } from './lager';
import { PacklistePlan, PlanFrei, PlanKiste, PlanWagen } from './packliste-import';

/** Kennungen von Lager und Platz für einen Namen aus der Liste; `null`, wenn es dazu nichts gibt. */
export type LagerAufloesung = (
  lager: string | null,
  platz: string | null,
) => { lagerId: string | null; platzId: string | null };

/** Katalogartikel für einen Namen aus der Liste; `undefined`: der Artikel bleibt frei. */
export type ArtikelZuordnung = (name: string) => Artikel | undefined;

/** Ein Artikelname der Liste mit der Zahl seiner Vorkommen (lose und in Kisten). */
export interface GefundenerArtikel {
  schluessel: string;
  name: string;
  vorkommen: number;
}

/** Alle Artikelnamen des Plans, je Vergleichsform einmal, in der Reihenfolge des ersten Vorkommens. */
export function sammleArtikelNamen(plan: PacklistePlan): GefundenerArtikel[] {
  const liste = new Map<string, GefundenerArtikel>();
  const merke = (name: string): void => {
    const schluessel = lagerSchluessel(name);
    const bisher = liste.get(schluessel);
    if (bisher) bisher.vorkommen += 1;
    else liste.set(schluessel, { schluessel, name, vorkommen: 1 });
  };
  const eintraege = (alle: (PlanFrei | PlanKiste | PlanWagen)[]): void => {
    for (const e of alle) {
      if (e.art === 'frei') merke(e.name);
      else if (e.art === 'kiste') e.inhalt.forEach((p) => merke(p.name));
      else eintraege(e.eintraege);
    }
  };
  plan.einheiten.forEach((einheit) => eintraege(einheit.eintraege));
  return [...liste.values()];
}

function kuerzen(text: string, grenze: number): string {
  return text.length > grenze ? text.slice(0, grenze).trim() : text;
}

/**
 * Baut aus dem Plan den Inhalt einer Aufbau-Vorlage: jede oberste Einheit bekommt reihum eine Farbe, ein Wagen
 * im Fahrzeug erbt sie. Kisten ohne Positionen sind Standard-Kisten. Alles ist frei (ohne Katalog); die
 * Prüfung des Aufbaus (`istAufbauInhalt()`) gilt unverändert. Ordnet `artikelZuordnen` einem Namen einen
 * Katalogartikel zu, wird daraus ein Katalogeintrag (lose: Lager der Liste, sonst Heimatlager des Artikels;
 * in einer Kiste: eine Katalogposition, gleiche Artikel einer Kiste addieren sich).
 */
export function baueAufbauInhalt(
  plan: PacklistePlan,
  aufloesen: LagerAufloesung,
  artikelZuordnen: ArtikelZuordnung = () => undefined,
): AufbauInhalt {
  const neueId = (): string => crypto.randomUUID();
  const ort = (lager: string | null, platz: string | null) => {
    const { lagerId, platzId } = aufloesen(lager, platz);
    return { lagerId, ...(lagerId && platzId ? { platzId } : {}) };
  };

  const frei = (e: PlanFrei): AufbauEintrag => {
    const artikel = artikelZuordnen(e.name);
    if (artikel) {
      const { lagerId, platzId } = aufloesen(e.lager, e.platz);
      const ziel = lagerId
        ? { lagerId, ...(platzId ? { platzId } : {}) }
        : { lagerId: artikel.lagerId, ...(artikel.platzId ? { platzId: artikel.platzId } : {}) };
      return {
        art: 'artikel',
        id: neueId(),
        artikelId: artikel.id,
        menge: e.menge,
        bemerkung: kuerzen(e.bemerkung, AUFBAU_GRENZEN.bemerkung),
        ...ziel,
        phase: null,
      };
    }
    return freierEintrag(e);
  };

  const freierEintrag = (e: PlanFrei): AufbauEintrag => ({
    art: 'frei',
    id: neueId(),
    name: kuerzen(e.name, AUFBAU_GRENZEN.name),
    einheit: '',
    menge: e.menge,
    bemerkung: kuerzen(e.bemerkung, AUFBAU_GRENZEN.bemerkung),
    ...ort(e.lager, e.platz),
    phase: null,
  });

  const kiste = (e: PlanKiste): AufbauKistenEintrag => {
    const inhalt: AufbauKistenPosition[] = [];
    for (const p of e.inhalt) {
      const artikel = artikelZuordnen(p.name);
      const bemerkung = kuerzen(p.bemerkung, AUFBAU_GRENZEN.bemerkung);
      if (!artikel) {
        inhalt.push({
          artikelId: null,
          name: kuerzen(p.name, AUFBAU_GRENZEN.name),
          einheit: '',
          menge: p.menge,
          bemerkung,
        });
        continue;
      }
      // Ein Katalogartikel steht je Kiste nur einmal: Mengen addieren, Bemerkungen zusammenführen.
      const vorhanden = inhalt.findIndex((x) => x.artikelId === artikel.id);
      const bisher = inhalt[vorhanden];
      if (bisher) {
        inhalt[vorhanden] = {
          artikelId: artikel.id,
          menge: Math.round((bisher.menge + p.menge) * 1000) / 1000,
          bemerkung: kuerzen(
            [bisher.bemerkung, bemerkung].filter((t) => t !== '').join('; '),
            AUFBAU_GRENZEN.bemerkung,
          ),
        };
      } else {
        inhalt.push({ artikelId: artikel.id, menge: p.menge, bemerkung });
      }
    }
    inhalt.splice(AUFBAU_GRENZEN.kistenPositionen);
    return {
      art: 'kiste',
      id: neueId(),
      kisteId: null,
      name: kuerzen(e.name, AUFBAU_GRENZEN.name),
      ...ort(e.lager, e.platz),
      anzahl: e.anzahl,
      inhalt,
      ...(e.standard && inhalt.length === 0 ? { standardInhalt: true } : {}),
      phase: null,
    };
  };

  const wagen = (e: PlanWagen, farbe: AufbauEinheit['farbe']): AufbauEintrag => ({
    art: 'wagen',
    id: neueId(),
    einheit: {
      id: neueId(),
      typ: 'wagen',
      name: kuerzen(e.name, AUFBAU_GRENZEN.name),
      farbe,
      anweisung: '',
      bemerkung: '',
      inhalt: e.eintraege.map((x) => (x.art === 'kiste' ? kiste(x) : frei(x))),
    },
  });

  const einheiten: AufbauEinheit[] = plan.einheiten.map((einheit, index) => {
    const farbe = ABSCHNITT_FARBEN[index % ABSCHNITT_FARBEN.length]!;
    return {
      id: neueId(),
      typ: einheit.typ,
      name: kuerzen(einheit.name, AUFBAU_GRENZEN.name),
      farbe,
      anweisung: '',
      bemerkung: '',
      inhalt: einheit.eintraege.map((x) =>
        x.art === 'wagen' ? wagen(x, farbe) : x.art === 'kiste' ? kiste(x) : frei(x),
      ),
    };
  });
  return { anweisungen: '', einheiten };
}
