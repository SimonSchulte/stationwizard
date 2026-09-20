import { Routes } from '@angular/router';

export const angebotswesenRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/angebotswesen-dashboard/angebotswesen-dashboard').then(
        (modul) => modul.AngebotswesenDashboard,
      ),
  },
  {
    path: 'preiskatalog',
    loadComponent: () =>
      import('./pages/preiskatalog/preiskatalog').then((modul) => modul.Preiskatalog),
  },
  {
    path: 'angebote',
    loadComponent: () =>
      import('./pages/angebot-liste/angebot-liste').then((modul) => modul.AngebotListe),
  },
  {
    path: 'angebote/neu',
    loadComponent: () =>
      import('./pages/angebot-detail/angebot-detail').then((modul) => modul.AngebotDetail),
  },
  {
    path: 'angebote/:id',
    loadComponent: () =>
      import('./pages/angebot-detail/angebot-detail').then((modul) => modul.AngebotDetail),
  },
];
