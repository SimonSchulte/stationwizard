import type { MailNachricht } from './mail-versand';
import { MAIL_FARBEN, datum, kopfzelle, maskiere, monat, zahl, zelle } from './mail-format';
import { Checkposition, verfallsdatumStatus } from './material-check';

/**
 * Bestellschein und Mängelanzeigen zu einem abgeschlossenen Fahrzeugcheck.
 *
 * Reine Funktionen ohne Datenbank, damit Vorschau und Mail nachweislich
 * denselben Text zeigen. Bewusst **nur** hier und nicht zusätzlich im Frontend:
 * der Kilometerbericht führt eine solche Zwillingsfassung, und CLAUDE.md muss
 * eigens festhalten, dass beide gemeinsam zu ändern sind. Diese Last wird nicht
 * wiederholt – die Oberfläche holt denselben Text über den Berichtsendpunkt.
 */

export const BERICHTSARTEN = ['bestellschein', 'maengel-land', 'maengel-seg'] as const;
export type Berichtsart = (typeof BERICHTSARTEN)[number];

export function istBerichtsart(wert: unknown): wert is Berichtsart {
  return typeof wert === 'string' && (BERICHTSARTEN as readonly string[]).includes(wert);
}

export const BERICHTSART_TITEL: Readonly<Record<Berichtsart, string>> = {
  bestellschein: 'Bestellschein',
  'maengel-land': 'Mängelanzeige Land',
  'maengel-seg': 'Mängelanzeige SEG',
};

/**
 * Ein Artikel mit Landbezug wird **immer** über Land bezogen und gemeldet; nur
 * ein reiner SEG-Artikel ohne Land-Pendant läuft über die SEG. Diese Regel
 * stammt aus der übernommenen Checkliste und gilt für beide Berichtsarten.
 */
export function istLandBeziehbar(herkunft: string): boolean {
  return herkunft === 'land' || herkunft === 'beide';
}

export interface BerichtsQuelle {
  behaelterBezeichnung: string;
  fahrzeugBezeichnung: string;
  vorlageBezeichnung: string;
  grundlage: string;
  geprueftAm: string;
  erfasstVon: string;
  gemeldetVonName: string | null;
  verfallsdatumErfasst: boolean;
  positionen: readonly Checkposition[];
}

function einheit(position: Checkposition): string {
  const wert = position.einheit.trim();
  return wert === '' ? 'Stück' : wert;
}

/** Fehlmenge einer Position; 0, wenn das Soll erfüllt oder übererfüllt ist. */
export function fehlmenge(position: Checkposition): number {
  const fehlt = position.sollMenge - position.istMenge;
  return fehlt > 0 ? fehlt : 0;
}

/**
 * Warum eine Position als Mangel gilt: unbrauchbar gemeldet oder mindestens ein
 * Stück mit abgelaufenem Verfallsdatum. Eine bloße Fehlmenge ist **kein**
 * Mangel – sie gehört auf den Bestellschein.
 */
export function mangelgruende(
  position: Checkposition,
  heute: string,
  verfallsdatumErfasst: boolean,
): string[] {
  const gruende: string[] = [];
  if (position.unbrauchbar) gruende.push('unbrauchbar geworden');
  if (verfallsdatumErfasst && position.verfallsdatumPflicht) {
    position.verfallsdaten.forEach((wert, index) => {
      if (wert !== null && verfallsdatumStatus(wert, heute) === 'abgelaufen') {
        const stueck =
          position.verfallsdaten.length > 1
            ? ` Stück ${index + 1}/${position.verfallsdaten.length}`
            : '';
        gruende.push(`Verfallsdatum abgelaufen${stueck}: ${monat(wert)}`);
      }
    });
  }
  return gruende;
}

interface Abschnitt {
  fach: string;
  zeilen: { position: Checkposition; text: string }[];
}

function nachFach(
  positionen: readonly Checkposition[],
  text: (position: Checkposition) => string | null,
): Abschnitt[] {
  const abschnitte = new Map<string, Abschnitt>();
  for (const position of positionen) {
    const zeile = text(position);
    if (zeile === null) continue;
    const vorhanden = abschnitte.get(position.fachId);
    if (vorhanden) vorhanden.zeilen.push({ position, text: zeile });
    else
      abschnitte.set(position.fachId, { fach: position.fach, zeilen: [{ position, text: zeile }] });
  }
  return [...abschnitte.values()];
}

