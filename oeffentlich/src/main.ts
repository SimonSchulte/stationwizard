import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { OeffentlicheSeite } from './app/oeffentliche-seite';

/**
 * Eigenständige Anwendung für die beiden öffentlichen Seiten: Kilometermeldung
 * unter `/e/<token>` und Fahrzeugcheck unter `/c/<token>`.
 *
 * Kein Router, kein Angular Material, keine Shell der Hauptanwendung: jede
 * Seite kennt genau einen Gegenstand und hat bewusst keinen Weg zurück in die
 * App (siehe docs/konzept-fahrzeuge.md, Abschnitt 10). Die Abschottung ist
 * damit strukturell und nicht nur optisch.
 *
 * Auch kein `provideHttpClient()`: die Seiten sprechen mit wenigen festen
 * Endpunkten und nutzen dafür `fetch` direkt – das spart das gesamte
 * HttpClient-Paket im Bündel.
 */
bootstrapApplication(OeffentlicheSeite, {
  providers: [provideZonelessChangeDetection()],
}).catch((fehler) => console.error(fehler));
