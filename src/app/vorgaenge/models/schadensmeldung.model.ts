/**
 * Inhalt der Schadens- und Verlustmeldung (Anlage 5). Die Grenzen folgen den Feldgrößen des
 * Formulars; der Worker prüft dieselben Werte (`worker/src/vorgaenge-meldung-pruefung.ts`),
 * beide Fassungen sind gemeinsam zu ändern.
 */
export const MELDUNG_GRENZEN = {
  einheit: 40,
  bezeichnung: 40,
  kennzeichen: 20,
  ort: 90,
  sachverhalt: 4000,
  stellungnahme: 350,
  empfehlung: 350,
} as const;

export type MeldungTextFeld = keyof typeof MELDUNG_GRENZEN;

/** Bis etwa so viele Zeichen passen in das Sachverhaltsfeld des Formulars; darüber folgt ein Beiblatt. */
export const SACHVERHALT_IM_FELD = 450;

export const STELLUNGNAHME_STANDARD = 'Der Sachverhalt wird wie oben beschrieben bestätigt.';

export type MeldungArt = 'schaden' | 'verlust';

export interface SchadensmeldungInhalt {
  art: MeldungArt;
  /** Kalendertag `JJJJ-MM-TT` oder leer. */
  datumFeststellung: string;
  einheit: string;
  bezeichnung: string;
  kennzeichen: string;
  ort: string;
  sachverhalt: string;
  stellungnahme: string;
  empfehlung: string;
}

export const MELDUNG_ART_LABEL: Record<MeldungArt, string> = {
  schaden: 'Schadensmeldung',
  verlust: 'Verlustmeldung',
};

/** Neue Meldung mit dem, was sich aus dem Fahrzeug und den Einstellungen ergibt. */
export function neueMeldung(vorgabe: {
  bezeichnung: string;
  kennzeichen: string;
  einheit: string;
  heute: string;
}): SchadensmeldungInhalt {
  return {
    art: 'schaden',
    datumFeststellung: vorgabe.heute,
    einheit: vorgabe.einheit.slice(0, MELDUNG_GRENZEN.einheit),
    bezeichnung: vorgabe.bezeichnung.slice(0, MELDUNG_GRENZEN.bezeichnung),
    kennzeichen: vorgabe.kennzeichen.slice(0, MELDUNG_GRENZEN.kennzeichen),
    ort: '',
    sachverhalt: '',
    stellungnahme: STELLUNGNAHME_STANDARD,
    empfehlung: '',
  };
}

/** Pflichtangaben, die noch fehlen; leer heißt vollständig. */
export function fehlendePflichtangaben(inhalt: SchadensmeldungInhalt): string[] {
  const fehlend: string[] = [];
  if (!inhalt.datumFeststellung) fehlend.push('Datum der Feststellung');
  if (!inhalt.einheit.trim()) fehlend.push('Einheit');
  if (!inhalt.bezeichnung.trim()) fehlend.push('Bezeichnung');
  if (!inhalt.kennzeichen.trim()) fehlend.push('Kennzeichen');
  if (!inhalt.sachverhalt.trim()) fehlend.push('Sachverhalt');
  return fehlend;
}

export function istSchadensmeldungInhalt(wert: unknown): wert is SchadensmeldungInhalt {
  if (typeof wert !== 'object' || wert === null) return false;
  const objekt = wert as Record<string, unknown>;
  return (
    (objekt['art'] === 'schaden' || objekt['art'] === 'verlust') &&
    typeof objekt['datumFeststellung'] === 'string' &&
    (Object.keys(MELDUNG_GRENZEN) as MeldungTextFeld[]).every((f) => typeof objekt[f] === 'string')
  );
}
