import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { computed, signal } from '@angular/core';
import { Benutzerkontext } from './kern/benutzerkontext';
import { WorkerClient } from './kern/worker-client';
import { VerlassenSchutz } from './kern/verlassen-schutz';
import { anzeigenameAusEmail, initialenAusAnzeigename } from './kern/text/anzeigename';

describe('Gemeinsame Anwendung', () => {
  beforeEach(async () => {
    const email = signal('uebung@example.invalid');
    const anzeigename = computed(() => anzeigenameAusEmail(email()));
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: Benutzerkontext,
          useValue: {
            email,
            laedt: signal(false),
            fehler: signal(''),
            laden: vi.fn(),
            anzeigename,
            initialen: computed(() => initialenAusAnzeigename(anzeigename())),
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
    expect(element.querySelector('.marke')?.textContent).toContain('HiorgWache');
    expect(element.querySelector('nav')?.textContent).toContain('Ausbildung');
    expect(element.querySelector('nav')?.textContent).toContain('Einsatz');
    expect(element.querySelector('nav')?.textContent).toContain('Fahrzeuge');
    expect(element.querySelector('.benutzer-name')?.textContent).toContain('Uebung');
    expect(element.querySelector('.benutzer-name')?.getAttribute('title')).toBe(
      'uebung@example.invalid',
    );
    expect(element.querySelector('.benutzer-avatar')?.textContent?.trim()).toBe('U');
    expect(element.querySelector('.benutzer a')?.getAttribute('href')).toBe(
      '/cdn-cgi/access/logout',
    );
  });
  it('zeigt einen immer sichtbaren Footer', () => {
    const ansicht = TestBed.createComponent(App);
    ansicht.detectChanges();
    const element = ansicht.nativeElement as HTMLElement;
    expect(element.querySelector('footer.shell-fuss')?.textContent).toContain('HiorgWache');
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
    expect(element.querySelector('.benutzer')?.textContent).not.toContain('Uebung');
  });
});
