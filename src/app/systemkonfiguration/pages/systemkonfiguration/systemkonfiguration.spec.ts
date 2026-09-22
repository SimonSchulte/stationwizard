import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Einstellungen, VersandwegStatus } from '../../models/systemkonfiguration.model';
import { SystemkonfigurationStoreService } from '../../services/systemkonfiguration-store.service';
import { Systemkonfiguration } from './systemkonfiguration';

function einstellungen(ueberschreibung: Partial<Einstellungen> = {}): Einstellungen {
  return {
    kmBerichtEmpfaenger: 'leitung@example.test',
    kmBerichtVersandweg: 'email-routing',
    kmBerichtBetreff: 'Kilometerstandsbericht',
    materialBestellscheinEmpfaenger: '',
    materialMaengelLandEmpfaenger: '',
    materialMaengelSegEmpfaenger: '',
    materialVersandweg: 'email-routing',
    materialBetreff: 'Materialmeldung',
    ...ueberschreibung,
  };
}

function aufbau(optionen: { gespeichert?: Einstellungen; versandwege?: VersandwegStatus[] }) {
  const gespeichert = signal<Einstellungen | null>(optionen.gespeichert ?? einstellungen());
  const versandwege = optionen.versandwege ?? [
    { weg: 'email-routing' as const, verfuegbar: true },
    { weg: 'resend' as const, verfuegbar: false },
  ];
  const store = {
    laden: vi.fn(),
    speichern: vi.fn(),
    entwurfAendern: vi.fn(),
    entwurfVerwerfen: vi.fn(),
    istVerfuegbar: (weg: string) =>
      versandwege.some((eintrag) => eintrag.weg === weg && eintrag.verfuegbar),
    gespeicherteEinstellungen: gespeichert,
    entwurf: signal<Einstellungen | null>(einstellungen()),
    laedt: signal(false),
    ladeFehler: signal(''),
    speichert: signal(false),
    speicherFehler: signal(''),
    gespeichert: signal(false),
    ungespeichert: signal(false),
  };

  TestBed.configureTestingModule({
    providers: [{ provide: SystemkonfigurationStoreService, useValue: store }],
  });
  const seite = TestBed.runInInjectionContext(() => new Systemkonfiguration());
  return { seite, store };
}

describe('Systemkonfiguration', () => {
  it('lädt Einstellungen beim Start', () => {
    const { seite, store } = aufbau({});
    seite.ngOnInit();
    expect(store.laden).toHaveBeenCalledOnce();
  });

  it('ändert Empfänger, Betreff und Versandweg im Entwurf', () => {
    const { seite, store } = aufbau({});
    seite.empfaengerAendern('neu@example.test');
    expect(store.entwurfAendern).toHaveBeenCalledWith({ kmBerichtEmpfaenger: 'neu@example.test' });

    seite.betreffAendern('Neuer Betreff');
    expect(store.entwurfAendern).toHaveBeenCalledWith({ kmBerichtBetreff: 'Neuer Betreff' });

    seite.versandwegAendern('resend');
    expect(store.entwurfAendern).toHaveBeenCalledWith({ kmBerichtVersandweg: 'resend' });
  });

  it('speichert und verwirft über den Store', () => {
    const { seite, store } = aufbau({});
    seite.speichern();
    expect(store.speichern).toHaveBeenCalledOnce();

    seite.verwerfen();
    expect(store.entwurfVerwerfen).toHaveBeenCalledOnce();
  });

  it('meldet nicht eingerichtete Versandwege über den Store', () => {
    const { seite } = aufbau({});
    expect(seite.istVerfuegbar('email-routing')).toBe(true);
    expect(seite.istVerfuegbar('resend')).toBe(false);
  });
});
