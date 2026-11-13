import { Routes } from '@angular/router';
import { verlassenGuard } from '../kern/verlassen-guard';
import type { Stammdaten } from '../einsatz/pages/stammdaten/stammdaten';

/**
 * Administrationsbereich. Die Fachlogik der einzelnen Aufgaben bleibt beim
 * jeweiligen Fachmodul – hier liegt nur der Einstieg. Der Bereich kennt kein
 * durchgesetztes Rollenmodell: er steht jeder geprüften Anmeldung offen (siehe
 * docs/konzept-fahrzeuge.md, Abschnitt 8). Der Fahrzeug-QR-Übersichtsbogen auf
 * der Startseite ist eine Ausnahme – er blendet sich nur für die Rolle
 * `zugfuehrung` ein (`BenutzerverwaltungStoreService.istZugfuehrung`), rein als
 * UI-Regel ohne serverseitige Durchsetzung.
 */
export const verwaltungRouten: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/verwaltung-startseite/verwaltung-startseite').then(
        (modul) => modul.VerwaltungStartseite,
      ),
  },
  {
    path: 'fahrzeuge-import',
    loadComponent: () =>
      import('../fahrzeuge/pages/fahrzeug-import/fahrzeug-import').then(
        (modul) => modul.FahrzeugImport,
      ),
  },
  {
    path: 'kalender-migration',
    loadComponent: () =>
      import('../ausbildung/pages/kalender-migration/kalender-migration').then(
        (modul) => modul.KalenderMigration,
      ),
  },
  {
    path: 'systemkonfiguration',
    loadComponent: () =>
      import('../systemkonfiguration/pages/systemkonfiguration/systemkonfiguration').then(
        (modul) => modul.Systemkonfiguration,
      ),
  },
  {
    path: 'pruefvorlagen',
    loadComponent: () =>
      import('../material/pages/vorlage-liste/vorlage-liste').then((modul) => modul.VorlageListe),
  },
  {
    path: 'benutzer',
    loadComponent: () =>
      import('../benutzerverwaltung/pages/benutzer-liste/benutzer-liste').then(
        (modul) => modul.BenutzerListe,
      ),
  },
  {
    path: 'fuehrerschein-vorlage',
    loadComponent: () =>
      import('../personal/pages/fuehrerschein-vorlage-verwaltung/fuehrerschein-vorlage-verwaltung').then(
        (modul) => modul.FuehrerscheinVorlageVerwaltung,
      ),
  },
  {
    path: 'ehrungsantrag-vorlage',
    data: { vorlage: 'ehrungsantrag' },
    loadComponent: () =>
      import('../personal/pages/fuehrerschein-vorlage-verwaltung/fuehrerschein-vorlage-verwaltung').then(
        (modul) => modul.FuehrerscheinVorlageVerwaltung,
      ),
  },
  {
    path: 'einsatz-vorlagen',
    loadComponent: () =>
      import('../einsatz/pages/einsatz-vorlagen/einsatz-vorlagen').then(
        (modul) => modul.EinsatzVorlagen,
      ),
  },
  {
    path: 'packliste-import',
    loadComponent: () =>
      import('../einsatz/pages/packliste-import/packliste-import').then(
        (modul) => modul.PacklisteImport,
      ),
  },
  {
    path: 'einsatz-stammdaten',
    canDeactivate: [verlassenGuard<Stammdaten>((seite) => seite.hatUngespeichertes())],
    loadComponent: () =>
      import('../einsatz/pages/stammdaten/stammdaten').then((modul) => modul.Stammdaten),
  },
];