const TRENNER = '='.repeat(56);

function kopfzeilen(quelle: BerichtsQuelle, art: Berichtsart): string[] {
  const zeilen = [
    `${BERICHTSART_TITEL[art].toUpperCase()} – ${quelle.vorlageBezeichnung}`,
    `Behälter: ${quelle.behaelterBezeichnung} · ${quelle.fahrzeugBezeichnung}`,
    `Geprüft am: ${datum(quelle.geprueftAm)}`,
    `Erfasst von: ${quelle.erfasstVon}`,
  ];
  if (quelle.gemeldetVonName) {
    zeilen.push(`Gemeldet von: ${quelle.gemeldetVonName} (Selbstauskunft)`);
  }
  zeilen.push(TRENNER);
  return zeilen;
}

function abschnitteAlsText(abschnitte: readonly Abschnitt[]): string[] {
  return abschnitte.flatMap((abschnitt) => [
    '',
    `${abschnitt.fach}:`,
    ...abschnitt.zeilen.map((zeile) => `  - ${zeile.text}`),
  ]);
}

function bestellscheinText(quelle: BerichtsQuelle): string[] {
  const zeile = (position: Checkposition): string | null => {
    const fehlt = fehlmenge(position);
    return fehlt === 0 ? null : `${fehlt} ${einheit(position)} ${position.bezeichnung}`;
  };
  const land = nachFach(
    quelle.positionen.filter((p) => istLandBeziehbar(p.herkunft)),
    zeile,
  );
  const seg = nachFach(
    quelle.positionen.filter((p) => !istLandBeziehbar(p.herkunft)),
    zeile,
  );

  if (land.length === 0 && seg.length === 0) {
    return ['', 'Keine Fehlmengen. Bestand vollständig laut Soll-Ausstattung.'];
  }
  return [
    '',
    '--- BESTELLLISTE LAND (zuerst bestellen) ---',
    ...(land.length ? abschnitteAlsText(land) : ['', 'Keine Fehlmengen bei Land-Artikeln.']),
    '',
    '--- BESTELLLISTE SEG (nur was nicht über Land beziehbar ist) ---',
    ...(seg.length ? abschnitteAlsText(seg) : ['', 'Keine Fehlmengen bei reinen SEG-Artikeln.']),
  ];
}

function maengelText(quelle: BerichtsQuelle, art: Berichtsart, heute: string): string[] {
  const bereich = art === 'maengel-land' ? 'Land' : 'SEG';
  const gefiltert = quelle.positionen.filter((position) =>
    art === 'maengel-land'
      ? istLandBeziehbar(position.herkunft)
      : !istLandBeziehbar(position.herkunft),
  );
  const abschnitte = nachFach(gefiltert, (position) => {
    const gruende = mangelgruende(position, heute, quelle.verfallsdatumErfasst);
    return gruende.length === 0 ? null : `${position.bezeichnung}: ${gruende.join('; ')}`;
  });
  const hinweis = [
    '',
    `Hinweis: Diese Liste enthält ausschließlich abgelaufenes oder als unbrauchbar`,
    `markiertes Material aus dem Bereich ${bereich}. Reine Mengen-Fehlbestände ohne`,
    'Mangel stehen nicht hier, sondern auf dem Bestellschein.',
    TRENNER,
  ];
  if (abschnitte.length === 0) return [...hinweis, '', 'Keine Mängel gemeldet.'];
  return [...hinweis, ...abschnitteAlsText(abschnitte)];
}

export function berichtAlsText(quelle: BerichtsQuelle, art: Berichtsart, heute: string): string {
  const koerper =
    art === 'bestellschein' ? bestellscheinText(quelle) : maengelText(quelle, art, heute);
  return [
    ...kopfzeilen(quelle, art),
    ...koerper,
    '',
    TRENNER,
    `Grundlage: ${quelle.grundlage}`,
    '',
  ].join('\n');
}

