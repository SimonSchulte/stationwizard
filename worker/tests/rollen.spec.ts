import { describe, expect, it } from 'vitest';
import { darfFreigeben, freigabeGruppen, leseRolle, pruefeFreigabeRecht } from '../src/rollen';
import { FakeBenutzerDb } from './benutzer-db-fake';

const GRUPPEN = ['betreuung', 'tesi', 'fuehrung', 'sanitaet'] as const;

function benutzer(db: FakeBenutzerDb, email: string, rolle: string | null): void {
  db.benutzer.set(email, {
    email,
    rolle,
    sonderrollen: '[]',
    erster_zugriff_am: '2026-01-01T00:00:00.000Z',
    letzter_zugriff_am: '2026-01-01T00:00:00.000Z',
    rolle_geaendert_am: null,
    rolle_geaendert_von: null,
  });
}

describe('darfFreigeben', () => {
  it('lässt die Zugführung für jede Gruppe freigeben', () => {
    for (const gruppe of GRUPPEN) {
      expect(darfFreigeben('zugfuehrung', gruppe)).toBe(true);
    }
  });

  it('lässt eine Gruppenführung nur für die eigene Gruppe freigeben', () => {
    for (const eigene of GRUPPEN) {
      for (const gruppe of GRUPPEN) {
        expect(darfFreigeben(`gruppenfuehrung-${eigene}`, gruppe)).toBe(eigene === gruppe);
      }
    }
  });

  it('lässt die Gruppenführung Verpflegung nie freigeben', () => {
    // Für Verpflegung sind fachlich keine Fahrzeuge vorgesehen; die Gruppe
    // kennt das Fahrzeugmodell nicht (Migration 0006).
    for (const gruppe of GRUPPEN) {
      expect(darfFreigeben('gruppenfuehrung-verpflegung', gruppe)).toBe(false);
    }
  });

  it('lässt Helfer und Personen ohne Rolle nie freigeben', () => {
    for (const gruppe of GRUPPEN) {
      expect(darfFreigeben('helfer', gruppe)).toBe(false);
      expect(darfFreigeben(null, gruppe)).toBe(false);
    }
  });

  it('gibt bei leerer Gruppe nur der Zugführung recht', () => {
    expect(darfFreigeben('', '')).toBe(false);
    expect(darfFreigeben('gruppenfuehrung-', '')).toBe(false);
    expect(darfFreigeben('zugfuehrung', '')).toBe(true);
  });
});

describe('freigabeGruppen', () => {
  it('nennt für die Zugführung alle vier Gruppen', () => {
    expect([...freigabeGruppen('zugfuehrung')].sort()).toEqual([...GRUPPEN].sort());
  });

  it('nennt für eine Gruppenführung genau die eigene Gruppe', () => {
    expect(freigabeGruppen('gruppenfuehrung-sanitaet')).toEqual(['sanitaet']);
  });

  it('nennt ohne Rolle keine Gruppe', () => {
    expect(freigabeGruppen(null)).toEqual([]);
    expect(freigabeGruppen('helfer')).toEqual([]);
    expect(freigabeGruppen('gruppenfuehrung-verpflegung')).toEqual([]);
  });
});

describe('leseRolle', () => {
  it('liefert null für eine Person ohne Zeile', async () => {
    const db = new FakeBenutzerDb();
    expect(await leseRolle(db as never, 'unbekannt@example.invalid')).toBeNull();
  });

  it('liest Rolle und Sonderrollen', async () => {
    const db = new FakeBenutzerDb();
    benutzer(db, 'a@example.invalid', 'zugfuehrung');
    db.benutzer.get('a@example.invalid')!.sonderrollen = '["verwaltungshelfer"]';
    expect(await leseRolle(db as never, 'a@example.invalid')).toEqual({
      rolle: 'zugfuehrung',
      sonderrollen: ['verwaltungshelfer'],
    });
  });
});

describe('pruefeFreigabeRecht', () => {
  it('sperrt, wenn die Rollenverwaltung nicht eingerichtet ist', async () => {
    const antwort = await pruefeFreigabeRecht({}, { email: 'a@example.invalid' }, 'sanitaet');
    expect(antwort?.status).toBe(503);
    expect(await antwort?.json()).toMatchObject({ code: 'ROLLEN_KONFIGURATION_FEHLT' });
  });

  it('sperrt eine Person ohne Zeile in der Benutzerdatenbank', async () => {
    const db = new FakeBenutzerDb();
    const antwort = await pruefeFreigabeRecht(
      { BENUTZER_DB: db as never },
      { email: 'neu@example.invalid' },
      'sanitaet',
    );
    expect(antwort?.status).toBe(403);
    expect(await antwort?.json()).toMatchObject({ code: 'FREIGABE_NICHT_ERLAUBT' });
  });

  it('sperrt die Gruppenführung einer fremden Gruppe', async () => {
    const db = new FakeBenutzerDb();
    benutzer(db, 'gf@example.invalid', 'gruppenfuehrung-betreuung');
    const antwort = await pruefeFreigabeRecht(
      { BENUTZER_DB: db as never },
      { email: 'gf@example.invalid' },
      'sanitaet',
    );
    expect(antwort?.status).toBe(403);
  });

  it('lässt die Gruppenführung der eigenen Gruppe durch', async () => {
    const db = new FakeBenutzerDb();
    benutzer(db, 'gf@example.invalid', 'gruppenfuehrung-sanitaet');
    expect(
      await pruefeFreigabeRecht(
        { BENUTZER_DB: db as never },
        { email: 'gf@example.invalid' },
        'sanitaet',
      ),
    ).toBeNull();
  });

  it('verrät im Fehlertext die eigene Rolle nicht', async () => {
    const db = new FakeBenutzerDb();
    benutzer(db, 'h@example.invalid', 'helfer');
    const antwort = await pruefeFreigabeRecht(
      { BENUTZER_DB: db as never },
      { email: 'h@example.invalid' },
      'tesi',
    );
    const inhalt = JSON.stringify(await antwort?.json());
    expect(inhalt).not.toContain('helfer');
    expect(inhalt).not.toContain('h@example.invalid');
  });
});
