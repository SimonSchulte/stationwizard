import { type FahrzeugEingabe } from './fahrzeuge-pruefung';
import { type FahrzeugZeile } from './fahrzeuge-zeilen';
import { istObjekt } from './json-lesen';

/**
 * Änderungsprotokoll: die Beschreibung entsteht aus dem tatsächlichen Unterschied zum
 * vorherigen Stand, nie aus einer Client-Eingabe.
 */

const EIGENTUEMER_LABEL: Readonly<Record<string, string>> = {
  'land-nrw': 'Land NRW',
  bund: 'Bund',
  organisation: 'Organisation',
};

const GRUPPE_LABEL: Readonly<Record<string, string>> = {
  betreuung: 'Betreuung',
  tesi: 'TeSi',
  fuehrung: 'Führung',
  sanitaet: 'Sanität',
};

type StammdatenFeld =
  'bezeichnung' | 'funkrufname' | 'kennzeichen' | 'fahrgestellnummer' | 'eigentuemer' | 'gruppe';

const STAMMDATEN_FELDER: readonly { schluessel: StammdatenFeld; label: string }[] = [
  { schluessel: 'bezeichnung', label: 'Bezeichnung' },
  { schluessel: 'funkrufname', label: 'Funkrufname' },
  { schluessel: 'kennzeichen', label: 'Kennzeichen' },
  { schluessel: 'fahrgestellnummer', label: 'Fahrgestellnummer' },
  { schluessel: 'eigentuemer', label: 'Eigentümer' },
  { schluessel: 'gruppe', label: 'Gruppe' },
];

function feldAnzeige(schluessel: StammdatenFeld, wert: string | null): string {
  if (wert === null || wert === '') return '(leer)';
  if (schluessel === 'eigentuemer') return EIGENTUEMER_LABEL[wert] ?? wert;
  if (schluessel === 'gruppe') return GRUPPE_LABEL[wert] ?? wert;
  return wert;
}

interface WartungFuerDiff {
  id: string;
  bezeichnung: string;
  faelligAm: string;
  erinnerungTage: number;
  erledigtAm: string | null;
}

function alsWartungFuerDiff(wert: unknown): WartungFuerDiff {
  const objekt = istObjekt(wert) ? wert : {};
  return {
    id: String(objekt['id'] ?? ''),
    bezeichnung: String(objekt['bezeichnung'] ?? ''),
    faelligAm: String(objekt['faelligAm'] ?? ''),
    erinnerungTage: Number(objekt['erinnerungTage'] ?? 0),
    erledigtAm: objekt['erledigtAm'] === null ? null : String(objekt['erledigtAm'] ?? ''),
  };
}

/**
 * Vergleicht Wartungstermine anhand ihrer `id`: neue, entfernte und
 * inhaltlich geänderte Termine werden je als eigene Protokollzeile erkannt.
 */
function diffWartungstermine(alt: unknown[], neu: unknown[]): string[] {
  const altListe = alt.map(alsWartungFuerDiff);
  const neuListe = neu.map(alsWartungFuerDiff);
  const zeilen: string[] = [];

  for (const termin of neuListe) {
    if (!altListe.some((t) => t.id === termin.id)) {
      zeilen.push(
        `Wartungstermin „${termin.bezeichnung}" hinzugefügt (fällig ${termin.faelligAm})`,
      );
    }
  }
  for (const termin of altListe) {
    if (!neuListe.some((t) => t.id === termin.id)) {
      zeilen.push(`Wartungstermin „${termin.bezeichnung}" entfernt`);
    }
  }
  for (const neuerTermin of neuListe) {
    const alterTermin = altListe.find((t) => t.id === neuerTermin.id);
    if (!alterTermin) continue;
    const details: string[] = [];
    if (alterTermin.bezeichnung !== neuerTermin.bezeichnung) {
      details.push(`Bezeichnung „${alterTermin.bezeichnung}" → „${neuerTermin.bezeichnung}"`);
    }
    if (alterTermin.faelligAm !== neuerTermin.faelligAm) {
      details.push(`Fälligkeit ${alterTermin.faelligAm} → ${neuerTermin.faelligAm}`);
    }
    if (alterTermin.erinnerungTage !== neuerTermin.erinnerungTage) {
      details.push(`Vorlauf ${alterTermin.erinnerungTage} → ${neuerTermin.erinnerungTage} Tage`);
    }
    if (alterTermin.erledigtAm !== neuerTermin.erledigtAm) {
      details.push(neuerTermin.erledigtAm !== null ? 'als erledigt markiert' : 'wieder geöffnet');
    }
    if (details.length > 0) {
      zeilen.push(`Wartungstermin „${neuerTermin.bezeichnung}": ${details.join(', ')}`);
    }
  }
  return zeilen;
}

/** Ermittelt die tatsächlichen Unterschiede für das Änderungsprotokoll – keine Zeile ohne echte Änderung. */
export function diffFahrzeug(alt: FahrzeugZeile, neu: FahrzeugEingabe): string[] {
  const zeilen: string[] = [];
  for (const { schluessel, label } of STAMMDATEN_FELDER) {
    const altWert = alt[schluessel];
    const neuWert = neu[schluessel];
    if (altWert !== neuWert) {
      zeilen.push(
        `${label} geändert: ${feldAnzeige(schluessel, altWert)} → ${feldAnzeige(schluessel, neuWert)}`,
      );
    }
  }
  if (alt.bemerkung !== neu.bemerkung) {
    zeilen.push('Bemerkung geändert');
  }
  zeilen.push(
    ...diffWartungstermine(JSON.parse(alt.wartungstermine) as unknown[], neu.wartungstermine),
  );
  return zeilen;
}

/**
 * Schreibt einen Eintrag ins Änderungsprotokoll. Ausschließlich intern
 * aufgerufen: `von` und `zeitpunkt` kommen nie aus dem Anfragekörper, und es
 * gibt keinen Endpunkt, über den ein Client direkt in diese Tabelle schreiben
 * könnte (siehe docs/konzept-fahrzeuge.md, Abschnitt „Änderungsprotokoll").
 */
/**
 * Der einzige Schreibpfad ins Änderungsprotokoll. Exportiert, damit auch
 * `einreichungen.ts` ihn benutzt, statt einen zweiten anzulegen: `von` ist
 * immer eine geprüfte Access-E-Mail, und die Beschreibung entsteht im Code,
 * nie aus einer Client-Eingabe.
 */
export async function protokolliereAenderung(
  db: D1Database,
  fahrzeugId: string,
  von: string,
  beschreibung: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fahrzeug_aenderungen (id, fahrzeug_id, zeitpunkt, von, beschreibung)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), fahrzeugId, new Date().toISOString(), von, beschreibung)
    .run();
}
