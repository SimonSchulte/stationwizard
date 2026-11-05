import { istFachgruppe } from '../../kern/fachgruppen/fachgruppe';
import { istObjekt, istText } from '../../kern/text/pruefung';
import { EinsatzListenEintrag, Einsatz } from '../models/einsatz.model';
import {
  ABSCHNITT_FARBEN,
  AbschnittFarbe,
  VB_GRENZEN,
  VbAbschnitt,
  VbInhalt,
  VbLaufzettel,
  VbPosition,
  VbVorlage,
  VbVorlageKopf,
  Vorbereitung,
} from '../models/vb.model';

/**
 * Prüfungen für unbekannte externe Daten (Worker-Antworten) gegen den Datenvertrag
 * (`docs/konzept-einsatzplanung-vb.md`, Abschnitt 9): Grenzen, eindeutige Ids, keine
 * unbekannten Felder.
 */

export const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HIORG_ID_MUSTER = /^[A-Za-z0-9_-]{1,64}$/;
const LOKALE_ZEIT_MUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function nurFelder(objekt: Record<string, unknown>, erlaubt: readonly string[]): boolean {
  return Object.keys(objekt).every((schluessel) => erlaubt.includes(schluessel));
}

export function istUuid(wert: unknown): wert is string {
  return istText(wert) && UUID_MUSTER.test(wert);
}

export function istTextBis(wert: unknown, max: number, min = 0): wert is string {
  return istText(wert) && wert.length >= min && wert.length <= max;
}

export function istUuidOderNull(wert: unknown): boolean {
  return wert === null || istUuid(wert);
}

function istAbschnittFarbe(wert: unknown): wert is AbschnittFarbe {
  return typeof wert === 'string' && (ABSCHNITT_FARBEN as readonly string[]).includes(wert);
}

function istFachgruppeOderNull(wert: unknown): boolean {
  return wert === null || istFachgruppe(wert);
}

export function istGanzzahlAb(wert: unknown, min: number): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= min;
}

export function istVbPosition(wert: unknown): wert is VbPosition {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'herkunftId', 'anzahl', 'material']) &&
    istUuid(wert['id']) &&
    istUuidOderNull(wert['herkunftId']) &&
    istTextBis(wert['anzahl'], VB_GRENZEN.anzahl) &&
    istTextBis(wert['material'], VB_GRENZEN.text, 1)
  );
}

export function istVbLaufzettel(wert: unknown): wert is VbLaufzettel {
  return (
    istObjekt(wert) &&
    nurFelder(wert, [
      'id',
      'herkunftId',
      'ueberschrift',
      'lagerort',
      'transportMit',
      'auftraggeber',
      'fachgruppe',
      'positionen',
    ]) &&
    istUuid(wert['id']) &&
    istUuidOderNull(wert['herkunftId']) &&
    istTextBis(wert['ueberschrift'], VB_GRENZEN.text) &&
    istTextBis(wert['lagerort'], VB_GRENZEN.text) &&
    istTextBis(wert['transportMit'], VB_GRENZEN.text) &&
    istTextBis(wert['auftraggeber'], VB_GRENZEN.text) &&
    istFachgruppeOderNull(wert['fachgruppe']) &&
    Array.isArray(wert['positionen']) &&
    wert['positionen'].length <= VB_GRENZEN.positionen &&
    wert['positionen'].every(istVbPosition)
  );
}

export function istVbAbschnitt(wert: unknown): wert is VbAbschnitt {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'herkunftId', 'titel', 'farbe', 'fachgruppe', 'laufzettel']) &&
    istUuid(wert['id']) &&
    istUuidOderNull(wert['herkunftId']) &&
    istTextBis(wert['titel'], VB_GRENZEN.text, 1) &&
    istAbschnittFarbe(wert['farbe']) &&
    istFachgruppeOderNull(wert['fachgruppe']) &&
    Array.isArray(wert['laufzettel']) &&
    wert['laufzettel'].every(istVbLaufzettel)
  );
}

