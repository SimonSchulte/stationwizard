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

export interface PostfachAdresse {
  fahrzeugId: string;
  fahrzeugBezeichnung: string;
  kuerzel: string;
  adresse: string;
}

export interface PostfachAdressen {
  sammelAdresse: string;
  adressen: PostfachAdresse[];
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
  if (!istObjekt(wert) || !istText(wert['sammelAdresse']) || !Array.isArray(wert['adressen']))
    return null;
  const adressen: PostfachAdresse[] = [];
  for (const eintrag of wert['adressen'] as unknown[]) {
    if (
      !istObjekt(eintrag) ||
      !istText(eintrag['fahrzeugId']) ||
      !istText(eintrag['fahrzeugBezeichnung']) ||
      !istText(eintrag['kuerzel']) ||
      !istText(eintrag['adresse'])
    ) {
      return null;
    }
    adressen.push({
      fahrzeugId: eintrag['fahrzeugId'],
      fahrzeugBezeichnung: eintrag['fahrzeugBezeichnung'],
      kuerzel: eintrag['kuerzel'],
      adresse: eintrag['adresse'],
    });
  }
  return { sammelAdresse: wert['sammelAdresse'], adressen };
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
