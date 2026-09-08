import { describe, expect, it } from 'vitest';
import { erzeugeTestplanung } from './testing/pep-testdaten';
import { lesePepDatei, serialisierePepDatei } from './pep-datei';

describe('PEP-Dateiformat', () => {
  it('erhält Planung, Qualifikationen und Referenzen beim JSON-Rundlauf', () => {
    const planung = erzeugeTestplanung();
    expect(lesePepDatei(serialisierePepDatei(planung))).toEqual({ planung, versionWarning: false });
  });

  it('warnt bei abweichender Version und erhält unbekannte Fachfelder', () => {
    const planung = { ...erzeugeTestplanung(), erweiterung: { test: true } };
    const text = serialisierePepDatei(planung).replace('"version": "1.0"', '"version": "2.0"');
    expect(lesePepDatei(text)).toEqual({ planung, versionWarning: true });
  });

  it('weist unvollständige Struktur und ungültiges JSON zurück', () => {
    expect(() => lesePepDatei('{')).toThrow('gültiges JSON');
    expect(() => lesePepDatei('{"version":"1.0","planung":{}}')).toThrow('ungültige Struktur');
  });

  it('weist unbekannte Qualifikationen, doppelte IDs und verwaiste Referenzen zurück', () => {
    const planung = erzeugeTestplanung();
    const text = serialisierePepDatei(planung);
    expect(() => lesePepDatei(text.replace('"GF"', '"UNBEKANNT"'))).toThrow('Qualifikation');
    const doppelt = {
      ...planung,
      einsatzkraefte: [...planung.einsatzkraefte, ...planung.einsatzkraefte],
    };
    expect(() => serialisierePepDatei(doppelt)).toThrow('ungültige Daten');
    planung.einsatzkraefte = [];
    expect(() => serialisierePepDatei(planung)).toThrow('ungültige Daten');
  });
});
