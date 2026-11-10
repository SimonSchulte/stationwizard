import { Routes } from '@angular/router';
import { verlassenGuard } from '../kern/verlassen-guard';
import type { AufbauEditor } from './pages/aufbau-editor/aufbau-editor';
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
    // Die Vorlagenliste liegt in der Verwaltung (PEP- und Aufbau-Vorlagen gemeinsam).
    path: 'vb-vorlagen',
    pathMatch: 'full',
    redirectTo: '/verwaltung/einsatz-vorlagen',
  },
  {
    path: 'vb-vorlagen/:id',
    pathMatch: 'full',
    redirectTo: '/verwaltung/einsatz-vorlagen',
  },
  {
    // Alte Lesezeichen der früheren Einsatzseite: die Übersicht hat jetzt PEP und Aufbau direkt.
    path: 'einsatz/:id',
    pathMatch: 'full',
    redirectTo: '',
  },
  {
    // Die frühere Vorbereitung (VB) ist im Aufbau aufgegangen.
    path: 'einsatz/:id/vb',
    pathMatch: 'full',
    redirectTo: 'einsatz/:id/aufbau',
  },
  {
    // Aufbau (Packliste) eines Einsatzes; ohne Aufbau bietet die Seite „leer“ oder „aus Vorlage“ an.
    path: 'einsatz/:id/aufbau',
    data: { modus: 'aufbau' },
    canDeactivate: [verlassenGuard<AufbauEditor>((seite) => seite.hatUngespeichertes())],
    loadComponent: () =>
      import('./pages/aufbau-editor/aufbau-editor').then((modul) => modul.AufbauEditor),
  },
  {
    path: 'aufbau-vorlagen/:id',
    data: { modus: 'vorlage' },
    canDeactivate: [verlassenGuard<AufbauEditor>((seite) => seite.hatUngespeichertes())],
    loadComponent: () =>
      import('./pages/aufbau-editor/aufbau-editor').then((modul) => modul.AufbauEditor),
  },
];
