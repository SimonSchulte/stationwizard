import { Injectable, inject } from '@angular/core';
import { AufbauEinheit, AufbauInhalt } from '../models/aufbau.model';
import {
  DruckAbschnitt,
  DruckInhalt,
  DruckLaufzettel,
  DruckPosition,
  DruckSchild,
} from '../models/druck.model';
import { leiteZettelAb, Zettel, ZettelStammdaten } from './aufbau-zettel';
import { kistenzettelAusAufbau, schilderAusAufbau } from './aufbau-kistenschilder';
import { schildZeile } from './kisten-pdf-definition';
import { KistenDruckDienst } from './kisten-druck';
import { ZettelDruckDienst } from './zettel-druck';
import { DruckKopf } from './zettel-pdf-definition';

/**
 * Druck des Aufbaus. Die abgeleiteten Zettel werden in das Druckmodell gebracht
 * (`aufbauAlsDruckInhalt()`), damit der vorhandene, geprüfte Druck (Anweisungsseite, Laufzettelstreifen
 * mit Platzberechnung und Fortsetzungsstreifen, Schilder) unverändert Grundlage bleibt:
 * - je oberste Einheit ein Abschnitt (Farbe, Foto, Schild), Wagen im Fahrzeug stehen darin,
 * - je Zettel ein Laufzettel, ein Lagertrenner ist eine Hinweiszeile („!“) und kostet eine Zeile.
 */

function laufzettelVon(zettel: Zettel): DruckLaufzettel {
  const positionen: DruckPosition[] = zettel.posten.map((posten, index) =>
    posten.art === 'trenner'
      ? {
          id: `${zettel.einheitId}-t${index}`,
          herkunftId: null,
          anzahl: '',
          material: posten.text,
          hinweis: true,
        }
      : {
          id: `${zettel.einheitId}-${posten.eintragId}`,
          herkunftId: null,
          anzahl: posten.anzahl,
          material: posten.zusatz ? `${posten.bezeichnung} · ${posten.zusatz}` : posten.bezeichnung,
        },
  );
  return {
    id: zettel.einheitId,
    herkunftId: null,
    ueberschrift: zettel.name,
    lagerort: zettel.von ?? '',
    transportMit: zettel.inFahrzeug ? `${zettel.name} (in ${zettel.inFahrzeug})` : zettel.name,
    auftraggeber: '',
    fachgruppe: null,
    positionen,
  };
}

/** Soll-Inhalt einer Einheit für den Aushang: Kisten zuerst, dann lose Artikel, zuletzt Wagen. */
export function sollInhaltZeilen(einheit: AufbauEinheit, daten: ZettelStammdaten): string[] {
  const artikel = new Map(daten.artikel.map((a) => [a.id, a]));
  const kisten: string[] = [];
  const lose: string[] = [];
  const wagen: string[] = [];
  for (const eintrag of einheit.inhalt) {
    if (eintrag.art === 'kiste') {
      kisten.push(`${eintrag.anzahl}× ${eintrag.name}`);
    } else if (eintrag.art === 'artikel') {
      const stamm = artikel.get(eintrag.artikelId);
      lose.push(
        schildZeile({
          name: stamm?.name ?? '(Artikel fehlt)',
          einheit: stamm?.einheit ?? 'Stück',
          menge: eintrag.menge,
          bemerkung: eintrag.bemerkung,
        }),
      );
    } else if (eintrag.art === 'frei') {
      lose.push(schildZeile(eintrag));
    } else {
      wagen.push(`Wagen: ${eintrag.einheit.name}`);
    }
  }
  return [...kisten, ...lose, ...wagen];
}

/**
 * Ein Aushang je Fahrzeug und je Wagen (auch Wagen im Fahrzeug, in der Farbe des Fahrzeugs) mit
 * dem Soll-Inhalt.
 */
function schilderVon(inhalt: AufbauInhalt, daten: ZettelStammdaten): DruckSchild[] {
  const schilder: DruckSchild[] = [];
  const hinzu = (einheit: AufbauEinheit, farbe: AufbauEinheit['farbe']): void => {
    const schild: DruckSchild = {
      id: einheit.id,
      titel: einheit.name,
      farbe,
      zeilen: sollInhaltZeilen(einheit, daten),
    };
    if (einheit.foto) schild.foto = einheit.foto;
    schilder.push(schild);
  };
  for (const einheit of inhalt.einheiten) {
    hinzu(einheit, einheit.farbe);
    for (const eintrag of einheit.inhalt) {
      if (eintrag.art === 'wagen') hinzu(eintrag.einheit, einheit.farbe);
    }
  }
  return schilder;
}

export function aufbauAlsDruckInhalt(inhalt: AufbauInhalt, daten: ZettelStammdaten): DruckInhalt {
  const zettel = new Map(leiteZettelAb(inhalt, daten).map((z) => [z.einheitId, z]));
  const abschnitte: DruckAbschnitt[] = inhalt.einheiten.map((einheit) => {
    const ids = [
      einheit.id,
      ...einheit.inhalt.flatMap((x) => (x.art === 'wagen' ? [x.einheit.id] : [])),
    ];
    const abschnitt: DruckAbschnitt = {
      id: einheit.id,
      herkunftId: null,
      titel: einheit.name,
      farbe: einheit.farbe,
      fachgruppe: null,
      laufzettel: ids.flatMap((id) => {
        const z = zettel.get(id);
        return z ? [laufzettelVon(z)] : [];
      }),
    };
    if (einheit.foto) abschnitt.foto = einheit.foto;
    return abschnitt;
  });
  const druck: DruckInhalt = { anweisungen: inhalt.anweisungen, abschnitte };
  const schilder = schilderVon(inhalt, daten);
  if (schilder.length > 0) druck.schilder = schilder;
  const kistenzettel = kistenzettelAusAufbau(inhalt, daten);
  if (kistenzettel.length > 0) druck.kistenzettel = kistenzettel;
  return druck;
}

@Injectable({ providedIn: 'root' })
export class AufbauDruckDienst {
  private readonly druck = inject(ZettelDruckDienst);
  private readonly kistenDruck = inject(KistenDruckDienst);

  drucken(kopf: DruckKopf, inhalt: AufbauInhalt, daten: ZettelStammdaten): Promise<void> {
    return this.druck.drucken(kopf, aufbauAlsDruckInhalt(inhalt, daten));
  }

  herunterladen(kopf: DruckKopf, inhalt: AufbauInhalt, daten: ZettelStammdaten): Promise<void> {
    return this.druck.herunterladen(kopf, aufbauAlsDruckInhalt(inhalt, daten));
  }

  /** Kistenschilder (eine Kopie je Kiste) mit dem Inhalt aus dem Aufbau; `false`: keine Kiste im Aufbau. */
  async kistenschilderDrucken(
    titel: string,
    inhalt: AufbauInhalt,
    daten: ZettelStammdaten,
  ): Promise<boolean> {
    const schilder = schilderAusAufbau(inhalt, daten);
    if (schilder.length === 0) return false;
    await this.kistenDruck.schilderDrucken(schilder, titel);
    return true;
  }

  /** Kistenzettel (ein Streifen je Kiste) aus dem Aufbau; `false`: keine Kiste im Aufbau. */
  async kistenzettelDrucken(
    titel: string,
    inhalt: AufbauInhalt,
    daten: ZettelStammdaten,
  ): Promise<boolean> {
    const abschnitte = kistenzettelAusAufbau(inhalt, daten);
    if (abschnitte.length === 0) return false;
    await this.kistenDruck.zettelAusInhaltDrucken({ anweisungen: '', abschnitte }, titel);
    return true;
  }
}
