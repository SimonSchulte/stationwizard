import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import {
  Einstellungen,
  VersandwegStatus,
} from '../../../systemkonfiguration/models/systemkonfiguration.model';
import { SystemkonfigurationStoreService } from '../../../systemkonfiguration/services/systemkonfiguration-store.service';
import { KmBerichtStoreService } from '../../services/km-bericht-store.service';
import { KilometerUebersicht } from './kilometer-uebersicht';

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
  const konfiguration = {
    laden: vi.fn(),
    istVerfuegbar: (weg: string) =>
      versandwege.some((eintrag) => eintrag.weg === weg && eintrag.verfuegbar),
    gespeicherteEinstellungen: gespeichert,
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
      { provide: SystemkonfigurationStoreService, useValue: konfiguration },
      { provide: KmBerichtStoreService, useValue: berichtStore },
      { provide: DialogDienst, useValue: dialog },
    ],
  });
  const seite = TestBed.runInInjectionContext(() => new KilometerUebersicht());
  return { seite, konfiguration, berichtStore, dialog };
}

describe('KilometerUebersicht', () => {
  it('lädt Einstellungen und Vorschau beim Start', () => {
    const { seite, konfiguration, berichtStore } = aufbau({});
    seite.ngOnInit();
    expect(konfiguration.laden).toHaveBeenCalledOnce();
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

  it('bezieht sich beim Versand auf den gespeicherten Empfänger', async () => {
    const { seite, dialog } = aufbau({});
    await seite.senden();
    expect(dialog.bestaetigen.mock.calls[0][0]).toContain('leitung@example.test');
  });
});
