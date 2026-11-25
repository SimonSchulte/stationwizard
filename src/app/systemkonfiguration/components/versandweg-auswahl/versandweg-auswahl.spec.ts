import { TestBed } from '@angular/core/testing';
import { VersandwegAuswahl } from './versandweg-auswahl';

describe('VersandwegAuswahl', () => {
  function aufbau(eingerichtet: ('email-routing' | 'resend')[]) {
    const fixture = TestBed.createComponent(VersandwegAuswahl);
    fixture.componentRef.setInput('wert', 'email-routing');
    fixture.componentRef.setInput('eingerichtet', eingerichtet);
    fixture.detectChanges();
    return fixture;
  }

  it('zeigt den gewählten Versandweg', () => {
    const fixture = aufbau(['email-routing', 'resend']);
    expect(fixture.nativeElement.querySelector('mat-select')).not.toBeNull();
    expect(fixture.componentInstance.wert()).toBe('email-routing');
  });

  it('meldet eine Auswahl über das Modell', () => {
    const fixture = aufbau(['email-routing']);
    fixture.componentInstance.wert.set('resend');
    expect(fixture.componentInstance.wert()).toBe('resend');
  });
});
