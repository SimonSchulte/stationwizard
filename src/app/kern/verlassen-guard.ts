import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { DialogDienst } from './dialog/dialog-dienst';

export const VERLASSEN_NACHRICHT =
  'Es gibt Änderungen, die noch nicht gespeichert sind. Beim Verlassen gehen sie verloren.';

/**
 * Route-Guard (`canDeactivate`) für Seiten mit eigenem Bearbeitungsstand: fragt beim Verlassen
 * nach, wenn `pruefung` Ungespeichertes meldet. Die Prüfung läuft im Injektionskontext, darf
 * also `inject()` verwenden; sie bekommt die Seitenkomponente. Gilt auch beim Wechsel zwischen
 * zwei Einträgen derselben Seite (Adressparameter), nicht aber für das Schließen des Tabs –
 * das bleibt beim `beforeunload`-Schutz der Shell.
 */
export function verlassenGuard<T = unknown>(pruefung: (seite: T) => boolean): CanDeactivateFn<T> {
  return (seite) => {
    if (!pruefung(seite)) return true;
    return inject(DialogDienst).bestaetigen(
      VERLASSEN_NACHRICHT,
      'Ungespeicherte Änderungen',
      'Verwerfen und verlassen',
    );
  };
}
