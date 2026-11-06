import { KatsThema, Termin } from '../models/plan.model';

/** Eine KatS-Ausbildung im Plan samt ihrem Thema aus dem KatS-A-Plan (falls verknüpft). */
export interface KatsAusbildung {
  termin: Termin;
  thema: KatsThema | null;
}

export interface KatsMonat {
  /** 0 = Januar. */
  index: number;
  ausbildungen: KatsAusbildung[];
}

export interface KatsAusbildungsplan {
  monate: KatsMonat[];
  /** Themen des KatS-A-Plans, auf die im Jahr noch kein Termin verweist; Pflichtthemen zuerst. */
  ohneTermin: KatsThema[];
  kennzahlen: {
    ausbildungen: number;
    pflichtOffen: number;
    themenGesamt: number;
  };
}

/**
 * Eine KatS-Ausbildung ist ein datierter Termin des Jahres, der sich auf den KatS-A-Plan bezieht:
 * über ein verknüpftes Thema, ein Pflichtthema oder einen frei eingetragenen KatS-Titel.
 */
export function istKatsAusbildung(termin: Termin): boolean {
  return (
    termin.datum !== null &&
    (termin.katsThemaId !== null || termin.katsPflicht || termin.katsTitel.trim() !== '')
  );
}

/**
 * Baut die Übersicht aller KatS-Ausbildungen des aktuellen Jahres, nach Monat gruppiert und
 * chronologisch sortiert. Rein abgeleitet, nichts wird gespeichert.
 */
export function baueKatsAusbildungsplan(
  termine: readonly Termin[],
  themen: readonly KatsThema[],
): KatsAusbildungsplan {
  const themaNachId = new Map(themen.map((t) => [t.id, t]));
  const monate: KatsMonat[] = Array.from({ length: 12 }, (_, index) => ({
    index,
    ausbildungen: [],
  }));

  const ausbildungen = termine
    .filter(istKatsAusbildung)
    .sort((a, b) => a.datum!.localeCompare(b.datum!) || a.beginnZeit.localeCompare(b.beginnZeit));
  for (const termin of ausbildungen) {
    const monat = Number(termin.datum!.slice(5, 7)) - 1;
    monate[monat]?.ausbildungen.push({
      termin,
      thema: termin.katsThemaId ? (themaNachId.get(termin.katsThemaId) ?? null) : null,
    });
  }

  const belegt = new Set(termine.map((t) => t.katsThemaId).filter((id) => id !== null));
  const ohneTermin = themen
    .filter((t) => !belegt.has(t.id))
    .sort(
      (a, b) =>
        Number(b.pflicht) - Number(a.pflicht) ||
        a.nummer.localeCompare(b.nummer, 'de', { numeric: true }),
    );

  return {
    monate: monate.filter((m) => m.ausbildungen.length > 0),
    ohneTermin,
    kennzahlen: {
      ausbildungen: ausbildungen.length,
      pflichtOffen: ohneTermin.filter((t) => t.pflicht).length,
      themenGesamt: themen.length,
    },
  };
}
