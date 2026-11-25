import { Injectable, inject, signal } from '@angular/core';
import { AbrufPuffer } from './abruf-puffer';
import { anzeigenameAusEmail } from './text/anzeigename';
import { istNichtleererText, istObjekt } from './text/pruefung';
import { WorkerClient } from './worker-client';

/**
 * Löst E-Mail-Adressen zu den Namen auf, die die Personen selbst in ihren Benutzereinstellungen
 * gewählt haben (Rückfall: der aus der Adresse abgeleitete Name). Die E-Mail-Adresse bleibt der
 * Schlüssel jeder Zuordnung; hier geht es ausschließlich um die Darstellung in Logeinträgen,
 * Listen und Ausgaben.
 *
 * Die Namen kommen mit einem einzigen Abruf der Benutzerliste (`/api/benutzerverwaltung`) und
 * werden kurz gepuffert; ein Fehler (etwa ohne Datenbank) lässt es bei der Ableitung.
 */
@Injectable({ providedIn: 'root' })
export class Namensverzeichnis {
  private readonly worker = inject(WorkerClient);
  private readonly puffer = new AbrufPuffer<ReadonlyMap<string, string>>(5 * 60_000);
  private readonly eigene = signal<ReadonlyMap<string, string>>(new Map());

  /** Der darzustellende Name; ohne eigenen Namen der aus der Adresse abgeleitete. */
  anzeige(email: string | null | undefined): string {
    if (!email) return '';
    return this.eigene().get(email.toLowerCase()) ?? anzeigenameAusEmail(email);
  }

  /** Der von der Person selbst gewählte Name; `null`, wenn keiner gesetzt (oder noch nicht geladen) ist. */
  eigenerName(email: string | null | undefined): string | null {
    if (!email) return null;
    return this.eigene().get(email.toLowerCase()) ?? null;
  }

  /** Lädt die Namen einmal nach; ein Fehler bleibt folgenlos. */
  async laden(): Promise<void> {
    try {
      this.eigene.set(
        await this.puffer.hole('namen', async () => {
          const antwort = await this.worker.json<unknown>('/api/benutzerverwaltung');
          return leseNamen(antwort);
        }),
      );
    } catch {
      // Ohne Liste bleibt es bei den abgeleiteten Namen.
    }
  }

  /** Übernimmt eine eigene Änderung sofort, ohne die Liste neu abzurufen. */
  vermerke(email: string, name: string | null): void {
    const neu = new Map(this.eigene());
    if (name) neu.set(email.toLowerCase(), name);
    else neu.delete(email.toLowerCase());
    this.eigene.set(neu);
    this.puffer.verwerfen();
  }
}

/** Zieht aus der Benutzerliste nur Adresse und gesetzten Namen; alles andere wird verworfen. */
export function leseNamen(antwort: unknown): ReadonlyMap<string, string> {
  const namen = new Map<string, string>();
  if (!istObjekt(antwort) || !Array.isArray(antwort['benutzer'])) return namen;
  for (const eintrag of antwort['benutzer']) {
    if (istObjekt(eintrag) && istNichtleererText(eintrag['email'])) {
      const name = eintrag['anzeigename'];
      if (istNichtleererText(name)) namen.set(eintrag['email'].toLowerCase(), name);
    }
  }
  return namen;
}
