import { AufbauEinheit, AufbauInhalt, AufbauKistenPosition } from '../models/aufbau.model';
import { Artikel, Lager } from '../models/stammdaten.model';
import { DruckAbschnitt, DruckLaufzettel } from '../models/druck.model';
import { Kistenschild, mengeText, schildZeile } from './kisten-pdf-definition';
import { abschnittFarbeHex } from './zettel-pdf-definition';

/**
 * Kistenschilder aus dem Aufbau: ein Schild je physischer Kiste (`anzahl` Kopien), mit dem Inhalt der
 * Momentaufnahme im Aufbau und dem Rahmen in der Zielfarbe der obersten Einheit. Reine Berechnung.
 */

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

export function schilderAusAufbau(
  inhalt: AufbauInhalt,
  daten: KistenschildStammdaten,
): Kistenschild[] {
  const lager = new Map(daten.lager.map((l) => [l.id, l.name]));
  const artikel = new Map(daten.artikel.map((a) => [a.id, a]));
  const schilder: Kistenschild[] = [];
  const sammle = (einheit: AufbauEinheit, rahmenFarbe: string): void => {
    for (const eintrag of einheit.inhalt) {
      if (eintrag.art === 'wagen') {
        sammle(eintrag.einheit, rahmenFarbe);
      } else if (eintrag.art === 'kiste') {
        const schild: Kistenschild = {
          titel: eintrag.name,
          heimatlager: (eintrag.lagerId && lager.get(eintrag.lagerId)) || '',
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

/**
 * Kistenzettel aus dem Aufbau als Druckinhalt: je oberste Einheit mit Kisten ein Abschnitt (Farbe und
 * „Auf / In“ sind die Einheit, ein Wagen im Fahrzeug nennt das Fahrzeug), je physischer Kiste ein
 * Laufzettel „<Kiste> packen“ mit dem Heimatlager als „Von“.
 */
export function kistenzettelAusAufbau(
  inhalt: AufbauInhalt,
  daten: KistenschildStammdaten,
): DruckAbschnitt[] {
  const lager = new Map(daten.lager.map((l) => [l.id, l.name]));
  const artikel = new Map(daten.artikel.map((a) => [a.id, a]));
  const abschnitte: DruckAbschnitt[] = [];
  for (const oberste of inhalt.einheiten) {
    const laufzettel: DruckLaufzettel[] = [];
    const sammle = (einheit: AufbauEinheit): void => {
      const ziel = einheit === oberste ? einheit.name : `${einheit.name} (in ${oberste.name})`;
      for (const eintrag of einheit.inhalt) {
        if (eintrag.art === 'wagen') {
          sammle(eintrag.einheit);
        } else if (eintrag.art === 'kiste') {
          for (let n = 1; n <= eintrag.anzahl; n++) {
            const id = `${eintrag.id}:${n}`;
            laufzettel.push({
              id,
              herkunftId: null,
              ueberschrift: `${eintrag.name} packen`,
              lagerort: (eintrag.lagerId && lager.get(eintrag.lagerId)) || '',
              transportMit: ziel,
              auftraggeber: '',
              fachgruppe: null,
              positionen: eintrag.inhalt.map((p, i) => {
                const stamm = p.artikelId === null ? undefined : artikel.get(p.artikelId);
                const name = p.artikelId === null ? p.name : (stamm?.name ?? '(Artikel fehlt)');
                const einheitText = p.artikelId === null ? p.einheit : (stamm?.einheit ?? 'Stück');
                const bemerkung = p.bemerkung.trim();
                const zusatz = einheitText && einheitText !== 'Stück' ? ` (${einheitText})` : '';
                return {
                  id: `${id}:${i}`,
                  herkunftId: null,
                  anzahl: mengeText(p.menge),
                  material: `${name}${zusatz}${bemerkung ? ` – ${bemerkung}` : ''}`,
                };
              }),
            });
          }
        }
      }
    };
    sammle(oberste);
    if (laufzettel.length > 0) {
      abschnitte.push({
        id: oberste.id,
        herkunftId: null,
        titel: oberste.name,
        farbe: oberste.farbe,
        fachgruppe: null,
        laufzettel,
      });
    }
  }
  return abschnitte;
}
