import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { PepVorlageUploadDaten, PepVorlageUploadDialog } from './pep-vorlage-upload-dialog';

describe('PepVorlageUploadDialog', () => {
  function erzeuge(daten: Partial<PepVorlageUploadDaten> = {}) {
    const schliessen = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { titel: 'Übungsplan', posten: 3, positionen: 11, einsatzkraefte: 7, ...daten },
        },
        { provide: MatDialogRef, useValue: { close: schliessen } },
      ],
    });
    const fixture = TestBed.createComponent(PepVorlageUploadDialog);
    fixture.detectChanges();
    return { fixture, schliessen, element: fixture.nativeElement as HTMLElement };
  }

  it('belegt den Titel vor und zeigt Kennzahlen und den Hinweis auf Nichtübernommenes', () => {
    const { fixture, element } = erzeuge();
    expect(fixture.componentInstance.titel()).toBe('Übungsplan');
    const text = element.textContent ?? '';
    expect(text).toContain('3 Posten · 11 Positionen');
    expect(text).toContain(
      'Einsatzkräfte (7), Zuordnungen und Einsatzleitung werden nicht übernommen',
    );
  });

  it('sperrt das Speichern bei leerem Titel', () => {
    const { fixture } = erzeuge({ titel: '   ' });
    expect(fixture.componentInstance.kannSpeichern()).toBe(false);
    fixture.componentInstance.titel.set('Neu');
    expect(fixture.componentInstance.kannSpeichern()).toBe(true);
  });

  it('kürzt einen zu langen Planungsnamen auf die Titelgrenze', () => {
    const { fixture } = erzeuge({ titel: 'x'.repeat(300) });
    expect(fixture.componentInstance.titel()).toHaveLength(200);
  });
});
