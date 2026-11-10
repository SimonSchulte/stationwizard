import { AufbauEinheit, AufbauInhalt, AufbauKistenPosition } from '../models/aufbau.model';
import { Artikel, Lager } from '../models/stammdaten.model';
import { Kistenschild, schildZeile } from './kisten-pdf-definition';
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
