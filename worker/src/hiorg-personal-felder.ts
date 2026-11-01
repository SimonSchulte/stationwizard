import { istObjekt, istText } from './json-lesen';

/**
 * Feste, kleine Feldauswahl aus der Personal-Ressource. Was hier nicht ausdrücklich gelesen
 * wird, verlässt den Worker nicht (siehe CLAUDE.md, HiOrg-Abschnitt).
 */

/** Aus `attributes.fahrerlaubnis`; `null` ohne bei HiOrg erfasste Fahrerlaubnis. */
export interface HiorgFahrerlaubnis {
  /** Klassen wie `B`, `BE`, `C1` – Freitext aus HiOrg, keine feste Liste hier. */
  klassen: string[];
  beschraenkung: string | null;
  fuehrerscheinnummer: string | null;
  fuehrerscheindatum: string | null;
}

export interface HiorgPersonAusgabe {
  id: string;
  vorname: string;
  nachname: string;
  gruppen: string[];
  qualifikationen: { liste: string | null; name: string | null; kurz: string | null }[];
  telefon?: string;
  fahrerlaubnis: HiorgFahrerlaubnis | null;
  /** Eintrittsdatum als `JJJJ-MM-TT`, nur wenn bei HiOrg erfasst und lesbar. */
  mitgliedSeit?: string;
  /** `attributes.anrede` (z. B. „Herr“/„Frau“), nur für die Wahl Damen-/Herrenuhr beim Export. */
  anrede?: string;
}

/**
 * `attributes.mitglied_seit` (Feldname vom Betreiber benannt, nicht aus der
 * offiziellen Feldbeschreibung belegt). Anders als bei den übrigen Feldern
 * verwirft ein unlesbarer Wert nicht die ganze Antwort: das Datum ist nur eine
 * Zusatzangabe, `undefined` bedeutet „nicht verwertbar".
 */
export function leseMitgliedSeit(wert: unknown): string | undefined {
  if (typeof wert !== 'string') return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(wert.trim());
  const deutsch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(wert.trim());
  const [jahr, monat, tag] = iso
    ? [iso[1], iso[2], iso[3]]
    : deutsch
      ? [deutsch[3], deutsch[2], deutsch[1]]
      : [];
  if (!jahr) return undefined;
  const text = `${jahr}-${monat}-${tag}`;
  const datum = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(datum.getTime()) && datum.toISOString().slice(0, 10) === text
    ? text
    : undefined;
}

/**
 * `attributes.anrede`: nur ein kurzer Text; alles andere gilt als nicht erfasst, ohne die ganze
 * Antwort zu verwerfen. Der Wert wird nie gespeichert und dient allein der Wahl zwischen
 * Damen- und Herrenuhr (`Ehrungen`).
 */
export function leseAnrede(wert: unknown): string | undefined {
  if (typeof wert !== 'string') return undefined;
  const text = wert.trim();
  return text.length > 0 && text.length <= 40 ? text : undefined;
}

function optionalerText(wert: unknown): string | null | undefined {
  if (wert === undefined || wert === null) return null;
  return typeof wert === 'string' ? wert : undefined;
}

/**
 * `null` ohne erfasste Fahrerlaubnis, `undefined` bei unerwarteter Form (die
 * gesamte Antwort wird dann verworfen, wie bei jedem anderen Feld hier).
 */
function leseFahrerlaubnis(wert: unknown): HiorgFahrerlaubnis | null | undefined {
  if (wert === undefined || wert === null) return null;
  if (!istObjekt(wert)) return undefined;
  const klassenRoh = wert['klassen'] ?? [];
  if (!Array.isArray(klassenRoh) || !klassenRoh.every(istText)) return undefined;
  const beschraenkung = optionalerText(wert['beschraenkung']);
  const fuehrerscheinnummer = optionalerText(wert['fuehrerscheinnummer']);
  const fuehrerscheindatum = optionalerText(wert['fuehrerscheindatum']);
  if (
    beschraenkung === undefined ||
    fuehrerscheinnummer === undefined ||
    fuehrerscheindatum === undefined
  ) {
    return undefined;
  }
  return { klassen: klassenRoh, beschraenkung, fuehrerscheinnummer, fuehrerscheindatum };
}

