/** Einsatz als eigene Zeile (Vertrag: `docs/konzept-einsatzplanung-vb.md`, Abschnitt 9). */
export interface Einsatz {
  id: string;
  /** 1–200 Zeichen. */
  titel: string;
  /** `YYYY-MM-DDTHH:mm`, lokale Berliner Zeit ohne Zone. */
  beginn: string | null;
  ende: string | null;
  /** Höchstens 200 Zeichen. */
  ort: string | null;
  /** `/^[A-Za-z0-9_-]{1,64}$/`, eindeutig. */
  hiorgVeranstaltungId: string | null;
  /** UUID der PEP-Datei in Nextcloud. */
  pepId: string | null;
}

export interface VbKennzahlen {
  laufzettel: number;
  positionen: number;
}

export type EinsatzListenEintrag = Einsatz & {
  version: number;
  /** `null`, solange der Einsatz keine Vorbereitung hat. */
  vb: VbKennzahlen | null;
};
