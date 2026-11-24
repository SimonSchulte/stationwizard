import { UnterschriftDaten, pruefeUnterschrift } from '../../kern/unterschrift/unterschrift.model';
import { SchadensmeldungInhalt, istSchadensmeldungInhalt } from './schadensmeldung.model';

/** Die festen Stufen des Vorgangs „Fahrzeug/Material defekt“; Worker und Frontend führen dieselbe Liste. */
export const VORGANG_STUFEN = [
  'Schadensmeldung ausgefüllt',
  'Angebote eingeholt',
  'Eingereicht',
  'Genehmigt',
  'Geplant',
  'Erledigt',
] as const;

export const STUFE_ANGEBOTE = 1;
export const STUFE_EINGEREICHT = 2;
export const STUFE_GENEHMIGT = 3;
export const LETZTE_STUFE = VORGANG_STUFEN.length - 1;

export const VORGANG_ART_LABEL = 'Fahrzeug/Material defekt';

export type Slot = 'fest' | 'leitung' | 'verantw';
export const SLOTS: readonly Slot[] = ['fest', 'leitung', 'verantw'];
export const SLOT_BEZEICHNUNG: Record<Slot, string> = {
  fest: 'festgestellt durch',
  leitung: 'Leitung',
  verantw: 'verantwortliche Person',
};
/** Ohne diese beiden Unterschriften lässt sich die Meldung weder drucken noch einreichen. */
export const PFLICHT_SLOTS: readonly Slot[] = ['fest', 'verantw'];

export interface VorgangKopf {
  id: string;
  art: string;
  fahrzeugId: string;
  titel: string;
  /** -1 = Meldung noch nicht vollständig, sonst 0 bis 5. */
  stufe: number;
  geplantAm: string | null;
  abgeschlossenAm: string | null;
  angelegtAm: string;
  angelegtVon: string;
  geaendertAm: string;
  geaendertVon: string;
}

export interface VorgangListenEintrag extends VorgangKopf {
  fahrzeugBezeichnung: string;
  fahrzeugKennzeichen: string;
  fahrzeugGruppe: string;
  meldungVollstaendig: boolean;
  pflichtUnterschriften: number;
  versendetAm: string | null;
  angebote: number;
}

export interface MeldungStand {
  id: string;
  inhalt: SchadensmeldungInhalt;
  version: number;
  vollstaendig: boolean;
  gesperrt: boolean;
  versendetAm: string | null;
  versendetVon: string | null;
  versendetAn: string[] | null;
}

export type UnterschriftStatus = 'offen' | 'angefragt' | 'unterschrieben';

export interface UnterschriftStand {
  slot: Slot;
  status: UnterschriftStatus;
  anEmail: string | null;
  angefragtVon: string | null;
  angefragtAm: string | null;
  name: string | null;
  unterschriebenAm: string | null;
  signatur: UnterschriftDaten | null;
}

export interface AngebotStand {
  id: string;
  dateiname: string;
  groesse: number;
  quelle: 'upload' | 'email';
  mailBetreff: string | null;
  mailAbsender: string | null;
  mailDatum: string | null;
  mailText: string | null;
  hochgeladenAm: string;
  hochgeladenVon: string;
}

export interface EreignisStand {
  id: string;
  zeitpunkt: string;
  von: string;
  beschreibung: string;
}

export interface Vorgangsdarstellung {
  vorgang: VorgangKopf;
  meldung: MeldungStand | null;
  unterschriften: UnterschriftStand[];
  angebote: AngebotStand[];
  ereignisse: EreignisStand[];
}

export interface VorgangMitVersion {
  daten: Vorgangsdarstellung;
  /** ETag des Vorgangs, undurchsichtig, für `If-Match` bei Stufenwechseln. */
  version: string;
}

export interface AufgabeUnterschrift {
  vorgangId: string;
  slot: Slot;
  angefragtVon: string | null;
  angefragtAm: string | null;
  titel: string;
  fahrzeugBezeichnung: string;
}

// ---------- Prüfung unbekannter Serverdaten ----------

type Objekt = Record<string, unknown>;

