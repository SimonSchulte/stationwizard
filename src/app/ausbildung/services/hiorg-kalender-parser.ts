import { epochSekundenZuIsoDatum, epochSekundenZuIsoZeit } from '../../kern/kalender/datum';
import { dekodiereEntitaeten } from '../../kern/text/entitaeten';
import type { HiorgArt, HiorgEintrag } from '../models/hiorg-kalender.model';

export interface HiorgParserErgebnis {
  eintraege: HiorgEintrag[];
  /** Übersprungene, unbrauchbare Datensätze – für einen ehrlichen Hinweis in der Ansicht. */
  verworfen: number;
}

/**
 * Prüft die Worker-Antwort Feld für Feld, bevor daraus Domänenobjekte werden.
 * Der Worker filtert bereits serverseitig; hier wird trotzdem nichts geglaubt,
 * weil die Daten aus einer Fremdquelle stammen.
 */
export function leseHiorgAntwort(rohdaten: unknown): HiorgParserErgebnis {
  const leer: HiorgParserErgebnis = { eintraege: [], verworfen: 0 };
  if (!istObjekt(rohdaten) || rohdaten['status'] !== 'OK') {
    return leer;
  }
  const rohEintraege = rohdaten['eintraege'];
  if (!Array.isArray(rohEintraege)) {
    return leer;
  }

  const eintraege: HiorgEintrag[] = [];
  let verworfen = 0;
  for (const roh of rohEintraege) {
    const eintrag = leseEintrag(roh);
    if (eintrag) {
      eintraege.push(eintrag);
    } else {
      verworfen += 1;
    }
  }
  eintraege.sort(
    (a, b) =>
      a.beginn.localeCompare(b.beginn) ||
      a.beginnZeit.localeCompare(b.beginnZeit) ||
      a.name.localeCompare(b.name),
  );
  return { eintraege, verworfen };
}

function leseEintrag(roh: unknown): HiorgEintrag | null {
  if (!istObjekt(roh)) {
    return null;
  }

  const sortdate = roh['sortdate'];
  if (typeof sortdate !== 'number') {
    return null;
  }
  const beginn = epochSekundenZuIsoDatum(sortdate);
  if (!beginn) {
    return null;
  }

  const rohName = roh['verbez'];
  if (typeof rohName !== 'string') {
    return null;
  }
  const name = dekodiereEntitaeten(rohName).replace(/\s+/g, ' ').trim();
  if (name === '') {
    return null;
  }

  const art = roh['typ'];
  if (!istArt(art)) {
    return null;
  }

  const id = roh['id'];
  if (typeof id !== 'string' && typeof id !== 'number') {
    return null;
  }

  // Ein fehlendes oder früheres Ende macht den Termin eintägig, statt eine
  // erfundene Spanne zu erzeugen.
  const enddate = roh['enddate'];
  const rohEnde = typeof enddate === 'number' ? epochSekundenZuIsoDatum(enddate) : null;
  const ende = rohEnde && rohEnde > beginn ? rohEnde : beginn;

  // Die Tageszeit steckt im selben Zeitstempel; sie geht bisher verloren,
  // wird aber gebraucht, um mehrere Einträge eines Tages zu ordnen.
  const beginnZeit = epochSekundenZuIsoZeit(sortdate) ?? '';
  const endeZeit =
    typeof enddate === 'number' && rohEnde ? (epochSekundenZuIsoZeit(enddate) ?? '') : '';

  const rohUrl = roh['url'];
  const url = typeof rohUrl === 'string' && rohUrl.startsWith('https://') ? rohUrl : null;

  return {
    schluessel: `${String(id)}|${beginn}|${ende}|${url ?? name}`,
    beginn,
    ende,
    beginnZeit,
    endeZeit,
    name,
    art,
    url,
    id: String(id),
  };
}

function istArt(wert: unknown): wert is HiorgArt {
  return wert === 'termin' || wert === 'dienst';
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}