/** Alle Ids eines Inhalts (Abschnitte, Laufzettel, Positionen) in einer Liste. */
function alleIds(abschnitte: VbAbschnitt[]): string[] {
  const ids: string[] = [];
  for (const abschnitt of abschnitte) {
    ids.push(abschnitt.id);
    for (const laufzettel of abschnitt.laufzettel) {
      ids.push(laufzettel.id);
      for (const position of laufzettel.positionen) ids.push(position.id);
    }
  }
  return ids;
}

export function istVbInhalt(wert: unknown): wert is VbInhalt {
  if (
    !istObjekt(wert) ||
    !nurFelder(wert, ['anweisungen', 'abschnitte']) ||
    !istTextBis(wert['anweisungen'], VB_GRENZEN.anweisungen) ||
    !Array.isArray(wert['abschnitte']) ||
    wert['abschnitte'].length > VB_GRENZEN.abschnitte ||
    !wert['abschnitte'].every(istVbAbschnitt)
  ) {
    return false;
  }
  const abschnitte: VbAbschnitt[] = wert['abschnitte'];
  const laufzettelGesamt = abschnitte.reduce((summe, a) => summe + a.laufzettel.length, 0);
  if (laufzettelGesamt > VB_GRENZEN.laufzettel) return false;
  const ids = alleIds(abschnitte);
  return new Set(ids).size === ids.length;
}

export function istVorbereitung(wert: unknown): wert is Vorbereitung {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['vorlageId', 'vorlageVersion', 'inhalt']) &&
    istUuidOderNull(wert['vorlageId']) &&
    (wert['vorlageVersion'] === null || istGanzzahlAb(wert['vorlageVersion'], 1)) &&
    istVbInhalt(wert['inhalt'])
  );
}

export function istVbVorlage(wert: unknown): wert is VbVorlage {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'titel', 'inhalt']) &&
    istUuid(wert['id']) &&
    istTextBis(wert['titel'], VB_GRENZEN.text, 1) &&
    istVbInhalt(wert['inhalt'])
  );
}

export function istVbVorlageKopf(wert: unknown): wert is VbVorlageKopf {
  return (
    istObjekt(wert) &&
    nurFelder(wert, [
      'id',
      'titel',
      'version',
      'abschnitte',
      'laufzettel',
      'positionen',
      'geaendertAm',
    ]) &&
    istUuid(wert['id']) &&
    istTextBis(wert['titel'], VB_GRENZEN.text, 1) &&
    istGanzzahlAb(wert['version'], 1) &&
    istGanzzahlAb(wert['abschnitte'], 0) &&
    istGanzzahlAb(wert['laufzettel'], 0) &&
    istGanzzahlAb(wert['positionen'], 0) &&
    istText(wert['geaendertAm']) &&
    wert['geaendertAm'].length > 0
  );
}

/** Kennzahlen einer PEP in der Einsatzliste (hier, damit `pep-pruefung.ts` keinen Zyklus bildet). */
export function istPepKennzahlen(wert: unknown): boolean {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['posten', 'positionen', 'besetzt']) &&
    istGanzzahlAb(wert['posten'], 0) &&
    istGanzzahlAb(wert['positionen'], 0) &&
    istGanzzahlAb(wert['besetzt'], 0)
  );
}

function istLokaleZeitOderNull(wert: unknown): boolean {
  return wert === null || (istText(wert) && LOKALE_ZEIT_MUSTER.test(wert));
}

