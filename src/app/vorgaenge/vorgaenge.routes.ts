import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { verlassenGuard } from '../kern/verlassen-guard';
import { VorgangStoreService } from './services/vorgang-store.service';

const meldungVerlassen = verlassenGuard(() =>
  inject(VorgangStoreService).hatUngesicherteAenderungen(),
);

/** Vorgänge „Fahrzeug/Material defekt“ und ihre Schadens- und Verlustmeldung. */
export const vorgaengeRouten: Routes = [
  {
    path: ':id',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/vorgang-detail/vorgang-detail').then((modul) => modul.VorgangDetail),
  },
  {
    path: ':id/meldung',
    canDeactivate: [meldungVerlassen],
    loadComponent: () =>
      import('./pages/schadensmeldung/schadensmeldung').then((modul) => modul.Schadensmeldung),
  },
];
