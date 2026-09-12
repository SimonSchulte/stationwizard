import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./kern/startseite/startseite').then((m) => m.Startseite),
    title: 'stationwizard',
  },
  {
    path: 'ausbildung',
    loadChildren: () => import('./ausbildung/ausbildung.routes').then((m) => m.ausbildungRoutes),
    title: 'Ausbildungsplanung · stationwizard',
  },
  {
    path: 'einsatz',
    loadChildren: () => import('./einsatz/einsatz.routes').then((m) => m.einsatzRouten),
    title: 'Einsatzplanung · stationwizard',
  },
  {
    path: 'fahrzeuge',
    loadChildren: () => import('./fahrzeuge/fahrzeuge.routes').then((m) => m.fahrzeugeRoutes),
    title: 'Fahrzeuge · stationwizard',
  },
  { path: '**', redirectTo: '' },
];
