import { ABSCHNITT_FARBEN } from '../models/druck.model';
import {
  AUFBAU_GRENZEN,
  AufbauEinheit,
  AufbauEintrag,
  AufbauInhalt,
  AufbauKistenEintrag,
  AufbauKistenPosition,
} from '../models/aufbau.model';
import { Artikel, Kiste } from '../models/stammdaten.model';
import { PacklistePlan, PlanFrei, PlanKiste, PlanWagen } from './packliste-import';

/** Kennungen von Lager und Platz für einen Namen aus der Liste; `null`, wenn es dazu nichts gibt. */
export type LagerAufloesung = (
  lager: string | null,
  platz: string | null,
) => { lagerId: string | null; platzId: string | null };

/** Katalogartikel für eine Zeile der Liste; `undefined`: der Artikel bleibt frei. */
export type ArtikelZuordnung = (zeile: number, name: string) => Artikel | undefined;

/** Kiste aus dem Bestand, in der ein loser Artikel liegt; `undefined`: der Artikel bleibt lose. */
export type KistenZuordnung = (zeile: number) => Kiste | undefined;

/** Ein gefundener Artikel (eine Zeile der Liste) für die Zuordnung. */
export interface GefundenerArtikel {
  zeile: number;
  name: string;
  menge: number;
  /** Lagerort laut Liste, etwa „Kaltlager · Spinde“; leer ohne Angabe. */
  ort: string;
  /** Hinweis auf eine Kiste aus dem Lagerort („Kaltlager, Alu-Kiste“); `null` ohne. */
  kisteHinweis: string | null;
  /** Position in einer Kiste der Liste: eine Kiste aus dem Bestand ist dafür nicht wählbar. */
  inListenKiste: boolean;
}

/** Alle gefundenen Artikel des Plans in der Reihenfolge der Liste, je Zeile einer. */
export function sammleArtikel(plan: PacklistePlan): GefundenerArtikel[] {
  const liste: GefundenerArtikel[] = [];
  const eintraege = (alle: (PlanFrei | PlanKiste | PlanWagen)[]): void => {
    for (const e of alle) {
      if (e.art === 'frei') {
        liste.push({
          zeile: e.zeile,
          name: e.name,
          menge: e.menge,
          ort: [e.lager, e.platz].filter((t) => t).join(' · '),
          kisteHinweis: e.kisteHinweis,
          inListenKiste: false,
        });
      } else if (e.art === 'kiste') {
        e.inhalt.forEach((p) =>
          liste.push({
            zeile: p.zeile,
            name: p.name,
            menge: p.menge,
            ort: e.name,
            kisteHinweis: null,
            inListenKiste: true,
          }),
        );
      } else eintraege(e.eintraege);
    }
  };
  plan.einheiten.forEach((einheit) => eintraege(einheit.eintraege));
  return liste.sort((a, b) => a.zeile - b.zeile);
}

function kuerzen(text: string, grenze: number): string {
  return text.length > grenze ? text.slice(0, grenze).trim() : text;
}

/**
 * Baut aus dem Plan den Inhalt einer Aufbau-Vorlage: jede oberste Einheit bekommt reihum eine Farbe, ein Wagen
 * im Fahrzeug erbt sie. Kisten ohne Positionen sind Standard-Kisten. Alles ist frei (ohne Katalog); die
 * Prüfung des Aufbaus (`istAufbauInhalt()`) gilt unverändert. Ordnet `artikelZuordnen` einem Namen einen
 * Katalogartikel zu, wird daraus ein Katalogeintrag (lose: Lager der Liste, sonst Heimatlager des Artikels;
 * in einer Kiste: eine Katalogposition, gleiche Artikel einer Kiste addieren sich). Ordnet `kisteZuordnen` einem
 * losen Artikel eine Kiste aus dem Bestand zu, liegt er als Position in dieser Kiste (eine Momentaufnahme je
 * Einheit, mit dem Inhalt der Stammdaten).
 */
