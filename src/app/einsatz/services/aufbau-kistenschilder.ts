import {
  AufbauEinheit,
  AufbauInhalt,
  AufbauKistenPosition,
  istStandardKiste,
} from '../models/aufbau.model';
import { Artikel, Lager } from '../models/stammdaten.model';
import { DruckAbschnitt, DruckLaufzettel, DruckPosition } from '../models/druck.model';
import { Kistenschild, mengeText, schildZeile } from './kisten-pdf-definition';
import { abschnittFarbeHex } from './zettel-pdf-definition';

/**
 * Kistenschilder aus dem Aufbau: ein Schild je physischer Kiste (`anzahl` Kopien), mit dem Inhalt der
 * Momentaufnahme im Aufbau und dem Rahmen in der Farbe der Einheit, in der die Kiste steht. Reine Berechnung.
 */

/** Zeile auf einem Packzettel ohne Soll-Inhalt: die Kiste lässt sich so nicht kontrollieren. */
export const KEIN_SOLL_INHALT = 'Kein Soll-Inhalt hinterlegt';
export const STANDARD_INHALT = 'Standardbestückung – nach Kistenbeschriftung kontrollieren';

export interface KistenschildStammdaten {
  lager: readonly Lager[];
  artikel: readonly Artikel[];
}

function positionsZeile(p: AufbauKistenPosition, artikel: ReadonlyMap<string, Artikel>): string {
  if (p.artikelId === null) return schildZeile(p);
  const stamm = artikel.get(p.artikelId);
  return schildZeile({
    name: stamm?.name ?? '(Artikel fehlt)',
    einheit: stamm?.einheit ?? 'Stück',
    menge: p.menge,
    bemerkung: p.bemerkung,
  });
}

/** „Kaltlager · Regal“: Lager mit Platz, soweit der Platz im Lager noch geführt wird. */
function lagerMitPlatz(
  lager: ReadonlyMap<string, Lager>,
  lagerId: string | null,
  platzId: string | undefined,
): string {
  const eintrag = lagerId ? lager.get(lagerId) : undefined;
  if (!eintrag) return '';
  const platz = platzId ? eintrag.plaetze.find((p) => p.id === platzId) : undefined;
  return platz ? `${eintrag.name} · ${platz.name}` : eintrag.name;
}

export function schilderAusAufbau(
  inhalt: AufbauInhalt,
  daten: KistenschildStammdaten,
): Kistenschild[] {
  const lager = new Map(daten.lager.map((l) => [l.id, l]));
  const artikel = new Map(daten.artikel.map((a) => [a.id, a]));
  const schilder: Kistenschild[] = [];
  const sammle = (einheit: AufbauEinheit, rahmenFarbe: string): void => {
    for (const eintrag of einheit.inhalt) {
      if (eintrag.art === 'wagen') {
        sammle(eintrag.einheit, abschnittFarbeHex(eintrag.einheit.farbe));
      } else if (eintrag.art === 'kiste') {
        const schild: Kistenschild = {
          titel: eintrag.name,
          heimatlager: lagerMitPlatz(lager, eintrag.lagerId, eintrag.platzId),
          zeilen: eintrag.inhalt.map((p) => positionsZeile(p, artikel)),
          rahmenFarbe,
        };
        for (let i = 0; i < eintrag.anzahl; i++) schilder.push(schild);
      }
    }
  };
  for (const einheit of inhalt.einheiten) sammle(einheit, abschnittFarbeHex(einheit.farbe));
  return schilder;
}

/** Soll-Inhalt einer Kiste als Abhakliste; eine leere Kiste nennt das ausdrücklich, statt leer zu bleiben. */
function sollPositionen(
  inhalt: readonly AufbauKistenPosition[],
  idPrefix: string,
  artikel: ReadonlyMap<string, Artikel>,
  standard = false,
): DruckPosition[] {
  if (inhalt.length === 0 && standard) {
    return [
      {
        id: `${idPrefix}:standard`,
        herkunftId: null,
        anzahl: '',
        material: STANDARD_INHALT,
        hinweis: true,
      },
    ];
  }
  if (inhalt.length === 0) {
    return [
      {
        id: `${idPrefix}:leer`,
        herkunftId: null,
        anzahl: '',
        material: KEIN_SOLL_INHALT,
        hinweis: true,
      },
    ];
  }
  return inhalt.map((p, i) => {
    const stamm = p.artikelId === null ? undefined : artikel.get(p.artikelId);
    const name = p.artikelId === null ? p.name : (stamm?.name ?? '(Artikel fehlt)');
    const einheitText = p.artikelId === null ? p.einheit : (stamm?.einheit ?? 'Stück');
    const bemerkung = p.bemerkung.trim();
    const zusatz = einheitText && einheitText !== 'Stück' ? ` (${einheitText})` : '';
    return {
      id: `${idPrefix}:${i}`,
      herkunftId: null,
      anzahl: mengeText(p.menge),
      material: `${name}${zusatz}${bemerkung ? ` – ${bemerkung}` : ''}`,
    };
  });
}

/**
 * Kistenzettel aus dem Aufbau als Druckinhalt: je Einheit mit Kisten (Fahrzeug oder Wagen) ein Abschnitt in
 * deren eigener Farbe, „Auf / In“ ist die Einheit (ein Wagen im Fahrzeug nennt das Fahrzeug), je
 * physischer Kiste ein Laufzettel „<Kiste> packen“ mit dem Heimatlager als „Von“.
 */
export function kistenzettelAusAufbau(
  inhalt: AufbauInhalt,
  daten: KistenschildStammdaten,
): DruckAbschnitt[] {
  const lager = new Map(daten.lager.map((l) => [l.id, l]));
  const artikel = new Map(daten.artikel.map((a) => [a.id, a]));
  const abschnitte: DruckAbschnitt[] = [];
  const einheitVerarbeiten = (einheit: AufbauEinheit, oberste: AufbauEinheit): void => {
    const ziel = einheit === oberste ? einheit.name : `${einheit.name} (in ${oberste.name})`;
    const laufzettel: DruckLaufzettel[] = [];
    for (const eintrag of einheit.inhalt) {
      if (eintrag.art !== 'kiste') continue;
      for (let n = 1; n <= eintrag.anzahl; n++) {
        const id = `${eintrag.id}:${n}`;
        laufzettel.push({
          id,
          herkunftId: null,
          ueberschrift: `${eintrag.name} packen`,
          lagerort: lagerMitPlatz(lager, eintrag.lagerId, eintrag.platzId),
          transportMit: ziel,
          auftraggeber: '',
          fachgruppe: null,
          positionen: sollPositionen(eintrag.inhalt, id, artikel, istStandardKiste(eintrag)),
        });
      }
    }
    if (laufzettel.length > 0) {
      abschnitte.push({
        id: einheit.id,
        herkunftId: null,
        titel: ziel,
        farbe: einheit.farbe,
        fachgruppe: null,
        laufzettel,
      });
    }
  };
  for (const oberste of inhalt.einheiten) {
    einheitVerarbeiten(oberste, oberste);
    for (const eintrag of oberste.inhalt) {
      if (eintrag.art === 'wagen') einheitVerarbeiten(eintrag.einheit, oberste);
    }
  }
  return abschnitte;
}
