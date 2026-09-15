import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { KmBerichtStoreService } from '../../../fahrzeuge/services/km-bericht-store.service';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Einstellungen, VersandwegStatus } from '../../models/systemkonfiguration.model';
import { SystemkonfigurationStoreService } from '../../services/systemkonfiguration-store.service';
import { Systemkonfiguration } from './systemkonfiguration';

function einstellungen(ueberschreibung: Partial<Einstellungen> = {}): Einstellungen {
  return {
    kmBerichtEmpfaenger: 'leitung@example.test',
    kmBerichtVersandweg: 'email-routing',
    kmBerichtBetreff: 'Kilometerstandsbericht',
    ...ueberschreibung,
  };
}

function aufbau(optionen: {
  gespeichert?: Einstellungen;
  versandwege?: VersandwegStatus[];
  bestaetigt?: boolean;
}) {
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
  const berichtStore = {
    berichtLaden: vi.fn(),
    senden: vi.fn().mockResolvedValue(true),
    bericht: signal(null),
    laedt: signal(false),
    ladeFehler: signal(''),
    sendet: signal(false),
    sendeFehler: signal(''),
    quittung: signal(null),
  };
  const dialog = { bestaetigen: vi.fn().mockResolvedValue(optionen.bestaetigt ?? true) };

  TestBed.configureTestingModule({
    providers: [
      { provide: SystemkonfigurationStoreService, useValue: store },
      { provide: KmBerichtStoreService, useValue: berichtStore },
      { provide: DialogDienst, useValue: dialog },
    ],
  });
  const seite = TestBed.runInInjectionContext(() => new Systemkonfiguration());
  return { seite, store, berichtStore, dialog };
}

describe('Systemkonfiguration', () => {
  it('lädt Einstellungen und Vorschau beim Start', () => {
    const { seite, store, berichtStore } = aufbau({});
    seite.ngOnInit();
    expect(store.laden).toHaveBeenCalledOnce();
    expect(berichtStore.berichtLaden).toHaveBeenCalledOnce();
  });

  it('sendet erst nach Bestätigung des Dialogs', async () => {
    const { seite, berichtStore, dialog } = aufbau({});
    await seite.senden();
    expect(dialog.bestaetigen).toHaveBeenCalledOnce();
    expect(berichtStore.senden).toHaveBeenCalledOnce();
  });

  it('sendet nichts, wenn die Bestätigung abgelehnt wird', async () => {
    const { seite, berichtStore } = aufbau({ bestaetigt: false });
    await seite.senden();
    expect(berichtStore.senden).not.toHaveBeenCalled();
  });

  it('fragt gar nicht erst, solange keine Adresse gespeichert ist', async () => {
    const { seite, dialog, berichtStore } = aufbau({
      gespeichert: einstellungen({ kmBerichtEmpfaenger: '' }),
    });
    await seite.senden();
    expect(dialog.bestaetigen).not.toHaveBeenCalled();
    expect(berichtStore.senden).not.toHaveBeenCalled();
  });

  it('sperrt den Versand ohne gespeicherte Adresse', () => {
    const { seite } = aufbau({ gespeichert: einstellungen({ kmBerichtEmpfaenger: '' }) });
    expect(seite.empfaengerGesetzt()).toBe(false);
    expect(seite.versandMoeglich()).toBe(false);
  });

  it('sperrt den Versand, wenn der gespeicherte Weg nicht eingerichtet ist', () => {
    const { seite } = aufbau({
      gespeichert: einstellungen({ kmBerichtVersandweg: 'resend' }),
    });
    expect(seite.empfaengerGesetzt()).toBe(true);
    expect(seite.gewaehlterWegVerfuegbar()).toBe(false);
    expect(seite.versandMoeglich()).toBe(false);
  });

  it('gibt den Versand frei, wenn Adresse und Weg stehen', () => {
    const { seite } = aufbau({});
    expect(seite.versandMoeglich()).toBe(true);
  });

  it('bezieht sich beim Versand auf den gespeicherten, nicht den entworfenen Empfänger', async () => {
    const { seite, store, dialog } = aufbau({});
    store.entwurf.set(einstellungen({ kmBerichtEmpfaenger: 'noch-nicht@example.test' }));

    await seite.senden();

    expect(dialog.bestaetigen.mock.calls[0][0]).toContain('leitung@example.test');
    expect(dialog.bestaetigen.mock.calls[0][0]).not.toContain('noch-nicht@example.test');
  });
});
