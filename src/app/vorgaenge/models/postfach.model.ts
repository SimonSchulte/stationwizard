/** Das gemeinsame Postfach für Angebote (siehe `docs/konzept-vorgaenge.md`, Abschnitt 7). */

export interface PostfachMail {
  id: string;
  empfangenAm: string;
  absender: string;
  betreff: string;
  /** Adresse, an die die Mail ging. */
  empfaenger: string;
  /** Aus der Adresse abgeleitet; `null` im Sammelpostfach. */
  fahrzeugId: string | null;
  fahrzeugBezeichnung: string | null;
  groesse: number;
}

export type PostfachAdressArt = 'kennzeichen' | 'funkruf';

/** Eine Adresse eines Fahrzeugs, abgeleitet aus Kennzeichen beziehungsweise Funkrufname. */
export interface PostfachAdresse {
  art: PostfachAdressArt;
  adresse: string;
  /** Kennzeichen beziehungsweise Funkrufname, aus dem die Adresse entstand. */
  quelle: string;
}

export interface PostfachFahrzeugAdressen {
  fahrzeugId: string;
  fahrzeugBezeichnung: string;
  adressen: PostfachAdresse[];
}

export interface PostfachAdressen {
  sammelAdresse: string;
  fahrzeuge: PostfachFahrzeugAdressen[];
}

type Objekt = Record<string, unknown>;
const istObjekt = (w: unknown): w is Objekt =>
  typeof w === 'object' && w !== null && !Array.isArray(w);
const istText = (w: unknown): w is string => typeof w === 'string';
const istTextOderNull = (w: unknown): w is string | null => w === null || istText(w);

export function istPostfachMail(wert: unknown): wert is PostfachMail {
  return (
    istObjekt(wert) &&
    istText(wert['id']) &&
    istText(wert['empfangenAm']) &&
    istText(wert['absender']) &&
    istText(wert['betreff']) &&
    istText(wert['empfaenger']) &&
    istTextOderNull(wert['fahrzeugId']) &&
    istTextOderNull(wert['fahrzeugBezeichnung']) &&
    typeof wert['groesse'] === 'number'
  );
}

export function lesePostfachAdressen(wert: unknown): PostfachAdressen | null {
  if (!istObjekt(wert) || !istText(wert['sammelAdresse']) || !Array.isArray(wert['fahrzeuge']))
    return null;
  const fahrzeuge: PostfachFahrzeugAdressen[] = [];
  for (const eintrag of wert['fahrzeuge'] as unknown[]) {
    if (
      !istObjekt(eintrag) ||
      !istText(eintrag['fahrzeugId']) ||
      !istText(eintrag['fahrzeugBezeichnung']) ||
      !Array.isArray(eintrag['adressen'])
    ) {
      return null;
    }
    const adressen: PostfachAdresse[] = [];
    for (const a of eintrag['adressen'] as unknown[]) {
      if (
        !istObjekt(a) ||
        (a['art'] !== 'kennzeichen' && a['art'] !== 'funkruf') ||
        !istText(a['adresse']) ||
        !istText(a['quelle'])
      ) {
        return null;
      }
      adressen.push({ art: a['art'], adresse: a['adresse'], quelle: a['quelle'] });
    }
    fahrzeuge.push({
      fahrzeugId: eintrag['fahrzeugId'],
      fahrzeugBezeichnung: eintrag['fahrzeugBezeichnung'],
      adressen,
    });
  }
  return { sammelAdresse: wert['sammelAdresse'], fahrzeuge };
}

/** Angebote nehmen wir als PDF, PNG oder JPEG an; Dateiendung und Medientyp müssen dazu passen. */
export function istAngebotsdatei(name: string, medientyp: string): boolean {
  const n = name.toLowerCase();
  return (
    (medientyp === 'application/pdf' && n.endsWith('.pdf')) ||
    (medientyp === 'image/png' && n.endsWith('.png')) ||
    (medientyp === 'image/jpeg' && (n.endsWith('.jpg') || n.endsWith('.jpeg')))
  );
}

/** Grenzen der Angebote; der Worker prüft dieselben Werte (`postfach-gemeinsam.ts`). */
export const ANGEBOT_GROESSE_MAX = 10 * 1024 * 1024;
export const ANGEBOTE_JE_VORGANG_MAX = 10;
export const NOTIZ_TEXT_MAX = 2000;
