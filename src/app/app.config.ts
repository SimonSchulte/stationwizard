import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withHashLocation, withNavigationErrorHandler } from '@angular/router';
import { provideAufgabenquelle } from './kern/aufgaben/aufgabenquelle';
import { FahrzeugAufgabenquelle } from './fahrzeuge/services/fahrzeug-aufgabenquelle';
import { CheckAufgabenquelle } from './material/services/check-aufgabenquelle';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { DatepickerDeutsch } from './kern/kalender/datepicker-deutsch';
import { PaginatorDeutsch } from './kern/paginator-deutsch';
import { routes } from './app.routes';
import { veraltetenStandBehandeln } from './kern/veralteter-stand';

registerLocaleData(localeDe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation(), withNavigationErrorHandler(veraltetenStandBehandeln)),
    provideHttpClient(),
    { provide: LOCALE_ID, useValue: 'de-DE' },
    { provide: MatPaginatorIntl, useClass: PaginatorDeutsch },
    { provide: MatDatepickerIntl, useClass: DatepickerDeutsch },
    // Fachquellen für den Bereich "Offene Aufgaben". Eine weitere Aufgabenart
    // ist eine weitere Zeile hier, kein Umbau.
    provideAufgabenquelle(FahrzeugAufgabenquelle),
    provideAufgabenquelle(CheckAufgabenquelle),
  ],
};
