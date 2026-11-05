import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { PlanungStoreService } from './planung-store.service';

/**
 * Fragt vor dem Verlassen des PEP-Editors nach, wenn die Planung nicht gespeichert ist: ein
 * offener Plan lebt nur im Editor und ginge sonst verloren.
 */
export const planungVerlassenGuard: CanDeactivateFn<unknown> = () => {
  const store = inject(PlanungStoreService);
  const dialog = inject(DialogDienst);
  if (!store.hatUngesichertes()) return true;
  return dialog.bestaetigen(
    'Die Planung hat Änderungen, die nicht gespeichert sind. Beim Verlassen gehen sie verloren. Zur Sicherung kannst du vorher im Editor JSON herunterladen.',
    'Ungespeicherte Änderungen',
    'Verwerfen und verlassen',
  );
};
