import { Injectable, inject } from '@angular/core';
import { AufbauInhalt } from '../models/aufbau.model';
import { VbAbschnitt, VbInhalt, VbLaufzettel, VbPosition } from '../models/vb.model';
import { leiteZettelAb, Zettel, ZettelStammdaten } from './aufbau-zettel';
import { VbDruckDienst } from './vb-druck';
import { VbDruckKopf } from './vb-pdf-definition';

/**
 * Druck des Aufbaus. Die abgeleiteten Zettel werden in die Form der Vorbereitung gebracht
 * (`aufbauAlsVbInhalt()`), damit der vorhandene, geprüfte Druck (Anweisungsseite, Laufzettelstreifen
 * mit Platzberechnung und Fortsetzungsstreifen, Schilder) unverändert Grundlage bleibt:
 * - je oberste Einheit ein Abschnitt (Farbe, Foto, Schild), Wagen im Fahrzeug stehen darin,
 * - je Zettel ein Laufzettel, ein Lagertrenner ist eine Hinweiszeile („!“) und kostet eine Zeile.
 */

function laufzettelVon(zettel: Zettel): VbLaufzettel {
  const positionen: VbPosition[] = zettel.posten.map((posten, index) =>
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

export function aufbauAlsVbInhalt(inhalt: AufbauInhalt, daten: ZettelStammdaten): VbInhalt {
  const zettel = new Map(leiteZettelAb(inhalt, daten).map((z) => [z.einheitId, z]));
  const abschnitte: VbAbschnitt[] = inhalt.einheiten.map((einheit) => {
    const ids = [
      einheit.id,
      ...einheit.inhalt.flatMap((x) => (x.art === 'wagen' ? [x.einheit.id] : [])),
    ];
    const abschnitt: VbAbschnitt = {
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
  return { anweisungen: inhalt.anweisungen, abschnitte };
}

@Injectable({ providedIn: 'root' })
export class AufbauDruckDienst {
  private readonly druck = inject(VbDruckDienst);

  drucken(kopf: VbDruckKopf, inhalt: AufbauInhalt, daten: ZettelStammdaten): Promise<void> {
    return this.druck.drucken(kopf, aufbauAlsVbInhalt(inhalt, daten));
  }

  herunterladen(kopf: VbDruckKopf, inhalt: AufbauInhalt, daten: ZettelStammdaten): Promise<void> {
    return this.druck.herunterladen(kopf, aufbauAlsVbInhalt(inhalt, daten));
  }
}
