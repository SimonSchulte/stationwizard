import { entferneAlteZugangsdaten } from './app/kern/alte-zugangsdaten';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

entferneAlteZugangsdaten();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