function istObjekt(wert: unknown): wert is Objekt {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}
const istText = (wert: unknown): wert is string => typeof wert === 'string';
const istTextOderNull = (wert: unknown): wert is string | null => wert === null || istText(wert);
const istSlot = (wert: unknown): wert is Slot => SLOTS.includes(wert as Slot);

export function istVorgangKopf(wert: unknown): wert is VorgangKopf {
  return (
    istObjekt(wert) &&
    istText(wert['id']) &&
    istText(wert['art']) &&
    istText(wert['fahrzeugId']) &&
    istText(wert['titel']) &&
    typeof wert['stufe'] === 'number' &&
    Number.isInteger(wert['stufe']) &&
    wert['stufe'] >= -1 &&
    wert['stufe'] <= LETZTE_STUFE &&
    istTextOderNull(wert['geplantAm']) &&
    istTextOderNull(wert['abgeschlossenAm']) &&
    istText(wert['angelegtAm']) &&
    istText(wert['angelegtVon']) &&
    istText(wert['geaendertAm']) &&
    istText(wert['geaendertVon'])
  );
}

export function istVorgangListenEintrag(wert: unknown): wert is VorgangListenEintrag {
  return (
    istVorgangKopf(wert) &&
    istText((wert as unknown as Objekt)['fahrzeugBezeichnung']) &&
    istText((wert as unknown as Objekt)['fahrzeugKennzeichen']) &&
    istText((wert as unknown as Objekt)['fahrzeugGruppe']) &&
    typeof (wert as unknown as Objekt)['meldungVollstaendig'] === 'boolean' &&
    typeof (wert as unknown as Objekt)['pflichtUnterschriften'] === 'number' &&
    istTextOderNull((wert as unknown as Objekt)['versendetAm']) &&
    typeof (wert as unknown as Objekt)['angebote'] === 'number'
  );
}

function leseMeldung(wert: unknown): MeldungStand | null {
  if (!istObjekt(wert) || !istText(wert['id']) || !istSchadensmeldungInhalt(wert['inhalt'])) {
    return null;
  }
  const an = wert['versendetAn'];
  if (
    typeof wert['version'] !== 'number' ||
    typeof wert['vollstaendig'] !== 'boolean' ||
    typeof wert['gesperrt'] !== 'boolean' ||
    !istTextOderNull(wert['versendetAm']) ||
    !istTextOderNull(wert['versendetVon']) ||
    !(an === null || (Array.isArray(an) && an.every(istText)))
  ) {
    return null;
  }
  return {
    id: wert['id'],
    inhalt: wert['inhalt'],
    version: wert['version'],
    vollstaendig: wert['vollstaendig'],
    gesperrt: wert['gesperrt'],
    versendetAm: wert['versendetAm'],
    versendetVon: wert['versendetVon'],
    versendetAn: an,
  };
}

function leseUnterschrift(wert: unknown): UnterschriftStand | null {
  if (!istObjekt(wert) || !istSlot(wert['slot'])) return null;
  const status = wert['status'];
  if (status !== 'offen' && status !== 'angefragt' && status !== 'unterschrieben') return null;
  const signatur = wert['signatur'] === null ? null : pruefeUnterschrift(wert['signatur']);
  if (wert['signatur'] !== null && !signatur) return null;
  if (
    !istTextOderNull(wert['anEmail']) ||
    !istTextOderNull(wert['angefragtVon']) ||
    !istTextOderNull(wert['angefragtAm']) ||
    !istTextOderNull(wert['name']) ||
    !istTextOderNull(wert['unterschriebenAm'])
  ) {
    return null;
  }
  return {
    slot: wert['slot'],
    status,
    anEmail: wert['anEmail'],
    angefragtVon: wert['angefragtVon'],
    angefragtAm: wert['angefragtAm'],
    name: wert['name'],
    unterschriebenAm: wert['unterschriebenAm'],
    signatur,
  };
}

