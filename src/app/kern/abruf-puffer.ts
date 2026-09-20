interface Eintrag<T> {
  zeitpunkt: number;
  wert: T;
}

/**
 * Kurzlebiger Puffer für einen lesenden Abruf: beantwortet denselben
 * Schlüssel innerhalb der Gültigkeitsdauer aus dem letzten Ergebnis und
 * bündelt gleichzeitig laufende Abrufe desselben Schlüssels zu einer einzigen
 * Anfrage.
 *
 * Gedacht gegen die immer gleichen Wiederholungsabrufe beim Navigieren
 * zwischen Seiten, die dieselbe Liste brauchen - jede vermiedene Anfrage ist
 * eine Worker-Anfrage und eine D1-Abfrage weniger. Bewusst kein allgemeiner
 * Zwischenspeicher über alle API-Pfade: jede Nutzung entscheidet selbst, ob
 * ein leicht veralteter Stand für sie fachlich vertretbar ist, und verwirft
 * nach eigenen Schreibzugriffen (siehe `FahrzeugAbrufPuffer`).
 *
 * Der Puffer ist absichtlich nicht typ-agnostisch gehalten: er wird je
 * Datenart mit dem konkreten Typ angelegt, damit hier kein ungeprüfter Cast
 * nötig ist.
 */
export class AbrufPuffer<T> {
  private readonly werte = new Map<string, Eintrag<T>>();
  private readonly laufende = new Map<string, Promise<T>>();
  /** Zählt jedes `verwerfen()`; siehe dort, warum das nötig ist. */
  private stand = 0;

  /** @param gueltigMs Wie lange ein Ergebnis wiederverwendet werden darf. */
  constructor(private readonly gueltigMs: number) {}

  /**
   * Liefert den gepufferten Wert, einen bereits laufenden Abruf oder startet
   * einen neuen. Ein fehlgeschlagener Abruf wird nicht gepuffert.
   */
  hole(schluessel: string, lader: () => Promise<T>): Promise<T> {
    const vorhanden = this.werte.get(schluessel);
    if (vorhanden && Date.now() - vorhanden.zeitpunkt < this.gueltigMs) {
      return Promise.resolve(vorhanden.wert);
    }
    const laufend = this.laufende.get(schluessel);
    if (laufend) return laufend;

    const standBeimStart = this.stand;
    const abruf = lader().then((wert) => {
      // Nur puffern, wenn zwischenzeitlich nichts verworfen wurde: sonst
      // stammt dieses Ergebnis noch von vor einem eigenen Schreibzugriff und
      // würde ihn für die Dauer der Gültigkeit wieder verdecken.
      if (standBeimStart === this.stand) {
        this.werte.set(schluessel, { zeitpunkt: Date.now(), wert });
        this.laufende.delete(schluessel);
      }
      return wert;
    });
    this.laufende.set(schluessel, abruf);
    abruf.catch(() => {
      if (standBeimStart === this.stand) this.laufende.delete(schluessel);
    });
    return abruf;
  }

  /**
   * Verwirft alle gepufferten Ergebnisse. Nach einem eigenen Schreibzugriff
   * aufzurufen; laufende Abrufe zählen danach nicht mehr als aktuell.
   */
  verwerfen(): void {
    this.stand += 1;
    this.werte.clear();
    this.laufende.clear();
  }
}
