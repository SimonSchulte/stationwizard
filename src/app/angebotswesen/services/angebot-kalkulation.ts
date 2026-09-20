import { zeitAlsMinuten } from '../../kern/kalender/datum';
import { PreiskatalogArt } from '../models/preiskatalog.model';
import { Angebot, Position, Schicht } from '../models/angebot.model';

/**
 * Reine Kalkulationsfunktionen ohne DI – isoliert testbar und von
 * Editor-Live-Summen und Word-Export gemeinsam genutzt. Es gibt keinen
 * persistierten Summenwert: alles wird immer aus `von`/`bis`/`einzelpreisCent`/
 * `anzahl`/`stunden` neu berechnet.
 */

/** Dauer einer Schicht in Stunden, aus `von`/`bis`. Ungültige Zeiten sind ein Validierungsfehler, kein Rechenfall hier. */
export function schichtStundenGenau(schicht: Pick<Schicht, 'von' | 'bis'>): number {
  const vonMin = zeitAlsMinuten(schicht.von);
  const bisMin = zeitAlsMinuten(schicht.bis);
  if (vonMin === null || bisMin === null) return 0;
  return (bisMin - vonMin) / 60;
}

/**
 * Gesamtpreis einer Position. Fahrzeuge sind Pauschale je Schicht (keine
 * Stunden), Einsatzkräfte werden nach Stunden berechnet – bei fehlender
 * eigener `stunden`-Angabe fällt die Position auf die Schichtdauer zurück.
 * Rundung ausschließlich hier, wo Bruchstunden multipliziert werden; jede
 * weitere Summierung ist exakte Ganzzahladdition.
 */
export function positionGesamtCent(
  position: Position,
  schicht: Pick<Schicht, 'von' | 'bis'>,
): number {
  if (position.art === 'fahrzeug') {
    return position.einzelpreisCent * position.anzahl;
  }
  const stunden = position.stunden ?? schichtStundenGenau(schicht);
  return Math.round(position.einzelpreisCent * position.anzahl * stunden);
}

export function schichtGesamtCent(schicht: Schicht): number {
  return schicht.positionen.reduce(
    (summe, position) => summe + positionGesamtCent(position, schicht),
    0,
  );
}

/** Die einmalige Materialpauschale, 0 wenn nicht aktiv – nie `null` in einer Summe. */
export function materialpauschaleGesamtCent(
  angebot: Pick<Angebot, 'materialpauschaleAktiv' | 'materialpauschaleCent'>,
): number {
  return angebot.materialpauschaleAktiv && angebot.materialpauschaleCent !== null
    ? angebot.materialpauschaleCent
    : 0;
}

/**
 * Summe aller Schichten plus einer einmaligen Materialpauschale pro Dienst
 * (nicht je Schicht) – anders als der Pauschalpreis eine zusätzliche
 * Position, die immer in diese Summe einfließt, auch wenn `pauschalpreisAktiv`
 * sie am Ende ersetzt.
 */
export function angebotRechnerischGesamtCent(
  angebot: Pick<Angebot, 'schichten' | 'materialpauschaleAktiv' | 'materialpauschaleCent'>,
): number {
  const schichtenSumme = angebot.schichten.reduce(
    (summe, schicht) => summe + schichtGesamtCent(schicht),
    0,
  );
  return schichtenSumme + materialpauschaleGesamtCent(angebot);
}

/**
 * Gesamtsumme des Angebots. Ein aktiver Pauschalpreis ersetzt ausschließlich
 * diesen Endwert – Einzelpositionen, Schicht-Zwischensummen und die
 * Materialpauschale bleiben davon unberührt und immer sichtbar/berechnet
 * (siehe CLAUDE.md-Absatz zum Modul).
 */
export function angebotGesamtCent(
  angebot: Pick<
    Angebot,
    | 'schichten'
    | 'materialpauschaleAktiv'
    | 'materialpauschaleCent'
    | 'pauschalpreisAktiv'
    | 'pauschalpreisCent'
  >,
): number {
  if (angebot.pauschalpreisAktiv && angebot.pauschalpreisCent !== null) {
    return angebot.pauschalpreisCent;
  }
  return angebotRechnerischGesamtCent(angebot);
}

/** Eine fortlaufend nummerierte Positionszeile der Kalkulationstabelle. */
export interface KalkulationPositionZeile {
  schichtId: string;
  positionId: string;
  pos: number;
  art: PreiskatalogArt;
  bezeichnung: string;
  einzelpreisCent: number;
  anzahl: number;
  stunden: number | null;
  gesamtCent: number;
}

export interface KalkulationSchichtGruppe {
  schicht: Schicht;
  positionen: KalkulationPositionZeile[];
  gesamtCent: number;
}

export interface AngebotKalkulation {
  gruppen: KalkulationSchichtGruppe[];
  /** `null`, wenn keine Materialpauschale aktiv ist – dann keine eigene Zeile in der Tabelle. */
  materialpauschaleCent: number | null;
  rechnerischGesamtCent: number;
  gesamtCent: number;
}

/**
 * Strukturierte Aufbereitung für Kalkulationstabelle und Word-Export – beide
 * lesen dieselbe Datenstruktur, statt die Tabellenlogik zweimal nachzubilden.
 */
export function berechneAngebot(angebot: Angebot): AngebotKalkulation {
  let laufendePos = 0;
  const gruppen: KalkulationSchichtGruppe[] = angebot.schichten.map((schicht) => {
    const positionen: KalkulationPositionZeile[] = schicht.positionen.map((position) => {
      laufendePos += 1;
      return {
        schichtId: schicht.id,
        positionId: position.id,
        pos: laufendePos,
        art: position.art,
        bezeichnung: position.bezeichnung,
        einzelpreisCent: position.einzelpreisCent,
        anzahl: position.anzahl,
        stunden: position.stunden,
        gesamtCent: positionGesamtCent(position, schicht),
      };
    });
    return { schicht, positionen, gesamtCent: schichtGesamtCent(schicht) };
  });
  return {
    gruppen,
    materialpauschaleCent: angebot.materialpauschaleAktiv
      ? materialpauschaleGesamtCent(angebot)
      : null,
    rechnerischGesamtCent: angebotRechnerischGesamtCent(angebot),
    gesamtCent: angebotGesamtCent(angebot),
  };
}
