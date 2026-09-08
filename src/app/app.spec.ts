import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('Gemeinsame Anwendung', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
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
  });
});
