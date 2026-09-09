import { describe, expect, it } from 'vitest';
import { dekodiereEntitaeten } from './entitaeten';

describe('HTML-Entitäten aus Fremdquellen', () => {
  it('dekodiert die benannten Entitäten', () => {
    expect(dekodiereEntitaeten('Aufbau &amp; Abbau')).toBe('Aufbau & Abbau');
    expect(dekodiereEntitaeten('&lt;Platzhalter&gt;')).toBe('<Platzhalter>');
    expect(dekodiereEntitaeten('&quot;Zitat&quot;')).toBe('"Zitat"');
    expect(dekodiereEntitaeten('Helfer&apos;s Abend')).toBe("Helfer's Abend");
  });

  it('dekodiert numerische Entitäten dezimal und hexadezimal', () => {
    expect(dekodiereEntitaeten('Ma&#223;nahme')).toBe('Maßnahme');
    expect(dekodiereEntitaeten('Ma&#xDF;nahme')).toBe('Maßnahme');
  });

  it('dekodiert genau einmal, damit doppelt Kodiertes erkennbar bleibt', () => {
    expect(dekodiereEntitaeten('a&amp;amp;b')).toBe('a&amp;b');
  });

  it('lässt unbekannte und unzulässige Entitäten unverändert stehen', () => {
    expect(dekodiereEntitaeten('&unbekannt;')).toBe('&unbekannt;');
    expect(dekodiereEntitaeten('Zeile&#10;Umbruch')).toBe('Zeile&#10;Umbruch');
  });

  it('lässt Text ohne Entitäten unberührt', () => {
    expect(dekodiereEntitaeten('Fachdienstabend Verpflegung')).toBe('Fachdienstabend Verpflegung');
  });
});
