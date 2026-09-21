import { PruefFach } from '../../../src/app/material/models/pruefvorlage.model';
import { CheckpositionEingabe } from '../../../src/app/material/models/check.model';
import { MeldungFehler } from './oeffentlich-api';

/**
 * Zugriff auf die beiden öffentlichen Check-Endpunkte. Wie bei der
 * Kilometermeldung ohne `HttpClient` und ohne `WorkerClient`: hier gibt es
 * keine Sitzung, deren Zustand zu setzen wäre.
 */

/** Was die öffentliche Seite über den Behälter erfahren darf – mehr nicht. */
export interface OeffentlicherBehaelter {
  behaelterBezeichnung: string;
  fahrzeugBezeichnung: string;
  fahrzeugFunkrufname: string;
  vorlage: { bezeichnung: string; faecher: PruefFach[] };
}

export interface CheckMeldung {
  name: string;
  bemerkung: string;
  verfallsdatumErfasst: boolean;
  positionen: CheckpositionEingabe[];
}

export interface CheckQuittung {
  positionenGeprueft: number;
  positionenGesamt: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
}

const ZEITLIMIT_MS = 30_000;

function pfad(token: string): string {
  return `/api/oeffentlich/check/${encodeURIComponent(token)}`;
}

async function fehlerAus(antwort: Response, ersatz: string): Promise<MeldungFehler> {
  let code = '';
  let nachricht = '';
  try {
    const inhalt: unknown = await antwort.json();
    if (inhalt && typeof inhalt === 'object') {
      const daten = inhalt as Record<string, unknown>;
      if (typeof daten['code'] === 'string') code = daten['code'];
      if (typeof daten['nachricht'] === 'string') nachricht = daten['nachricht'];
    }
  } catch {
    // Antwort ohne verwertbares JSON: der Ersatztext genügt.
  }
  return new MeldungFehler(nachricht || ersatz, code);
}

function istFach(wert: unknown): wert is PruefFach {
  if (typeof wert !== 'object' || wert === null) return false;
  const fach = wert as Record<string, unknown>;
  return (
    typeof fach['id'] === 'string' &&
    typeof fach['bezeichnung'] === 'string' &&
    Array.isArray(fach['artikel']) &&
    fach['artikel'].every((artikel) => {
      if (typeof artikel !== 'object' || artikel === null) return false;
      const a = artikel as Record<string, unknown>;
      return (
        typeof a['id'] === 'string' &&
        typeof a['bezeichnung'] === 'string' &&
        typeof a['sollMenge'] === 'number' &&
        Number.isInteger(a['sollMenge']) &&
        a['sollMenge'] >= 1 &&
        typeof a['einheit'] === 'string' &&
        (a['herkunft'] === 'seg' || a['herkunft'] === 'land' || a['herkunft'] === 'beide') &&
        typeof a['verfallsdatumPflicht'] === 'boolean'
      );
    })
  );
}

export async function ladeBehaelter(token: string): Promise<OeffentlicherBehaelter> {
  const antwort = await fetch(pfad(token), {
    credentials: 'same-origin',
    redirect: 'error',
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  if (!antwort.ok) {
    throw await fehlerAus(antwort, 'Dieser QR-Code gehört zu keinem Behälter.');
  }
  const inhalt = (await antwort.json()) as Record<string, unknown>;
  const vorlage = inhalt['vorlage'] as Record<string, unknown> | undefined;
  if (
    typeof inhalt['behaelterBezeichnung'] !== 'string' ||
    typeof inhalt['fahrzeugBezeichnung'] !== 'string' ||
    typeof inhalt['fahrzeugFunkrufname'] !== 'string' ||
    !vorlage ||
    typeof vorlage['bezeichnung'] !== 'string' ||
    !Array.isArray(vorlage['faecher']) ||
    !vorlage['faecher'].every(istFach)
  ) {
    throw new MeldungFehler('Unerwartete Antwort des Servers.', 'ANTWORT_UNGUELTIG');
  }
  return {
    behaelterBezeichnung: inhalt['behaelterBezeichnung'],
    fahrzeugBezeichnung: inhalt['fahrzeugBezeichnung'],
    fahrzeugFunkrufname: inhalt['fahrzeugFunkrufname'],
    vorlage: { bezeichnung: vorlage['bezeichnung'], faecher: vorlage['faecher'] },
  };
}

export async function sendeCheck(token: string, meldung: CheckMeldung): Promise<CheckQuittung> {
  const antwort = await fetch(pfad(token), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meldung),
    credentials: 'same-origin',
    redirect: 'error',
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  if (!antwort.ok) {
    throw await fehlerAus(antwort, 'Die Meldung konnte nicht übermittelt werden.');
  }
  return (await antwort.json()) as CheckQuittung;
}
