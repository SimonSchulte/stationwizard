import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { MeldungSeite } from './app/meldung-seite';

/**
 * Eigenständige Anwendung für die öffentliche Kilometermeldung.
 *
 * Kein Router, kein Angular Material, keine Shell der Hauptanwendung: die Seite
 * kennt genau ein Fahrzeug und hat bewusst keinen Weg zurück in die App (siehe
 * docs/konzept-fahrzeuge.md, Abschnitt 10). Die Abschottung ist damit
 * strukturell und nicht nur optisch.
 *
 * Auch kein `provideHttpClient()`: die Seite spricht mit genau zwei Endpunkten
 * und nutzt dafür `fetch` direkt – das spart das gesamte HttpClient-Paket im
 * Bündel.
 */
bootstrapApplication(MeldungSeite, {
  providers: [provideZonelessChangeDetection()],
}).catch((fehler) => console.error(fehler));
