import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideAufgabenquelle } from './kern/aufgaben/aufgabenquelle';
import { FahrzeugAufgabenquelle } from './fahrzeuge/services/fahrzeug-aufgabenquelle';
import { routes } from './app.routes';

registerLocaleData(localeDe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    { provide: LOCALE_ID, useValue: 'de-DE' },
    // Fachquellen für den Bereich "Offene Aufgaben". Eine weitere Aufgabenart
    // ist eine weitere Zeile hier, kein Umbau.
    provideAufgabenquelle(FahrzeugAufgabenquelle),
  ],
};
