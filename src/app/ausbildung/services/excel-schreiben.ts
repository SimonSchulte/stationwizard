import * as XLSX from '@e965/xlsx';
import { Arbeitsmappe, Jahresblatt, KatsThema, Termin, typName } from '../models/plan.model';
import { isoZuSerial, wochentag } from '../../kern/kalender/datum';
import {
  BLATT_BACKLOG,
  SPALTEN_BREITEN,
  SPALTEN_UEBERSCHRIFTEN,
  SpaltenFeld,
  blattJahresplan,
  blattKats,
  vergleicheTermine,
} from './excel-schema';

const DATUMS_FORMAT = 'DD.MM.YYYY';

/** Ideen haben kein Datum – und damit auch keinen Wochentag und kein Enddatum. */
const BACKLOG_FELDER: SpaltenFeld[] = SPALTEN_UEBERSCHRIFTEN.map((s) => s.feld).filter(
  (feld) => feld !== 'datum' && feld !== 'tag' && feld !== 'datumBis',
);

/**
 * Schreibt die Arbeitsmappe: ein Jahresplan-Blatt (Blattname = Jahreszahl) samt
 * eigenem KatS-A-Plan-Blatt je Jahr, dazu das jahresübergreifend geteilte
 * "Offene Ideen"-Blatt. Nummern für die KatS-A-Plan-Verweise werden über alle
 * Jahre hinweg aufgelöst, da Ideen ohne Datum keinem Jahr fest zugeordnet sind.
 */
export function schreibeArbeitsmappe(arbeitsmappe: Arbeitsmappe): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const jahre = [...arbeitsmappe.jahre].sort((a, b) => a.jahr - b.jahr);
  const nummern = new Map(jahre.flatMap((j) => j.katsThemen).map((t) => [t.id, t.nummer]));

  for (const jahresblatt of jahre) {
    XLSX.utils.book_append_sheet(
      wb,
      jahresplanBlatt(jahresblatt, nummern),
      blattJahresplan(jahresblatt.jahr),
    );
  }
  XLSX.utils.book_append_sheet(wb, backlogBlatt(arbeitsmappe.backlog, nummern), BLATT_BACKLOG);
  for (const jahresblatt of jahre) {
    XLSX.utils.book_append_sheet(
      wb,
      katsBlatt(jahresblatt.katsThemen),
      blattKats(jahresblatt.jahr),
    );
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

function jahresplanBlatt(jahresblatt: Jahresblatt, nummern: Map<string, string>): XLSX.WorkSheet {
  const felder = SPALTEN_UEBERSCHRIFTEN.map((s) => s.feld);
  const kopf = SPALTEN_UEBERSCHRIFTEN.map((s) => s.text);
  const termine = [...jahresblatt.termine].sort(vergleicheTermine);
  const daten = termine.map((termin) => felder.map((feld) => zelle(termin, feld, nummern)));

  const ws = XLSX.utils.aoa_to_sheet([[jahresblatt.titel], [], kopf, ...daten]);
  const datumSpalte = felder.indexOf('datum');
  const endeSpalte = felder.indexOf('datumBis');
  termine.forEach((termin, i) => {
    if (termin.datum) {
      setzeDatum(ws, 3 + i, datumSpalte, termin.datum);
    }
    if (termin.datumBis) {
      setzeDatum(ws, 3 + i, endeSpalte, termin.datumBis);
    }
  });
  ws['!cols'] = felder.map((feld) => ({ wch: SPALTEN_BREITEN[feld] }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(6, felder.length - 1) } }];
  ws['!autofilter'] = { ref: bereich(2, 0, 2 + daten.length, felder.length - 1) };
  return ws;
}

function backlogBlatt(backlog: Termin[], nummern: Map<string, string>): XLSX.WorkSheet {
  const kopf = BACKLOG_FELDER.map(
    (feld) => SPALTEN_UEBERSCHRIFTEN.find((s) => s.feld === feld)!.text,
  );
  const daten = backlog.map((termin) => BACKLOG_FELDER.map((feld) => zelle(termin, feld, nummern)));
  const ws = XLSX.utils.aoa_to_sheet([kopf, ...daten]);
  ws['!cols'] = BACKLOG_FELDER.map((feld) => ({ wch: SPALTEN_BREITEN[feld] }));
  ws['!autofilter'] = { ref: bereich(0, 0, daten.length, BACKLOG_FELDER.length - 1) };
  return ws;
}

function katsBlatt(themen: KatsThema[]): XLSX.WorkSheet {
  const kopf = ['Nr.', 'Titel', 'Pflicht', 'Beschreibung'];
  const daten = themen.map((t) => [t.nummer, t.titel, t.pflicht ? 'X' : '', t.beschreibung]);
  const ws = XLSX.utils.aoa_to_sheet([kopf, ...daten]);
  ws['!cols'] = [{ wch: 10 }, { wch: 48 }, { wch: 10 }, { wch: 60 }];
  ws['!autofilter'] = { ref: bereich(0, 0, daten.length, kopf.length - 1) };
  return ws;
}

function zelle(termin: Termin, feld: SpaltenFeld, nummern: Map<string, string>): string {
  if (feld.startsWith('nachweis:')) {
    return termin.nachweise.includes(feld.slice('nachweis:'.length) as never) ? 'X' : '';
  }
  switch (feld) {
    case 'datum':
      return termin.datum ?? '';
    case 'datumBis':
      return termin.datumBis ?? '';
    case 'tag':
      return termin.datum ? wochentag(termin.datum) : '';
    case 'beginnZeit':
      return termin.beginnZeit;
    case 'endeZeit':
      return termin.endeZeit;
    case 'typ':
      return typName(termin.typ);
    case 'hinweis':
      return termin.hinweis;
    case 'kategorie':
      return termin.kategorie;
    case 'thema':
      return termin.thema;
    case 'ausbilder':
      return termin.ausbilder;
    case 'katsPflicht':
      return termin.katsPflicht ? 'X' : '';
    case 'katsNummer':
      return termin.katsThemaId ? (nummern.get(termin.katsThemaId) ?? '') : '';
    case 'katsTitel':
      return termin.katsTitel;
    case 'hgmInhalt':
      return termin.hgmInhalt;
    case 'hgmTitel':
      return termin.hgmTitel;
    case 'material':
      return termin.material;
    case 'anforderungen':
      return termin.anforderungen;
    case 'notizen':
      return termin.notizen;
    default:
      return '';
  }
}

/** Datum als echte Excel-Seriennummer schreiben, damit Filter und Formeln greifen. */
function setzeDatum(ws: XLSX.WorkSheet, zeile: number, spalte: number, iso: string): void {
  const adresse = XLSX.utils.encode_cell({ r: zeile, c: spalte });
  ws[adresse] = { t: 'n', v: isoZuSerial(iso), z: DATUMS_FORMAT };
}

function bereich(r1: number, c1: number, r2: number, c2: number): string {
  return `${XLSX.utils.encode_cell({ r: r1, c: c1 })}:${XLSX.utils.encode_cell({ r: r2, c: c2 })}`;
}
