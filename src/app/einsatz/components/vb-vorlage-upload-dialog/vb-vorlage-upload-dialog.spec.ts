import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it } from 'vitest';
import { VbExcelErgebnis } from '../../services/vb-excel-import';
import {
  testAbschnitt,
  testInhalt,
  testLaufzettel,
  testPosition,
} from '../../testing/vb-testdaten';
import { VbVorlageUploadDialog } from './vb-vorlage-upload-dialog';

describe('VbVorlageUploadDialog', () => {
  function erzeuge(ergebnis: Partial<VbExcelErgebnis> = {}, titel = 'Packliste Beispiel') {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            titel,
            ergebnis: {
              inhalt: testInhalt({
                abschnitte: [
                  testAbschnitt({
                    titel: 'Rollwagen',
                    laufzettel: [
                      testLaufzettel({
                        lagerort: 'Lager Nord',
                        positionen: [testPosition(), testPosition()],
                      }),
                    ],
                  }),
                ],
              }),
              auffaelligkeiten: [],
              zeilen: 2,
              verschiebung: 0,
              ...ergebnis,
            },
          },
        },
        { provide: MatDialogRef, useValue: { close: () => {} } },
      ],
    });
    const fixture = TestBed.createComponent(VbVorlageUploadDialog);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('zeigt Abschnitte mit Farbpunkt und Laufzettel mit Herkunft, Positionen und Belegung', () => {
    const { element } = erzeuge();
    const text = (element.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('2 Materialzeilen · 1 Abschnitte');
    expect(text).toContain('Rollwagen');
    expect(text).toContain('Von Lager Nord · 2 Positionen · 2/23');
    expect(element.querySelectorAll('app-abschnitt-farbpunkt')).toHaveLength(1);
  });

  it('übernimmt den Titel aus dem Dateinamen und erlaubt das Speichern', () => {
    const { fixture } = erzeuge();
    expect(fixture.componentInstance.titel()).toBe('Packliste Beispiel');
    expect(fixture.componentInstance.kannSpeichern()).toBe(true);
  });

  it('listet Auffälligkeiten auf', () => {
    const { element } = erzeuge({ auffaelligkeiten: ['Zeile 5 enthält Platzhalter'] });
    expect(element.querySelector('.auffaelligkeiten')?.textContent).toContain(
      'Zeile 5 enthält Platzhalter',
    );
  });

  it('sperrt das Speichern, solange die Vorabprüfung Probleme meldet', () => {
    const { fixture, element } = erzeuge({
      inhalt: testInhalt({
        abschnitte: [
          testAbschnitt({
            laufzettel: [testLaufzettel({ positionen: [testPosition({ material: '' })] })],
          }),
        ],
      }),
    });
    expect(fixture.componentInstance.kannSpeichern()).toBe(false);
    expect(element.querySelector('.probleme')?.textContent).toContain('Materialangabe');
  });

  it('sperrt das Speichern bei leerem Titel', () => {
    const { fixture } = erzeuge({}, '');
    expect(fixture.componentInstance.kannSpeichern()).toBe(false);
  });
});
