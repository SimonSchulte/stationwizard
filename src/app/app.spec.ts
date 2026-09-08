import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { signal } from '@angular/core';
import { Benutzerkontext } from './kern/benutzerkontext';
import { WorkerClient } from './kern/worker-client';
import { VerlassenSchutz } from './kern/verlassen-schutz';

describe('Gemeinsame Anwendung', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: Benutzerkontext,
          useValue: {
            email: signal('uebung@example.invalid'),
            laedt: signal(false),
            fehler: signal(''),
            laden: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('erstellt die Anwendung (übernommener PEP-App-Test)', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('zeigt den gemeinsamen Namen und beide Fachbereiche', () => {
    const ansicht = TestBed.createComponent(App);
    ansicht.detectChanges();
    const element = ansicht.nativeElement as HTMLElement;
    expect(element.querySelector('.marke')?.textContent).toContain('stationwizard');
    expect(element.querySelector('nav')?.textContent).toContain('Ausbildung');
    expect(element.querySelector('nav')?.textContent).toContain('Einsatz');
    expect(element.querySelector('.benutzer')?.textContent).toContain('uebung@example.invalid');
    expect(element.querySelector('.benutzer a')?.getAttribute('href')).toBe(
      '/cdn-cgi/access/logout',
    );
  });
  it('verhindert Verlassen nur bei ungesicherten Fachdaten', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const ereignis = {
      preventDefault: vi.fn(),
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent;
    app.verlassenPruefen(ereignis);
    expect(ereignis.preventDefault).not.toHaveBeenCalled();
    TestBed.inject(VerlassenSchutz).registrieren(() => true);
    app.verlassenPruefen(ereignis);
    expect(ereignis.preventDefault).toHaveBeenCalledOnce();
  });

  it('zeigt bei abgelaufener Sitzung eine neue Anmeldung und blendet die alte Identität aus', () => {
    TestBed.inject(WorkerClient).zustand.set('sitzung-abgelaufen');
    const ansicht = TestBed.createComponent(App);
    ansicht.detectChanges();
    const element = ansicht.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Erneut anmelden');
    expect(element.querySelector('.benutzer')?.textContent).not.toContain('uebung@example.invalid');
  });
});
