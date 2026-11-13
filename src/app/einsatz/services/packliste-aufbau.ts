import { ABSCHNITT_FARBEN } from '../models/druck.model';
import {
  AUFBAU_GRENZEN,
  AufbauEinheit,
  AufbauEintrag,
  AufbauInhalt,
  AufbauKistenEintrag,
  AufbauKistenPosition,
} from '../models/aufbau.model';
import { PacklistePlan, PlanFrei, PlanKiste, PlanWagen } from './packliste-import';

/** Kennungen von Lager und Platz für einen Namen aus der Liste; `null`, wenn es dazu nichts gibt. */
export type LagerAufloesung = (
  lager: string | null,
  platz: string | null,
) => { lagerId: string | null; platzId: string | null };

function kuerzen(text: string, grenze: number): string {
  return text.length > grenze ? text.slice(0, grenze).trim() : text;
}

/**
 * Baut aus dem Plan den Inhalt einer Aufbau-Vorlage: jede oberste Einheit bekommt reihum eine Farbe, ein Wagen
 * im Fahrzeug erbt sie. Kisten ohne Positionen sind Standard-Kisten. Alles ist frei (ohne Katalog); die
 * Prüfung des Aufbaus (`istAufbauInhalt()`) gilt unverändert.
 */
export function baueAufbauInhalt(plan: PacklistePlan, aufloesen: LagerAufloesung): AufbauInhalt {
  const neueId = (): string => crypto.randomUUID();
  const ort = (lager: string | null, platz: string | null) => {
    const { lagerId, platzId } = aufloesen(lager, platz);
    return { lagerId, ...(lagerId && platzId ? { platzId } : {}) };
  };

  const frei = (e: PlanFrei): AufbauEintrag => ({
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
    const inhalt: AufbauKistenPosition[] = e.inhalt
      .slice(0, AUFBAU_GRENZEN.kistenPositionen)
      .map((p) => ({
        artikelId: null,
        name: kuerzen(p.name, AUFBAU_GRENZEN.name),
        einheit: '',
        menge: p.menge,
        bemerkung: kuerzen(p.bemerkung, AUFBAU_GRENZEN.bemerkung),
      }));
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
