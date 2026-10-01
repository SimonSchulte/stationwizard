import { Routes } from '@angular/router';

export const ausbildungRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/jahresplan/jahresplan').then((modul) => modul.Jahresplan),
    title: 'Kalender · HiorgWache',
  },
  {
    path: 'uebernahme',
    loadComponent: () =>
      import('./pages/jahresuebernahme/jahresuebernahme').then((modul) => modul.Jahresuebernahme),
    title: 'Jahresübernahme · HiorgWache',
  },
];
