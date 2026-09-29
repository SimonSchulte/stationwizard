import { Routes } from '@angular/router';

export const personalRouten: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/personal-uebersicht/personal-uebersicht').then(
        (modul) => modul.PersonalUebersicht,
      ),
  },
  {
    path: 'fuehrerscheine',
    loadComponent: () =>
      import('./pages/fuehrerscheinliste/fuehrerscheinliste').then(
        (modul) => modul.Fuehrerscheinliste,
      ),
  },
];
