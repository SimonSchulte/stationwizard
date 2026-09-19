/**
 * Zugriff auf die beiden öffentlichen Endpunkte. Bewusst ohne Angular
 * `HttpClient` und ohne `WorkerClient`: Letzterer setzt bei 401/403 den
 * Sitzungszustand der Hauptanwendung und gehört dorthin – hier gibt es keine
 * Sitzung.
 *
 * Wie in der Hauptanwendung: `credentials: 'same-origin'`, `redirect: 'error'`
 * und ein Zeitlimit. Der `X-Requested-With`-Kopf entfällt, weil die Seite kein
 * Access-Gate vor sich hat, auf das er wirken könnte.
 */

/** Was die öffentliche Seite über das Fahrzeug erfahren darf – mehr nicht. */
export interface OeffentlichesFahrzeug {
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
}

export interface Meldung {
  name: string;
  stand: number;
  bemerkung: string;
}

export class MeldungFehler extends Error {
  constructor(
    nachricht: string,
    readonly code: string,
  ) {
    super(nachricht);
  }
}

const ZEITLIMIT_MS = 20_000;

function pfad(token: string): string {
  return `/api/oeffentlich/meldung/${encodeURIComponent(token)}`;
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

export async function ladeFahrzeug(token: string): Promise<OeffentlichesFahrzeug> {
  const antwort = await fetch(pfad(token), {
    credentials: 'same-origin',
    redirect: 'error',
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  if (!antwort.ok) {
    throw await fehlerAus(antwort, 'Dieser QR-Code gehört zu keinem Fahrzeug.');
  }
  const inhalt = (await antwort.json()) as Record<string, unknown>;
  if (
    typeof inhalt['bezeichnung'] !== 'string' ||
    typeof inhalt['funkrufname'] !== 'string' ||
    typeof inhalt['kennzeichen'] !== 'string'
  ) {
    throw new MeldungFehler('Unerwartete Antwort des Servers.', 'ANTWORT_UNGUELTIG');
  }
  return {
    bezeichnung: inhalt['bezeichnung'],
    funkrufname: inhalt['funkrufname'],
    kennzeichen: inhalt['kennzeichen'],
  };
}

export async function sendeMeldung(token: string, meldung: Meldung): Promise<void> {
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
}
