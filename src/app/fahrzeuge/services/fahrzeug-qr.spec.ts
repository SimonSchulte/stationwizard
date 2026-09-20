import { describe, expect, it } from 'vitest';
import { fahrzeugQrZiele } from './fahrzeug-qr';

const ID = '01234567-89ab-4cde-8fab-0123456789ab';
const TOKEN = 'a'.repeat(32);
const BASIS = 'https://stationwizard.example.test';

describe('fahrzeugQrZiele', () => {
  it('bildet die beiden internen Kurzpfade ohne Token', () => {
    const ziele = fahrzeugQrZiele(ID, null, BASIS);
    expect(ziele.uebersichtUrl).toBe(`${BASIS}/f/${ID}`);
    expect(ziele.kmUrl).toBe(`${BASIS}/f/${ID}/km`);
    // Die interne Erfassung trägt bewusst weiterhin kein Geheimnis.
    expect(ziele.uebersichtUrl).not.toContain(TOKEN);
    expect(ziele.kmUrl).not.toContain(TOKEN);
  });

  it('liefert das öffentliche Ziel nur mit Token', () => {
    expect(fahrzeugQrZiele(ID, null, BASIS).oeffentlichUrl).toBeNull();
    expect(fahrzeugQrZiele(ID, '', BASIS).oeffentlichUrl).toBeNull();
    expect(fahrzeugQrZiele(ID, TOKEN, BASIS).oeffentlichUrl).toBe(`${BASIS}/e/${TOKEN}`);
  });

  it('nennt im öffentlichen Ziel die Fahrzeugkennung nicht', () => {
    // Der Pfad trägt nur das Token; ein Foto des Aufklebers gibt keine interne
    // Kennung her.
    expect(fahrzeugQrZiele(ID, TOKEN, BASIS).oeffentlichUrl).not.toContain(ID);
  });

  it('zeigt ohne explizite Basis-URL auf die produktive Domain, nie auf den aktuellen Ursprung', () => {
    // Aufkleber werden gedruckt und müssen unabhängig davon funktionieren, von
    // welchem Worker (Vorschau, workers.dev) aus sie erzeugt wurden.
    const ziele = fahrzeugQrZiele(ID, TOKEN);
    expect(ziele.uebersichtUrl).toBe(`https://hiorg-wache.com/f/${ID}`);
    expect(ziele.oeffentlichUrl).toBe(`https://hiorg-wache.com/e/${TOKEN}`);
  });
});
