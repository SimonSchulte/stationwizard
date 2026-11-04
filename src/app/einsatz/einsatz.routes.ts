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
  {
    path: 'vb-vorlagen',
    loadComponent: () =>
      import('./pages/vb-vorlagen/vb-vorlagen').then((modul) => modul.VbVorlagen),
  },
  {
    path: 'vb-vorlagen/:id',
    data: { modus: 'vorlage' },
    loadComponent: () => import('./pages/vb-editor/vb-editor').then((modul) => modul.VbEditor),
  },
  {
    path: 'einsatz/:id',
    loadComponent: () =>
      import('./pages/einsatz-detail/einsatz-detail').then((modul) => modul.EinsatzDetail),
  },
  {
    path: 'einsatz/:id/vb',
    data: { modus: 'vorbereitung' },
    loadComponent: () => import('./pages/vb-editor/vb-editor').then((modul) => modul.VbEditor),
  },
];
