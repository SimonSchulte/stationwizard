import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { LOCALE_ID } from '@angular/core';
import { routes } from './app.routes';
import { PlanungStoreService } from './einsatz/services/planung-store.service';
import { erzeugeTestplanung } from './einsatz/services/testing/pep-testdaten';

describe('Fachbereiche in der gemeinsamen Anwendung', () => {
  beforeEach(() => {
    registerLocaleData(localeDe);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pfad: string) => {
        if (pfad === '/api/kalender') return Response.json({ jahre: [], ideen: null });
        if (pfad === '/api/hiorg/verbindung')
          return Response.json({ eingerichtet: true, verbunden: true });
        if (pfad === '/api/hiorg/personal')
          return Response.json({
            personen: [
              {
                id: 'p1',
                vorname: 'Erika',
                nachname: 'Beispiel',
                gruppen: ['Bereitschaft'],
                qualifikationen: [{ liste: 'med', name: 'Rettungssanitäter/in', kurz: 'RS' }],
              },
            ],
          });
        if (pfad === '/api/efs/getveranstaltungen')
          return Response.json({ status: 'OK', einsaetze: [] });
        if (pfad.startsWith('https://feiertage-api.de'))
          throw new Error('Test verwendet lokale Feiertagsberechnung');
        throw new Error('Nicht vorbereitete Testanfrage');
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        { provide: LOCALE_ID, useValue: 'de-DE' },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('öffnet den Kalender und bietet bei leerer Datenbank die Excel-Übernahme an', async () => {
    const ansicht = await RouterTestingHarness.create('/kalender');
    await ansicht.fixture.whenStable();
    ansicht.detectChanges();
    const text = ansicht.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Kalender');
    expect(text).toContain('Datenbank verbunden');
    expect(text).toContain('Excel übernehmen');
  });

  it('leitet die frühere Ausbildungsroute auf den Kalender um', async () => {
    const ansicht = await RouterTestingHarness.create('/ausbildung');
    expect(TestBed.inject(Router).url).toBe('/kalender');
    expect(ansicht.routeNativeElement?.textContent).toContain('Kalender');
  });

  it('öffnet die Einsatzliste mit dauerhafter HiOrg-Anbindung, ohne Nextcloud-Abschnitte', async () => {
    const ansicht = await RouterTestingHarness.create('/einsatzplanung');
    const text = ansicht.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Anstehend');
    expect(text).toContain('Einsatz anlegen');
    expect(text).not.toContain('Gespeicherte Einsatzpläne');
    expect(text).not.toContain('Lokale Planungen');
    expect(text).not.toContain('Nextcloud');
    expect(text).not.toContain('Neue Planung');
  });

  it('leitet die frühere Einsatzadresse auf die Einsatzplanung um', async () => {
    const ansicht = await RouterTestingHarness.create('/einsatz');
    expect(TestBed.inject(Router).url).toBe('/einsatzplanung');
    await ansicht.navigateByUrl('/einsatz/editor');
    expect(TestBed.inject(Router).url).toBe('/einsatzplanung/editor');
  });

  it('leitet die frühere Einsatzseite auf die Übersicht um', async () => {
    const ansicht = await RouterTestingHarness.create();
    await ansicht.navigateByUrl('/einsatzplanung/einsatz/x');
    expect(TestBed.inject(Router).url).toBe('/einsatzplanung');
  });

  it('kennt die Seiten für Aufbau und Vorlagen', async () => {
    const ansicht = await RouterTestingHarness.create();
    for (const pfad of [
      '/einsatzplanung/aufbau-vorlagen/x',
      '/einsatzplanung/pep-vorlagen/x',
      '/einsatzplanung/pep-vorlagen/neu',
      '/einsatzplanung/einsatz/x/aufbau',
    ]) {
      await ansicht.navigateByUrl(pfad);
      expect(TestBed.inject(Router).url).toBe(pfad);
    }
  });

  it('leitet die Adressen der früheren Vorbereitung auf Aufbau und Verwaltung um', async () => {
    const ansicht = await RouterTestingHarness.create();
    await ansicht.navigateByUrl('/einsatzplanung/einsatz/x/vb');
    expect(TestBed.inject(Router).url).toBe('/einsatzplanung/einsatz/x/aufbau');
    await ansicht.navigateByUrl('/einsatzplanung/vb-vorlagen/x');
    expect(TestBed.inject(Router).url).toBe('/verwaltung/einsatz-vorlagen');
  });

  it('leitet die frühere Vorlagenliste in die Verwaltung um', async () => {
    const ansicht = await RouterTestingHarness.create();
    await ansicht.navigateByUrl('/einsatzplanung/vb-vorlagen');
    expect(TestBed.inject(Router).url).toBe('/verwaltung/einsatz-vorlagen');
  });

  it('zeigt im Personalmodul das vom HiOrg-Server gelieferte Personal als Tabelle', async () => {
    const ansicht = await RouterTestingHarness.create('/personal');
    await vi.waitFor(() => {
      expect(ansicht.routeNativeElement?.querySelector('table')).toBeTruthy();
    });
    ansicht.detectChanges();
    const text = ansicht.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Beispiel');
    expect(text).toContain('Rettungssanitäter/in (RS)');
    expect(text).toContain('1 von 1 Personen');
  });

  it('öffnet einen geladenen Einsatzplan im Editor mit „Speichern“ statt Nextcloud', async () => {
    const planung = erzeugeTestplanung();
    TestBed.inject(PlanungStoreService).oeffneGespeichert(planung);
    const ansicht = await RouterTestingHarness.create('/einsatzplanung/editor');
    const eingaben = [...ansicht.routeNativeElement!.querySelectorAll('input')];
    expect(eingaben.some((eingabe) => eingabe.value === planung.name)).toBe(true);
    const text = ansicht.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Speichern');
    expect(text).not.toContain('Nextcloud');
  });
});
