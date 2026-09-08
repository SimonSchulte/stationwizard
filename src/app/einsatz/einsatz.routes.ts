import { Routes } from '@angular/router';

export const einsatzRouten: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/planning-list/planning-list').then((modul) => modul.PlanningList),
  },
  {
    path: 'editor',
    loadComponent: () =>
      import('./pages/planning-editor/planning-editor').then((modul) => modul.PlanningEditor),
  },
];