/**
 * Feste Feldauswahl aus `user_get`: Name, Gruppen, Qualifikationen, Handy
 * (wie `tel_mobil` bei EFS) und – für die Führerscheinliste – die
 * Fahrerlaubnis (`fahrerlaubnis.klassen`/`beschraenkung`/`fuehrerscheinnummer`/
 * `fuehrerscheindatum`, belegt durch die offizielle Feldbeschreibung der
 * Personal-Ressource). Alle übrigen Felder – Anschrift, Geburtsdaten,
 * Bankverbindung, Ernährung, Allergien, Bemerkungen, Rechte und
 * benutzerdefinierte Felder – verlassen den Worker weiterhin nie. Eine
 * unerwartete Form verwirft die gesamte Antwort statt sie teilweise
 * durchzulassen.
 */
export function filterePersonal(inhalt: unknown): HiorgPersonAusgabe[] | undefined {
  if (!istObjekt(inhalt) || !Array.isArray(inhalt['data'])) return undefined;
  const personen: HiorgPersonAusgabe[] = [];
  for (const eintrag of inhalt['data']) {
    if (!istObjekt(eintrag) || !istObjekt(eintrag['attributes'])) return undefined;
    const id = eintrag['id'];
    const attribute = eintrag['attributes'];
    const vorname = attribute['vorname'];
    const nachname = attribute['nachname'];
    if (!istText(id) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return undefined;
    if (!istText(vorname) || !istText(nachname)) return undefined;

    const gruppenRoh = attribute['gruppen_namen'] ?? [];
    if (!Array.isArray(gruppenRoh) || !gruppenRoh.every(istText)) return undefined;

    const qualifikationenRoh = attribute['qualifikationen'] ?? [];
    if (!Array.isArray(qualifikationenRoh)) return undefined;
    const qualifikationen: HiorgPersonAusgabe['qualifikationen'] = [];
    for (const qualifikation of qualifikationenRoh) {
      if (!istObjekt(qualifikation)) return undefined;
      const liste = optionalerText(qualifikation['liste']);
      const name = optionalerText(qualifikation['name']);
      const kurz = optionalerText(qualifikation['name_kurz']);
      if (liste === undefined || name === undefined || kurz === undefined) return undefined;
      if (name === null && kurz === null) continue;
      qualifikationen.push({ liste, name, kurz });
    }

    const handy = optionalerText(attribute['handy']);
    if (handy === undefined) return undefined;

    const fahrerlaubnis = leseFahrerlaubnis(attribute['fahrerlaubnis']);
    if (fahrerlaubnis === undefined) return undefined;

    const mitgliedSeit = leseMitgliedSeit(attribute['mitglied_seit']);
    const anrede = leseAnrede(attribute['anrede']);

    personen.push({
      id,
      vorname,
      nachname,
      gruppen: gruppenRoh,
      qualifikationen,
      ...(handy ? { telefon: handy } : {}),
      fahrerlaubnis,
      ...(mitgliedSeit ? { mitgliedSeit } : {}),
      ...(anrede ? { anrede } : {}),
    });
  }
  return personen;
}

/** Felder des Ehrungsantrags; `null`, wo bei HiOrg nichts Verwertbares erfasst ist. */
export interface HiorgAntragsdaten {
  anrede: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  /** `JJJJ-MM-TT`. */
  geburtsdatum: string | null;
}

/** Kurzer Text ohne Steuerzeichen, sonst „nicht erfasst“ – wie `leseAnrede()`, nur länger. */
function leseKurztext(wert: unknown, hoechstlaenge = 120): string | null {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  if (text.length === 0 || text.length > hoechstlaenge) return null;
  for (const zeichen of text) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return null;
  }
  return text;
}

/**
 * Sucht genau eine Person nach ihrer HiOrg-Id und gibt nur Anrede, Straße (`adresse`), PLZ, Ort
 * und Geburtsdatum (`gebdat`) heraus – die Felder, die das Antragsformular verlangt. Feldnamen
 * aus der offiziellen Beispielantwort der Personal-Ressource. Ein unlesbares einzelnes Feld wird
 * `null`, eine unerwartete Gesamtform verwirft die Antwort.
 */
export function antragsdatenAusPersonal(
  inhalt: unknown,
  personId: string,
): HiorgAntragsdaten | null | undefined {
  if (!istObjekt(inhalt) || !Array.isArray(inhalt['data'])) return undefined;
  const eintrag = inhalt['data'].find((e) => istObjekt(e) && e['id'] === personId);
  if (!eintrag) return null;
  if (!istObjekt(eintrag) || !istObjekt(eintrag['attributes'])) return undefined;
  const attribute = eintrag['attributes'];
  return {
    anrede: leseAnrede(attribute['anrede']) ?? null,
    strasse: leseKurztext(attribute['adresse']),
    plz: leseKurztext(attribute['plz'], 16),
    ort: leseKurztext(attribute['ort']),
    geburtsdatum: leseMitgliedSeit(attribute['gebdat']) ?? null,
  };
}
