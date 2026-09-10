import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { LOCALE_ID } from '@angular/core';
import { routes } from './app.routes';
import { PlanungStoreService } from './einsatz/services/planung-store.service';

describe('Fachbereiche in der gemeinsamen Anwendung', () => {
  beforeEach(() => {
    registerLocaleData(localeDe);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pfad: string) => {
        if (pfad === '/api/nextcloud/planungen') return Response.json({ dateien: [] });
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
        provideNoopAnimations(),
        { provide: LOCALE_ID, useValue: 'de-DE' },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('öffnet den Jahresplan samt Quelle-Auswahl über die Ausbildungsroute', async () => {
    const ansicht = await RouterTestingHarness.create('/ausbildung');
    expect(ansicht.routeNativeElement?.textContent).toContain('Dienstplaner');
    expect(ansicht.routeNativeElement?.querySelector('button')).toBeTruthy();
  });

  it('öffnet die Einsatzliste mit dauerhafter HiOrg-Anbindung und Cloud-Dateien', async () => {
    const ansicht = await RouterTestingHarness.create('/einsatz');
    expect(ansicht.routeNativeElement?.textContent).toContain('Gespeicherte Einsatzpläne');
    expect(ansicht.routeNativeElement?.textContent).toContain('Veranstaltungen (HiOrg-Server)');
  });

  it('öffnet einen lokalen Einsatzplan im Editor', async () => {
    const planung = TestBed.inject(PlanungStoreService).createPlanung('Erfundener Übungseinsatz');
    const ansicht = await RouterTestingHarness.create('/einsatz/editor');
    const eingaben = [...ansicht.routeNativeElement!.querySelectorAll('input')];
    expect(eingaben.some((eingabe) => eingabe.value === planung.name)).toBe(true);
    expect(
      ansicht.routeNativeElement?.querySelector('button[aria-label="In Nextcloud speichern"]'),
    ).toBeTruthy();
  });
});
