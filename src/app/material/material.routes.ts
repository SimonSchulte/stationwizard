import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { verlassenGuard } from '../kern/verlassen-guard';
import { BehaelterStoreService } from './services/behaelter-store.service';
import { PruefvorlageStoreService } from './services/pruefvorlage-store.service';

const behaelterVerlassen = verlassenGuard(() =>
  inject(BehaelterStoreService).hatUngesicherteAenderungen(),
);
const vorlageVerlassen = verlassenGuard(() =>
  inject(PruefvorlageStoreService).hatUngesicherteAenderungen(),
);

/**
 * Materialverwaltung. Dieser Stand enthält die Pflege der Prüfvorlagen, die
 * Behälterverwaltung und den Fahrzeugcheck selbst; die Berichte und der öffentliche
 * QR-Weg folgen in eigenen Arbeitspaketen.
 *
 * `behaelter/neu` steht vor `behaelter/:id`, damit der feste Pfad nicht als
 * Kennung gelesen wird – dieselbe Reihenfolgeregel wie in den Fahrzeugrouten.
 */
export const materialRouten: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/material-dashboard/material-dashboard').then(
        (modul) => modul.MaterialDashboard,
      ),
  },
  {
    path: 'behaelter/neu',
    canDeactivate: [behaelterVerlassen],
    loadComponent: () =>
      import('./pages/behaelter-detail/behaelter-detail').then((modul) => modul.BehaelterDetail),
  },
  {
    path: 'behaelter/:id/check',
    loadComponent: () =>
      import('./pages/behaelter-check/behaelter-check').then((modul) => modul.BehaelterCheck),
  },
  {
    path: 'checks/:id',
    loadComponent: () =>
      import('./pages/check-ansicht/check-ansicht').then((modul) => modul.CheckAnsicht),
  },
  {
    path: 'behaelter/:id',
    canDeactivate: [behaelterVerlassen],
    loadComponent: () =>
      import('./pages/behaelter-detail/behaelter-detail').then((modul) => modul.BehaelterDetail),
  },
  {
    path: 'vorlagen',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/vorlage-liste/vorlage-liste').then((modul) => modul.VorlageListe),
  },
  {
    path: 'vorlagen/:id',
    canDeactivate: [vorlageVerlassen],
    loadComponent: () =>
      import('./pages/vorlage-editor/vorlage-editor').then((modul) => modul.VorlageEditor),
  },
];
