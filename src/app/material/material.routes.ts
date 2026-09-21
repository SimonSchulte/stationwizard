import { Routes } from '@angular/router';

/**
 * Materialverwaltung. Dieser Stand enthält die Pflege der Prüfvorlagen; die
 * Behälterübersicht, der Fahrzeugcheck selbst, die Berichte und der öffentliche
 * QR-Weg folgen in eigenen Arbeitspaketen.
 *
 * Die Einstiegsroute zeigt deshalb vorerst auf die Vorlagenliste und wird
 * später durch das Materialdashboard ersetzt.
 */
export const materialRouten: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'vorlagen' },
  {
    path: 'vorlagen',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/vorlage-liste/vorlage-liste').then((modul) => modul.VorlageListe),
  },
  {
    path: 'vorlagen/:id',
    loadComponent: () =>
      import('./pages/vorlage-editor/vorlage-editor').then((modul) => modul.VorlageEditor),
  },
];
