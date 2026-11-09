import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { verlassenGuard } from '../kern/verlassen-guard';
import { AngebotStoreService } from './services/angebot-store.service';

const angebotVerlassen = verlassenGuard(() => {
  const store = inject(AngebotStoreService);
  return store.hatUngesicherteAenderungen() && !store.istUnberuehrtNeu();
});

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
    canDeactivate: [angebotVerlassen],
    loadComponent: () =>
      import('./pages/angebot-detail/angebot-detail').then((modul) => modul.AngebotDetail),
  },
  {
    path: 'angebote/:id',
    canDeactivate: [angebotVerlassen],
    loadComponent: () =>
      import('./pages/angebot-detail/angebot-detail').then((modul) => modul.AngebotDetail),
  },
];