function leseAngebot(wert: unknown): AngebotStand | null {
  if (!istObjekt(wert)) return null;
  if (
    !istText(wert['id']) ||
    !istText(wert['dateiname']) ||
    typeof wert['groesse'] !== 'number' ||
    (wert['quelle'] !== 'upload' && wert['quelle'] !== 'email') ||
    !istTextOderNull(wert['mailBetreff']) ||
    !istTextOderNull(wert['mailAbsender']) ||
    !istTextOderNull(wert['mailDatum']) ||
    !istTextOderNull(wert['mailText']) ||
    !istText(wert['hochgeladenAm']) ||
    !istText(wert['hochgeladenVon'])
  ) {
    return null;
  }
  return {
    id: wert['id'],
    dateiname: wert['dateiname'],
    groesse: wert['groesse'],
    quelle: wert['quelle'],
    mailBetreff: wert['mailBetreff'],
    mailAbsender: wert['mailAbsender'],
    mailDatum: wert['mailDatum'],
    mailText: wert['mailText'],
    hochgeladenAm: wert['hochgeladenAm'],
    hochgeladenVon: wert['hochgeladenVon'],
  };
}

function leseEreignis(wert: unknown): EreignisStand | null {
  if (!istObjekt(wert)) return null;
  if (!istText(wert['id']) || !istText(wert['zeitpunkt']) || !istText(wert['von'])) return null;
  if (!istText(wert['beschreibung'])) return null;
  return {
    id: wert['id'],
    zeitpunkt: wert['zeitpunkt'],
    von: wert['von'],
    beschreibung: wert['beschreibung'],
  };
}

function liste<T>(wert: unknown, lese: (eintrag: unknown) => T | null): T[] | null {
  if (!Array.isArray(wert)) return null;
  const ergebnis: T[] = [];
  for (const eintrag of wert) {
    const gelesen = lese(eintrag);
    if (gelesen === null) return null;
    ergebnis.push(gelesen);
  }
  return ergebnis;
}

/** Prüft die Antwort auf einen einzelnen Vorgang; `null`, wenn sie nicht zum Vertrag passt. */
export function leseVorgangsdarstellung(wert: unknown): Vorgangsdarstellung | null {
  if (!istObjekt(wert) || !istVorgangKopf(wert['vorgang'])) return null;
  const meldung = wert['meldung'] === null ? null : leseMeldung(wert['meldung']);
  if (wert['meldung'] !== null && !meldung) return null;
  const unterschriften = liste(wert['unterschriften'], leseUnterschrift);
  const angebote = liste(wert['angebote'], leseAngebot);
  const ereignisse = liste(wert['ereignisse'], leseEreignis);
  if (!unterschriften || !angebote || !ereignisse) return null;
  return { vorgang: wert['vorgang'], meldung, unterschriften, angebote, ereignisse };
}

export function leseAufgabeUnterschrift(wert: unknown): AufgabeUnterschrift | null {
  if (!istObjekt(wert) || !istText(wert['vorgangId']) || !istSlot(wert['slot'])) return null;
  if (!istTextOderNull(wert['angefragtVon']) || !istTextOderNull(wert['angefragtAm'])) return null;
  if (!istText(wert['titel']) || !istText(wert['fahrzeugBezeichnung'])) return null;
  return {
    vorgangId: wert['vorgangId'],
    slot: wert['slot'],
    angefragtVon: wert['angefragtVon'],
    angefragtAm: wert['angefragtAm'],
    titel: wert['titel'],
    fahrzeugBezeichnung: wert['fahrzeugBezeichnung'],
  };
}

/** Pflichtunterschriften, die bereits vorliegen (0 bis 2). */
export function pflichtUnterschriftenAnzahl(unterschriften: readonly UnterschriftStand[]): number {
  return unterschriften.filter(
    (u) => PFLICHT_SLOTS.includes(u.slot) && u.status === 'unterschrieben',
  ).length;
}

/** Drucken, Senden und Einreichen setzen beide Pflichtunterschriften voraus. */
export function istUnterschrieben(unterschriften: readonly UnterschriftStand[]): boolean {
  return pflichtUnterschriftenAnzahl(unterschriften) === PFLICHT_SLOTS.length;
}
