import { TestBed } from '@angular/core/testing';
import { leseNamen, Namensverzeichnis } from './namensverzeichnis';
import { WorkerClient } from './worker-client';

describe('Namensverzeichnis', () => {
  const json = vi.fn();
  beforeEach(() => {
    json.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: { json } }] });
  });

  it('nimmt den selbst gewählten Namen, sonst den aus der Adresse abgeleiteten', async () => {
    json.mockResolvedValue({
      benutzer: [
        { email: 'Max.Mustermann@example.test', anzeigename: 'Maxi' },
        { email: 'erika.muster@example.test', anzeigename: null },
      ],
    });
    const namen = TestBed.inject(Namensverzeichnis);
    expect(namen.anzeige('max.mustermann@example.test')).toBe('Max Mustermann');
    await namen.laden();
    expect(namen.anzeige('max.mustermann@example.test')).toBe('Maxi');
    expect(namen.anzeige('erika.muster@example.test')).toBe('Erika Muster');
    expect(namen.anzeige(null)).toBe('');
  });

  it('bleibt bei der Ableitung, wenn die Liste nicht ladbar ist', async () => {
    json.mockRejectedValue(new Error('aus'));
    const namen = TestBed.inject(Namensverzeichnis);
    await namen.laden();
    expect(namen.anzeige('a.b@example.test')).toBe('A B');
  });

  it('übernimmt eine eigene Änderung sofort und nimmt sie mit null zurück', () => {
    const namen = TestBed.inject(Namensverzeichnis);
    namen.vermerke('a.b@example.test', 'Ali');
    expect(namen.anzeige('a.b@example.test')).toBe('Ali');
    namen.vermerke('a.b@example.test', null);
    expect(namen.anzeige('a.b@example.test')).toBe('A B');
  });

  it('liest aus fremden Daten nur Adresse und nichtleeren Namen', () => {
    expect(leseNamen(null).size).toBe(0);
    expect(leseNamen({ benutzer: [{ email: 'x@y.z', anzeigename: '  ' }, 5] }).size).toBe(0);
  });
});
