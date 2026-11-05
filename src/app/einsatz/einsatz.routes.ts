import { Routes } from '@angular/router';
import { planungVerlassenGuard } from './services/planung-verlassen-guard';

export const einsatzRouten: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/planning-list/planning-list').then((modul) => modul.PlanningList),
  },
  {
    // PEP eines Einsatzes (oder eine über „Datei öffnen“ geladene Datei); ein offener,
    // ungespeicherter Plan lebt nur hier, deshalb fragt der Schutz beim Verlassen nach.
    path: 'editor',
    canDeactivate: [planungVerlassenGuard],
    loadComponent: () =>
      import('./pages/planning-editor/planning-editor').then((modul) => modul.PlanningEditor),
  },
  {
    // PEP-Vorlage bearbeiten: derselbe Editor im Modus „Vorlage“ (ohne Helferpool).
    path: 'pep-vorlagen/neu',
    data: { modus: 'vorlage' },
    canDeactivate: [planungVerlassenGuard],
    loadComponent: () =>
      import('./pages/planning-editor/planning-editor').then((modul) => modul.PlanningEditor),
  },
  {
    path: 'pep-vorlagen/:id',
    data: { modus: 'vorlage' },
    canDeactivate: [planungVerlassenGuard],
    loadComponent: () =>
      import('./pages/planning-editor/planning-editor').then((modul) => modul.PlanningEditor),
  },
  {
    // Die Vorlagenliste liegt in der Verwaltung (PEP- und VB-Vorlagen gemeinsam).
    path: 'vb-vorlagen',
    pathMatch: 'full',
    redirectTo: '/verwaltung/einsatz-vorlagen',
  },
  {
    path: 'vb-vorlagen/:id',
    data: { modus: 'vorlage' },
    loadComponent: () => import('./pages/vb-editor/vb-editor').then((modul) => modul.VbEditor),
  },
  {
    // Alte Lesezeichen der früheren Einsatzseite: die Übersicht hat jetzt PEP und VB direkt.
    path: 'einsatz/:id',
    pathMatch: 'full',
    redirectTo: '',
  },
  {
    path: 'einsatz/:id/vb',
    data: { modus: 'vorbereitung' },
    loadComponent: () => import('./pages/vb-editor/vb-editor').then((modul) => modul.VbEditor),
  },
];
