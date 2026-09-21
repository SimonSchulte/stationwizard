import { Routes } from '@angular/router';

/**
 * Materialverwaltung. Dieser Stand enthält die Pflege der Prüfvorlagen und die
 * Behälterverwaltung; der Fahrzeugcheck selbst, die Berichte und der
 * öffentliche QR-Weg folgen in eigenen Arbeitspaketen.
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
    loadComponent: () =>
      import('./pages/behaelter-detail/behaelter-detail').then((modul) => modul.BehaelterDetail),
  },
  {
    path: 'behaelter/:id',
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
    loadComponent: () =>
      import('./pages/vorlage-editor/vorlage-editor').then((modul) => modul.VorlageEditor),
  },
];
