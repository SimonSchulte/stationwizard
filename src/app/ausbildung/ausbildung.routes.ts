import { Routes } from '@angular/router';

export const ausbildungRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/jahresplan/jahresplan').then((modul) => modul.Jahresplan),
    title: 'Ausbildungsplanung · stationwizard',
  },
];
