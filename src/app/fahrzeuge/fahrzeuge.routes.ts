import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { verlassenGuard } from '../kern/verlassen-guard';
import { FahrzeugStoreService } from './services/fahrzeug-store.service';

const fahrzeugVerlassen = verlassenGuard(() =>
  inject(FahrzeugStoreService).hatUngesicherteAenderungen(),
);

export const fahrzeugeRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/fahrzeug-dashboard/fahrzeug-dashboard').then(
        (modul) => modul.FahrzeugDashboard,
      ),
  },
  {
    path: 'liste',
    loadComponent: () =>
      import('./pages/fahrzeug-liste/fahrzeug-liste').then((modul) => modul.FahrzeugListe),
  },
  {
    path: 'neu',
    canDeactivate: [fahrzeugVerlassen],
    loadComponent: () =>
      import('./pages/fahrzeug-detail/fahrzeug-detail').then((modul) => modul.FahrzeugDetail),
  },
  {
    path: ':id/km',
    loadComponent: () =>
      import('./pages/km-erfassung/km-erfassung').then((modul) => modul.KmErfassung),
  },
  {
    path: ':id',
    canDeactivate: [fahrzeugVerlassen],
    loadComponent: () =>
      import('./pages/fahrzeug-detail/fahrzeug-detail').then((modul) => modul.FahrzeugDetail),
  },
];
