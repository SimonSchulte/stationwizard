import { TestBed } from '@angular/core/testing';
import { Ablesungseinreichung } from '../models/fahrzeug.model';
import { ApiEinreichungStorage } from '../storage/api-einreichung-storage';
import { FahrzeugAufgabenquelle } from './fahrzeug-aufgabenquelle';

function einreichung(ueberschreibung: Partial<Ablesungseinreichung> = {}): Ablesungseinreichung {
  return {
    id: 'e1',
    fahrzeugId: 'f1',
    bezeichnung: 'MTW 1',
    kennzeichen: 'XY-TE 123',
    gruppe: 'fuehrung',
    abgelesenAm: '2026-09-15',
    stand: 12_345,
    eingereichtAm: '2026-09-15T08:00:00.000Z',
    gemeldetVonName: 'Maxi Muster',
    bemerkung: '',
    letzterStand: 12_000,
    letzterStandAm: '2026-08-01',
    ...ueberschreibung,
  };
}

function quelle(...offene: Ablesungseinreichung[]): FahrzeugAufgabenquelle {
  // Zurücksetzen, weil ein Test mehrere Quellen nacheinander aufbaut.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ApiEinreichungStorage, useValue: { ladeOffene: async () => offene } }],
  });
  return TestBed.inject(FahrzeugAufgabenquelle);
}

describe('FahrzeugAufgabenquelle', () => {
  it('bildet eine Meldung als Aufgabe ab', async () => {
    const [aufgabe] = await quelle(einreichung()).ladeAufgaben();
    expect(aufgabe).toMatchObject({
      id: 'fahrzeug-kilometermeldung:e1',
      quelle: 'fahrzeug-kilometermeldung',
      titel: 'Kilometermeldung MTW 1 · XY-TE 123',
      eingegangenAm: '2026-09-15T08:00:00.000Z',
      dringlichkeit: 'normal',
    });
    expect(aufgabe?.beschreibung).toContain('12.345 km');
    expect(aufgabe?.beschreibung).toContain('Maxi Muster');
    expect(aufgabe?.routerLink).toEqual(['/aufgaben', 'kilometermeldungen']);
  });

  it('hebt einen Rückschritt und einen großen Sprung hervor', async () => {
    const rueckschritt = await quelle(einreichung({ stand: 11_000 })).ladeAufgaben();
    expect(rueckschritt[0]?.dringlichkeit).toBe('hinweis');
    expect(rueckschritt[0]?.beschreibung).toContain('Wert prüfen');

    const sprung = await quelle(einreichung({ stand: 99_000 })).ladeAufgaben();
    expect(sprung[0]?.dringlichkeit).toBe('hinweis');
  });

  it('meldet ohne bekannten Vorstand keinen Hinweis', async () => {
    // Ein Fahrzeug ohne jede Ablesung ist ein gültiger Fall; ohne Vergleichswert
    // gibt es nichts zu beanstanden.
    const [aufgabe] = await quelle(
      einreichung({ letzterStand: null, letzterStandAm: null }),
    ).ladeAufgaben();
    expect(aufgabe?.dringlichkeit).toBe('normal');
  });

  it('kommt ohne Kennzeichen aus', async () => {
    const [aufgabe] = await quelle(einreichung({ kennzeichen: '' })).ladeAufgaben();
    expect(aufgabe?.titel).toBe('Kilometermeldung MTW 1');
  });
});
