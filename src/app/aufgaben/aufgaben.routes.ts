import { Routes } from '@angular/router';

/**
 * Fachübergreifender Bereich „Offene Aufgaben": alles, was auf eine
 * Entscheidung einer Führungskraft wartet. Die Fachlogik bleibt beim jeweiligen
 * Modul – hier liegt nur die Übersicht, die ihre Einträge über
 * `kern/aufgaben/aufgabenquelle.ts` einsammelt.
 *
 * Anders als der Verwaltungsbereich steht dieser Bereich zwar jeder Anmeldung
 * offen, zeigt aber nur, was die aufrufende Person auch entscheiden darf: die
 * Rollenprüfung findet serverseitig statt (`worker/src/einreichungen.ts`).
 */
export const aufgabenRouten: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/aufgaben-uebersicht/aufgaben-uebersicht').then(
        (modul) => modul.AufgabenUebersicht,
      ),
  },
  {
    path: 'kilometermeldungen',
    loadComponent: () =>
      import('../fahrzeuge/pages/ablesung-freigabe/ablesung-freigabe').then(
        (modul) => modul.AblesungFreigabe,
      ),
  },
];
