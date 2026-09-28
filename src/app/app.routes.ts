import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./kern/startseite/startseite').then((m) => m.Startseite),
    title: 'HiorgWache',
  },
  {
    path: 'ausbildung',
    loadChildren: () => import('./ausbildung/ausbildung.routes').then((m) => m.ausbildungRoutes),
    title: 'Ausbildungsplanung · HiorgWache',
  },
  {
    path: 'einsatz',
    loadChildren: () => import('./einsatz/einsatz.routes').then((m) => m.einsatzRouten),
    title: 'Einsatzplanung · HiorgWache',
  },
  {
    path: 'fahrzeuge',
    loadChildren: () => import('./fahrzeuge/fahrzeuge.routes').then((m) => m.fahrzeugeRoutes),
    title: 'Fahrzeuge · HiorgWache',
  },
  {
    path: 'angebotswesen',
    loadChildren: () =>
      import('./angebotswesen/angebotswesen.routes').then((m) => m.angebotswesenRoutes),
    title: 'Angebotswesen · HiorgWache',
  },
  {
    path: 'material',
    loadChildren: () => import('./material/material.routes').then((m) => m.materialRouten),
    title: 'Materialverwaltung · HiorgWache',
  },
  {
    path: 'aufgaben',
    loadChildren: () => import('./aufgaben/aufgaben.routes').then((m) => m.aufgabenRouten),
    title: 'Offene Aufgaben · HiorgWache',
  },
  {
    path: 'verwaltung',
    loadChildren: () => import('./verwaltung/verwaltung.routes').then((m) => m.verwaltungRouten),
    title: 'Verwaltung · HiorgWache',
  },
  { path: '**', redirectTo: '' },
];