function abschnitteAlsHtml(abschnitte: readonly Abschnitt[]): string {
  return abschnitte
    .map((abschnitt) => {
      const zeilen = abschnitt.zeilen
        .map(
          (zeile, index) =>
            `<tr style="${index % 2 === 1 ? `background-color:${MAIL_FARBEN.alternierendeZeile};` : ''}">` +
            zelle(maskiere(zeile.position.bezeichnung)) +
            zelle(maskiere(zeile.text.replace(`${zeile.position.bezeichnung}: `, '')), 'left') +
            '</tr>',
        )
        .join('');
      return (
        `<h3 style="font-size:14px;color:${MAIL_FARBEN.text};margin:18px 0 6px;">` +
        `${maskiere(abschnitt.fach)}</h3>` +
        '<table style="border-collapse:collapse;width:100%;">' +
        `<tr>${kopfzelle('Artikel')}${kopfzelle('Angabe')}</tr>${zeilen}</table>`
      );
    })
    .join('');
}

export function berichtAlsHtml(quelle: BerichtsQuelle, art: Berichtsart, heute: string): string {
  const kopf =
    `<h2 style="font-size:18px;color:${MAIL_FARBEN.dunkelblau};margin:0 0 4px;">` +
    `${maskiere(BERICHTSART_TITEL[art])}</h2>` +
    `<p style="font-size:13px;color:${MAIL_FARBEN.sekundaer};margin:0 0 16px;">` +
    `${maskiere(quelle.vorlageBezeichnung)}<br>` +
    `${maskiere(quelle.behaelterBezeichnung)} · ${maskiere(quelle.fahrzeugBezeichnung)}<br>` +
    `Geprüft am ${datum(quelle.geprueftAm)} · erfasst von ${maskiere(quelle.erfasstVon)}` +
    (quelle.gemeldetVonName
      ? `<br>Gemeldet von ${maskiere(quelle.gemeldetVonName)} (Selbstauskunft)`
      : '') +
    '</p>';

  let koerper: string;
  if (art === 'bestellschein') {
    const zeile = (position: Checkposition): string | null => {
      const fehlt = fehlmenge(position);
      return fehlt === 0 ? null : `${zahl(fehlt)} ${einheit(position)} fehlen`;
    };
    const land = nachFach(
      quelle.positionen.filter((p) => istLandBeziehbar(p.herkunft)),
      zeile,
    );
    const seg = nachFach(
      quelle.positionen.filter((p) => !istLandBeziehbar(p.herkunft)),
      zeile,
    );
    koerper =
      land.length === 0 && seg.length === 0
        ? `<p style="font-size:13px;color:${MAIL_FARBEN.gruen};">Keine Fehlmengen.</p>`
        : `<h3 style="font-size:15px;color:${MAIL_FARBEN.dunkelblau};">Land (zuerst bestellen)</h3>` +
          (land.length
            ? abschnitteAlsHtml(land)
            : `<p style="font-size:13px;color:${MAIL_FARBEN.sekundaer};">Keine Fehlmengen.</p>`) +
          `<h3 style="font-size:15px;color:${MAIL_FARBEN.dunkelblau};">SEG</h3>` +
          (seg.length
            ? abschnitteAlsHtml(seg)
            : `<p style="font-size:13px;color:${MAIL_FARBEN.sekundaer};">Keine Fehlmengen.</p>`);
  } else {
    const gefiltert = quelle.positionen.filter((position) =>
      art === 'maengel-land'
        ? istLandBeziehbar(position.herkunft)
        : !istLandBeziehbar(position.herkunft),
    );
    const abschnitte = nachFach(gefiltert, (position) => {
      const gruende = mangelgruende(position, heute, quelle.verfallsdatumErfasst);
      return gruende.length === 0 ? null : `${position.bezeichnung}: ${gruende.join('; ')}`;
    });
    koerper = abschnitte.length
      ? abschnitteAlsHtml(abschnitte)
      : `<p style="font-size:13px;color:${MAIL_FARBEN.gruen};">Keine Mängel gemeldet.</p>`;
  }

  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;color:${MAIL_FARBEN.text};">` +
    kopf +
    koerper +
    `<p style="font-size:11px;color:${MAIL_FARBEN.sekundaer};margin-top:24px;">` +
    `Grundlage: ${maskiere(quelle.grundlage)}</p></div>`
  );
}

export function berichtAlsNachricht(
  quelle: BerichtsQuelle,
  art: Berichtsart,
  an: string,
  betreffVorlage: string,
  heute: string,
): MailNachricht {
  return {
    an,
    betreff:
      `${betreffVorlage} – ${BERICHTSART_TITEL[art]} ` +
      `${quelle.behaelterBezeichnung} (${datum(quelle.geprueftAm)})`,
    text: berichtAlsText(quelle, art, heute),
    html: berichtAlsHtml(quelle, art, heute),
  };
}
