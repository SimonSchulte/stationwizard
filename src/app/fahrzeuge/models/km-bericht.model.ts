import { Eigentuemer } from './fahrzeug.model';

/**
 * Kilometerstandsbericht, wie ihn der Worker berechnet. Bewusst ein eigener
 * Lesetyp und keine Ableitung aus `Fahrzeugstamm` + `Kilometerstand`: die
 * Kennzahlen entstehen serverseitig, damit derselbe Bericht auch in der Mail
 * steht (siehe `worker/src/km-bericht.ts`). Die Oberfläche rechnet hier
 * nichts nach, sie zeigt genau das, was verschickt würde.
 */
export interface BerichtZeile {
  /** Fahrzeug-UUID; erlaubt der Übersicht die Verlinkung ohne zweiten Abruf. */
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  eigentuemer: Eigentuemer;
  /** Letzter gültiger Stand, oder `null` ohne jede Ablesung. */
  letzterStand: number | null;
  abgelesenAm: string | null;
  tageSeitAblesung: number | null;
  sollKm: number;
  istKm: number | null;
  restKm: number | null;
  /** Der Jahresstartstand musste ersatzweise bestimmt werden. */
  unvollstaendig: boolean;
}

export interface KmBericht {
  /** Berliner Kalendertag der Erstellung. */
  stichtag: string;
  jahr: number;
  zeilen: BerichtZeile[];
  ohneAblesung: number;
  unterSoll: number;
}

/** Quittung eines tatsächlich ausgeführten Versands. */
export interface VersandQuittung {
  gesendetAn: string;
  gesendetAm: string;
  gesendetVon: string;
  anzahlFahrzeuge: number;
  versandweg: string;
}
