import { inject } from '@angular/core';
import type { NavigationError } from '@angular/router';
import { DialogDienst } from './dialog/dialog-dienst';
import { VerlassenSchutz } from './verlassen-schutz';

/**
 * Ein offener Tab hält die Chunk-Namen des Deployments, mit dem er geladen
 * wurde. Nach einem neuen Deployment gibt es diese Dateien nicht mehr; Static
 * Assets beantwortet den unbekannten Pfad mit `index.html`, und der Browser
 * verwirft das als Modul ("Failed to fetch dynamically imported module"). Das
 * Modul ließe sich dann bis zum Neuladen nicht öffnen.
 *
 * Abhilfe ist ein vollständiges Neuladen genau der Zieladresse, das den neuen
 * Stand holt. Ein reiner Zeitstempel in `sessionStorage` verhindert eine
 * Endlosschleife, falls ein Deployment selbst unvollständig ist; er enthält
 * keine Fachdaten.
 */
const NEULADEN_SCHLUESSEL = 'stationwizard.neuladen.veralteter-stand';
const NEULADEN_SPERRE_MS = 30_000;

const CHUNK_FEHLER = [
  'Failed to fetch dynamically imported module', // Chromium
  'error loading dynamically imported module', // Firefox
  'Importing a module script failed', // Safari
];

export function istVeralteterChunk(fehler: unknown): boolean {
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  return CHUNK_FEHLER.some((muster) => text.includes(muster));
}

/** `true`, wenn neu geladen werden darf; vermerkt den Versuch gleich mit. */
export function neuladenErlaubt(speicher: Storage, jetzt: number): boolean {
  try {
    const letzter = Number(speicher.getItem(NEULADEN_SCHLUESSEL));
    if (Number.isFinite(letzter) && jetzt - letzter < NEULADEN_SPERRE_MS) {
      return false;
    }
    speicher.setItem(NEULADEN_SCHLUESSEL, String(jetzt));
    return true;
  } catch {
    // Ohne Speicher keine Schleifensperre - dann lieber nicht automatisch laden.
    return false;
  }
}

/**
 * Für `withNavigationErrorHandler()`. Läuft im Injektionskontext des Routers.
 * Andere Navigationsfehler bleiben unberührt.
 */
export function veraltetenStandBehandeln(fehler: NavigationError): void {
  if (!istVeralteterChunk(fehler.error)) {
    return;
  }
  const dialog = inject(DialogDienst);
  const verlassenSchutz = inject(VerlassenSchutz);
  const meldung =
    'Es gibt eine neue Version von Stationwizard. Bitte die Seite neu laden, um diesen Bereich zu öffnen.';

  if (verlassenSchutz.hatUngesicherteAenderungen()) {
    void dialog.hinweis(
      `${meldung} Vorher die ungesicherten Änderungen speichern.`,
      'Neue Version verfügbar',
    );
    return;
  }
  let speicher: Storage | null = null;
  try {
    speicher = window.sessionStorage;
  } catch {
    speicher = null;
  }
  if (speicher && neuladenErlaubt(speicher, Date.now())) {
    window.location.assign(`${window.location.pathname}${window.location.search}#${fehler.url}`);
    window.location.reload();
    return;
  }
  void dialog.hinweis(meldung, 'Neue Version verfügbar');
}