export function baueAufbauInhalt(
  plan: PacklistePlan,
  aufloesen: LagerAufloesung,
  artikelZuordnen: ArtikelZuordnung = () => undefined,
  kisteZuordnen: KistenZuordnung = () => undefined,
  kisteNachName: (name: string) => Kiste | undefined = () => undefined,
): AufbauInhalt {
  const neueId = (): string => crypto.randomUUID();
  const ort = (lager: string | null, platz: string | null) => {
    const { lagerId, platzId } = aufloesen(lager, platz);
    return { lagerId, ...(lagerId && platzId ? { platzId } : {}) };
  };

  /** Fügt eine Position hinzu: Katalogartikel je Kiste nur einmal (Mengen addieren), sonst frei. */
  const positionHinzu = (
    inhalt: AufbauKistenPosition[],
    zeile: number,
    name: string,
    menge: number,
    bemerkungRoh: string,
  ): void => {
    const artikel = artikelZuordnen(zeile, name);
    const bemerkung = kuerzen(bemerkungRoh, AUFBAU_GRENZEN.bemerkung);
    if (!artikel) {
      inhalt.push({
        artikelId: null,
        name: kuerzen(name, AUFBAU_GRENZEN.name),
        einheit: '',
        menge,
        bemerkung,
      });
      return;
    }
    const vorhanden = inhalt.findIndex((x) => x.artikelId === artikel.id);
    const bisher = inhalt[vorhanden];
    if (bisher) {
      inhalt[vorhanden] = {
        artikelId: artikel.id,
        menge: Math.round((bisher.menge + menge) * 1000) / 1000,
        bemerkung: kuerzen(
          [bisher.bemerkung, bemerkung].filter((t) => t !== '').join('; '),
          AUFBAU_GRENZEN.bemerkung,
        ),
      };
    } else {
      inhalt.push({ artikelId: artikel.id, menge, bemerkung });
    }
  };

  /** Inhalt einer Einheit; lose Artikel mit Kiste aus dem Bestand wandern in deren Momentaufnahme. */
  const eintraegeVon = (quellen: (PlanFrei | PlanKiste | PlanWagen)[]): AufbauEintrag[] => {
    const liste: AufbauEintrag[] = [];
    const kistenJeId = new Map<string, AufbauKistenEintrag>();
    for (const x of quellen) {
      const kisteAusBestand = x.art === 'frei' ? kisteZuordnen(x.zeile) : undefined;
      if (x.art === 'frei' && kisteAusBestand) {
        let eintrag = kistenJeId.get(kisteAusBestand.id);
        if (!eintrag) {
          const { lagerId, platzId } = aufloesen(x.lager, x.platz);
          const ziel = lagerId
            ? { lagerId, ...(platzId ? { platzId } : {}) }
            : {
                lagerId: kisteAusBestand.lagerId,
                ...(kisteAusBestand.platzId ? { platzId: kisteAusBestand.platzId } : {}),
              };
          eintrag = {
            art: 'kiste',
            id: neueId(),
            kisteId: kisteAusBestand.id,
            name: kuerzen(kisteAusBestand.name, AUFBAU_GRENZEN.name),
            ...ziel,
            anzahl: 1,
            inhalt: kisteAusBestand.inhalt.map((p) => ({ ...p })),
            phase: null,
          };
          kistenJeId.set(kisteAusBestand.id, eintrag);
          liste.push(eintrag);
        }
        positionHinzu(eintrag.inhalt, x.zeile, x.name, x.menge, x.bemerkung);
        eintrag.inhalt.splice(AUFBAU_GRENZEN.kistenPositionen);
      } else {
        liste.push(x.art === 'wagen' ? wagenEintrag(x) : x.art === 'kiste' ? kiste(x) : frei(x));
      }
    }
    return liste;
  };

  const frei = (e: PlanFrei): AufbauEintrag => {
    const artikel = artikelZuordnen(e.zeile, e.name);
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
    for (const p of e.inhalt) positionHinzu(inhalt, p.zeile, p.name, p.menge, p.bemerkung);
    inhalt.splice(AUFBAU_GRENZEN.kistenPositionen);
    return {
      art: 'kiste',
      id: neueId(),
      kisteId: kisteNachName(e.name)?.id ?? null,
      name: kuerzen(e.name, AUFBAU_GRENZEN.name),
      ...ort(e.lager, e.platz),
      anzahl: e.anzahl,
      inhalt,
      ...(e.standard && inhalt.length === 0 ? { standardInhalt: true } : {}),
      phase: null,
    };
  };

  let aktuelleFarbe: AufbauEinheit['farbe'] = 'abschnitt-1';
  const wagenEintrag = (e: PlanWagen): AufbauEintrag => wagen(e, aktuelleFarbe);
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
      inhalt: eintraegeVon(e.eintraege),
    },
  });

  const einheiten: AufbauEinheit[] = plan.einheiten.map((einheit, index) => {
    const farbe = ABSCHNITT_FARBEN[index % ABSCHNITT_FARBEN.length]!;
    aktuelleFarbe = farbe;
    return {
      id: neueId(),
      typ: einheit.typ,
      name: kuerzen(einheit.name, AUFBAU_GRENZEN.name),
      farbe,
      anweisung: '',
      bemerkung: '',
      inhalt: eintraegeVon(einheit.eintraege),
    };
  });
  return { anweisungen: '', einheiten };
}