/** Prüft die Einsatzfelder; `zusatz` nennt weitere erlaubte Felder (Listeneintrag). */
function istEinsatzMitFeldern(wert: unknown, zusatz: readonly string[]): wert is Einsatz {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'titel', 'beginn', 'ende', 'ort', 'hiorgVeranstaltungId', ...zusatz]) &&
    istUuid(wert['id']) &&
    istTextBis(wert['titel'], VB_GRENZEN.text, 1) &&
    istLokaleZeitOderNull(wert['beginn']) &&
    istLokaleZeitOderNull(wert['ende']) &&
    (wert['ort'] === null || istTextBis(wert['ort'], VB_GRENZEN.text)) &&
    (wert['hiorgVeranstaltungId'] === null ||
      (istText(wert['hiorgVeranstaltungId']) && HIORG_ID_MUSTER.test(wert['hiorgVeranstaltungId'])))
  );
}

export function istEinsatz(wert: unknown): wert is Einsatz {
  return istEinsatzMitFeldern(wert, []);
}

export function istEinsatzListenEintrag(wert: unknown): wert is EinsatzListenEintrag {
  if (!istEinsatzMitFeldern(wert, ['version', 'vb', 'pep'])) return false;
  // `wert` ist hier ein Einsatz; die Zusatzfelder liegen unter dem Indexzugriff.
  const objekt: Record<string, unknown> = { ...wert };
  const vb = objekt['vb'];
  return (
    istGanzzahlAb(objekt['version'], 1) &&
    (vb === null ||
      (istObjekt(vb) &&
        nurFelder(vb, ['laufzettel', 'positionen']) &&
        istGanzzahlAb(vb['laufzettel'], 0) &&
        istGanzzahlAb(vb['positionen'], 0))) &&
    (objekt['pep'] === null || istPepKennzahlen(objekt['pep']))
  );
}

/**
 * Fachliche Vorabprüfung vor dem Speichern (der Worker lehnt dieselben Fälle mit 400 ab):
 * Pflichttexte und Grenzen. Leere Liste = speicherbar.
 */
export function vbInhaltProbleme(inhalt: VbInhalt): string[] {
  const probleme: string[] = [];
  const laufzettel = inhalt.abschnitte.flatMap((a) => a.laufzettel);
  if (inhalt.abschnitte.length > VB_GRENZEN.abschnitte) {
    probleme.push(`Höchstens ${VB_GRENZEN.abschnitte} Abschnitte sind möglich.`);
  }
  if (laufzettel.length > VB_GRENZEN.laufzettel) {
    probleme.push(`Höchstens ${VB_GRENZEN.laufzettel} Laufzettel sind möglich.`);
  }
  if (inhalt.anweisungen.length > VB_GRENZEN.anweisungen) {
    probleme.push(`Die Anweisungen sind auf ${VB_GRENZEN.anweisungen} Zeichen begrenzt.`);
  }
  if (inhalt.abschnitte.some((a) => a.titel.trim() === '')) {
    probleme.push('Jeder Abschnitt braucht einen Titel.');
  }
  if (laufzettel.some((l) => l.positionen.length > VB_GRENZEN.positionen)) {
    probleme.push(`Ein Laufzettel kann höchstens ${VB_GRENZEN.positionen} Positionen haben.`);
  }
  if (laufzettel.some((l) => l.positionen.some((p) => p.material.trim() === ''))) {
    probleme.push('Jede Position braucht eine Materialangabe.');
  }
  const zuLang = (text: string) => text.length > VB_GRENZEN.text;
  if (
    inhalt.abschnitte.some((a) => zuLang(a.titel)) ||
    laufzettel.some(
      (l) =>
        zuLang(l.ueberschrift) ||
        zuLang(l.lagerort) ||
        zuLang(l.transportMit) ||
        zuLang(l.auftraggeber) ||
        l.positionen.some((p) => zuLang(p.material) || p.anzahl.length > VB_GRENZEN.anzahl),
    )
  ) {
    probleme.push(
      `Ein Text ist zu lang (höchstens ${VB_GRENZEN.text} Zeichen, Anzahl ${VB_GRENZEN.anzahl}).`,
    );
  }
  return probleme;
}
