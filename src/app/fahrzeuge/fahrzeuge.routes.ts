import { Routes } from '@angular/router';

export const fahrzeugeRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/fahrzeug-liste/fahrzeug-liste').then((modul) => modul.FahrzeugListe),
  },
  {
    path: 'neu',
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
    loadComponent: () =>
      import('./pages/fahrzeug-detail/fahrzeug-detail').then((modul) => modul.FahrzeugDetail),
  },
];
