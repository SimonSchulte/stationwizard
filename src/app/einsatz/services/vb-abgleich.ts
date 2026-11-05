import { FACHGRUPPE_BEZEICHNUNG } from '../../kern/fachgruppen/fachgruppe';
import {
  ABSCHNITT_FARBE_BEZEICHNUNG,
  VbAbschnitt,
  VbInhalt,
  VbLaufzettel,
} from '../models/vb.model';
import { IdErzeuger } from './vb-kopie';

/**
 * Abgleich einer Vorbereitung mit ihrer Vorlage über `herkunftId` (Konzept Abschnitt 5) und
 * selektives Zurückschreiben auf die Vorlage.
 *
 * Granularität (bewusste Entscheidung): Der Dialog zeigt je Änderung ein Ankreuzfeld.
 * - **Anweisungen**: eine Änderung.
 * - **Abschnitt**: `neu` (samt seinen neuen Laufzetteln), `geloescht` (samt seiner Laufzettel),
 *   `geaendert` (Titel, Farbe, Fachgruppe).
 * - **Laufzettel**: `neu`, `geloescht`, `geaendert`. Alle Unterschiede eines Laufzettels –
 *   Kopffelder, Verschieben in einen anderen Abschnitt und sämtliche Positionen (neu,
 *   geändert, gelöscht, umsortiert) – sind **eine** Änderung; Positionen haben kein eigenes
 *   Ankreuzfeld, sonst wäre der Dialog bei 47 Positionen unbenutzbar. Beim Anwenden wird die
 *   Positionsliste des Laufzettels daher komplett aus der VB übernommen.
 * - **Reihenfolge**: eine Änderung für die Abschnitte und eine je Abschnitt für seine
 *   Laufzettel (`ebene: 'reihenfolge'`), nur über Elemente, die es in beiden Ständen gibt.
 *
 * Laufzettel eines neuen oder gelöschten Abschnitts haben kein eigenes Ankreuzfeld; sie
 * folgen dem Abschnitt. Ein Laufzettel, der aus einem anderen Abschnitt stammt (verschoben),
 * ist dagegen eine eigene `geaendert`-Änderung.
 *
 * `standardGewaehlt` ist für Löschungen `false` (sie gelten oft nur für diesen Einsatz),
 * sonst `true`.
 */
export type VbAenderungArt = 'neu' | 'geaendert' | 'geloescht';
export type VbAenderungEbene = 'anweisungen' | 'abschnitt' | 'laufzettel' | 'reihenfolge';

export interface VbAenderung {
  /** Stabile Kennung (aus Elementids gebildet), gleich für gleichen Abgleich. */
  schluessel: string;
  art: VbAenderungArt;
  ebene: VbAenderungEbene;
  /** Anzeige-Titel, etwa `Abschnitt „GF Betreuung“`. */
  titel: string;
  /** Lesbare Beschreibung der Abweichung. */
  beschreibung: string;
  /** Vorbelegung des Ankreuzfelds. */
  standardGewaehlt: boolean;
}

interface Zuordnung {
  /** VB-Abschnitt-Id → Gegenstück in der Vorlage. */
  abschnittVon: Map<string, VbAbschnitt>;
  /** VB-Laufzettel-Id → Gegenstück in der Vorlage. */
  laufzettelVon: Map<string, VbLaufzettel>;
}

interface InterneAenderung extends VbAenderung {
  /** Reihenfolge der Anwendung (niedrig zuerst). */
  phase: number;
  anwenden(zustand: Zustand): void;
}

interface Zustand {
  vorlage: VbInhalt;
  vb: VbInhalt;
  zuordnung: Zuordnung;
  neueId: IdErzeuger;
}

const PHASE = {
  anweisungen: 1,
  abschnittNeu: 2,
  abschnittGeaendert: 3,
  laufzettelNeu: 4,
  laufzettelGeaendert: 5,
  laufzettelGeloescht: 6,
  abschnittGeloescht: 7,
  reihenfolgeLaufzettel: 8,
  reihenfolgeAbschnitte: 9,
} as const;

function zuordnen(vorlage: VbInhalt, vb: VbInhalt): Zuordnung {
  const vorlageAbschnitte = new Map(vorlage.abschnitte.map((a) => [a.id, a]));
  const vorlageLaufzettel = new Map(
    vorlage.abschnitte.flatMap((a) => a.laufzettel).map((l) => [l.id, l]),
  );
  const abschnittVon = new Map<string, VbAbschnitt>();
  const laufzettelVon = new Map<string, VbLaufzettel>();
  const belegtA = new Set<string>();
  const belegtL = new Set<string>();
  for (const abschnitt of vb.abschnitte) {
    const gegenstueck = abschnitt.herkunftId ? vorlageAbschnitte.get(abschnitt.herkunftId) : null;
    if (gegenstueck && !belegtA.has(gegenstueck.id)) {
      belegtA.add(gegenstueck.id);
      abschnittVon.set(abschnitt.id, gegenstueck);
    }
    for (const laufzettel of abschnitt.laufzettel) {
      const lz = laufzettel.herkunftId ? vorlageLaufzettel.get(laufzettel.herkunftId) : null;
      if (lz && !belegtL.has(lz.id)) {
        belegtL.add(lz.id);
        laufzettelVon.set(laufzettel.id, lz);
      }
    }
  }
  return { abschnittVon, laufzettelVon };
}

function elternDerVorlage(vorlage: VbInhalt, laufzettelId: string): VbAbschnitt | undefined {
  return vorlage.abschnitte.find((a) => a.laufzettel.some((l) => l.id === laufzettelId));
}

function anzahlLaufzettel(abschnitt: VbAbschnitt): number {
  return abschnitt.laufzettel.length;
}

function anzahlPositionen(abschnitt: VbAbschnitt): number {
  return abschnitt.laufzettel.reduce((summe, l) => summe + l.positionen.length, 0);
}

function mehrzahl(anzahl: number, einzahl: string, mehr: string): string {
  return `${anzahl} ${anzahl === 1 ? einzahl : mehr}`;
}

function abschnittTitel(abschnitt: VbAbschnitt): string {
  return `Abschnitt „${abschnitt.titel}“`;
}

function laufzettelTitel(laufzettel: VbLaufzettel, abschnitt: VbAbschnitt): string {
  const name = laufzettel.ueberschrift || 'Laufzettel';
  const ort = laufzettel.lagerort ? `, ${laufzettel.lagerort}` : '';
  return `${abschnitt.titel}: ${name}${ort}`;
}

function wert(text: string): string {
  return text === '' ? '(leer)' : `„${text}“`;
}

function fachgruppeText(gruppe: VbAbschnitt['fachgruppe']): string {
  return gruppe ? FACHGRUPPE_BEZEICHNUNG[gruppe] : 'keine';
}

function abschnittUnterschiede(vorlage: VbAbschnitt, vb: VbAbschnitt): string[] {
  const teile: string[] = [];
  if (vorlage.titel !== vb.titel) teile.push(`Titel: ${wert(vorlage.titel)} → ${wert(vb.titel)}`);
  if (vorlage.farbe !== vb.farbe) {
    teile.push(
      `Farbe: ${ABSCHNITT_FARBE_BEZEICHNUNG[vorlage.farbe]} → ${ABSCHNITT_FARBE_BEZEICHNUNG[vb.farbe]}`,
    );
  }
  if (vorlage.fachgruppe !== vb.fachgruppe) {
    teile.push(
      `Fachgruppe: ${fachgruppeText(vorlage.fachgruppe)} → ${fachgruppeText(vb.fachgruppe)}`,
    );
  }
  return teile;
}

/** Positionen eines VB-Laufzettels gegen die des Vorlagen-Laufzettels (nur innerhalb des Laufzettels). */
function positionenZuordnen(vorlage: VbLaufzettel, vb: VbLaufzettel) {
  const vorlagePositionen = new Map(vorlage.positionen.map((p) => [p.id, p]));
  const belegt = new Set<string>();
  const gegenstueck = new Map<string, string>();
  for (const position of vb.positionen) {
    const gegen = position.herkunftId ? vorlagePositionen.get(position.herkunftId) : undefined;
    if (gegen && !belegt.has(gegen.id)) {
      belegt.add(gegen.id);
      gegenstueck.set(position.id, gegen.id);
    }
  }
  return { vorlagePositionen, belegt, gegenstueck };
}

function laufzettelUnterschiede(
  vorlage: VbLaufzettel,
  vb: VbLaufzettel,
  verschoben: string | null,
): string[] {
  const teile: string[] = [];
  const felder: [string, string, string][] = [
    ['Überschrift', vorlage.ueberschrift, vb.ueberschrift],
    ['Von', vorlage.lagerort, vb.lagerort],
    ['Auf / In', vorlage.transportMit, vb.transportMit],
    ['Rückfragen an', vorlage.auftraggeber, vb.auftraggeber],
  ];
  for (const [name, alt, neu] of felder) {
    if (alt !== neu) teile.push(`${name}: ${wert(alt)} → ${wert(neu)}`);
  }
  if (vorlage.fachgruppe !== vb.fachgruppe) {
    teile.push(
      `Fachgruppe: ${fachgruppeText(vorlage.fachgruppe)} → ${fachgruppeText(vb.fachgruppe)}`,
    );
  }
  if (verschoben) teile.push(verschoben);

  const { belegt, gegenstueck, vorlagePositionen } = positionenZuordnen(vorlage, vb);
  const neu = vb.positionen.filter((p) => !gegenstueck.has(p.id)).length;
  const geloescht = vorlage.positionen.filter((p) => !belegt.has(p.id)).length;
  const geaendert = vb.positionen.filter((p) => {
    const gegenId = gegenstueck.get(p.id);
    const gegen = gegenId ? vorlagePositionen.get(gegenId) : undefined;
    return gegen !== undefined && (gegen.anzahl !== p.anzahl || gegen.material !== p.material);
  }).length;
  const reihenfolgeVb = vb.positionen.map((p) => gegenstueck.get(p.id)).filter((id) => id);
  const reihenfolgeVorlage = vorlage.positionen.map((p) => p.id).filter((id) => belegt.has(id));
  const umsortiert = reihenfolgeVb.join() !== reihenfolgeVorlage.join();
  const positionsTeile: string[] = [];
  if (neu) positionsTeile.push(`${neu} neu`);
  if (geaendert) positionsTeile.push(`${geaendert} geändert`);
  if (geloescht) positionsTeile.push(`${geloescht} gelöscht`);
  if (umsortiert) positionsTeile.push('Reihenfolge geändert');
  if (positionsTeile.length) teile.push(`Positionen: ${positionsTeile.join(', ')}`);
  return teile;
}

function ordneNach<T extends { id: string }>(liste: T[], gewuenscht: string[]): T[] {
  const vorhanden = new Set(liste.map((e) => e.id));
  const reihe = gewuenscht.filter((id) => vorhanden.has(id));
  const nachId = new Map(liste.map((e) => [e.id, e]));
  const wunsch = new Set(reihe);
  let zaehler = 0;
  return liste.map((element) => {
    if (!wunsch.has(element.id)) return element;
    const naechstes = nachId.get(reihe[zaehler]);
    zaehler += 1;
    return naechstes ?? element;
  });
}

function fuegeNachEin<T extends { id: string }>(
  liste: T[],
  element: T,
  vorgaengerId: string | null,
) {
  const index = vorgaengerId === null ? -1 : liste.findIndex((e) => e.id === vorgaengerId);
  liste.splice(index + 1, 0, element);
}

function kopiereLaufzettelNeu(quelle: VbLaufzettel, neueId: IdErzeuger): VbLaufzettel {
  const kopie: VbLaufzettel = {
    ...quelle,
    id: neueId(),
    herkunftId: null,
    positionen: quelle.positionen.map((p) => ({ ...p, id: neueId(), herkunftId: null })),
  };
  // In der VB zeigt die Herkunft künftig auf die neue Vorlagen-Id.
  quelle.herkunftId = kopie.id;
  quelle.positionen.forEach((position, index) => {
    position.herkunftId = kopie.positionen[index].id;
  });
  return kopie;
}

/** Vorlagen-Gegenstück des nächsten vorangehenden VB-Geschwisters, das in `eltern` liegt. */
function vorgaengerInVorlage(
  geschwister: { id: string }[],
  index: number,
  gegenstueck: (id: string) => { id: string } | undefined,
  liegtInEltern: (id: string) => boolean,
): string | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const gegen = gegenstueck(geschwister[i].id);
    if (gegen && liegtInEltern(gegen.id)) return gegen.id;
  }
  return null;
}

function berechne(vorlage: VbInhalt, vb: VbInhalt): InterneAenderung[] {
  const z = zuordnen(vorlage, vb);
  const ergebnis: InterneAenderung[] = [];
  const benutzteAbschnitte = new Set([...z.abschnittVon.values()].map((a) => a.id));
  const benutzteLaufzettel = new Set([...z.laufzettelVon.values()].map((l) => l.id));

  // Anweisungen
  if (vorlage.anweisungen !== vb.anweisungen) {
    ergebnis.push({
      schluessel: 'anweisungen',
      art: 'geaendert',
      ebene: 'anweisungen',
      titel: 'Allgemeine Anweisungen',
      beschreibung: !vb.anweisungen
        ? 'Text entfernt'
        : !vorlage.anweisungen
          ? 'Text ergänzt'
          : 'Text geändert',
      standardGewaehlt: true,
      phase: PHASE.anweisungen,
      anwenden: (s) => {
        s.vorlage.anweisungen = s.vb.anweisungen;
      },
    });
  }

  // Abschnitte: neu und geändert (in VB-Reihenfolge)
  for (const abschnitt of vb.abschnitte) {
    const gegen = z.abschnittVon.get(abschnitt.id);
    if (!gegen) {
      const neueLaufzettel = abschnitt.laufzettel.filter((l) => !z.laufzettelVon.has(l.id));
      ergebnis.push({
        schluessel: `abschnitt:neu:${abschnitt.id}`,
        art: 'neu',
        ebene: 'abschnitt',
        titel: abschnittTitel(abschnitt),
        beschreibung: `Neuer Abschnitt mit ${mehrzahl(neueLaufzettel.length, 'neuem Laufzettel', 'neuen Laufzetteln')} und ${mehrzahl(
          neueLaufzettel.reduce((s, l) => s + l.positionen.length, 0),
          'Position',
          'Positionen',
        )}`,
        standardGewaehlt: true,
        phase: PHASE.abschnittNeu,
        anwenden: (s) => {
          const vbAbschnitt = s.vb.abschnitte.find((a) => a.id === abschnitt.id);
          if (!vbAbschnitt) return;
          const neuerAbschnitt: VbAbschnitt = {
            id: s.neueId(),
            herkunftId: null,
            titel: vbAbschnitt.titel,
            farbe: vbAbschnitt.farbe,
            fachgruppe: vbAbschnitt.fachgruppe,
            laufzettel: [],
          };
          for (const lz of vbAbschnitt.laufzettel) {
            if (s.zuordnung.laufzettelVon.has(lz.id)) continue;
            const kopie = kopiereLaufzettelNeu(lz, s.neueId);
            neuerAbschnitt.laufzettel.push(kopie);
            s.zuordnung.laufzettelVon.set(lz.id, kopie);
          }
          const position = s.vb.abschnitte.findIndex((a) => a.id === vbAbschnitt.id);
          const vorgaenger = vorgaengerInVorlage(
            s.vb.abschnitte,
            position,
            (id) => s.zuordnung.abschnittVon.get(id),
            (id) => s.vorlage.abschnitte.some((a) => a.id === id),
          );
          fuegeNachEin(s.vorlage.abschnitte, neuerAbschnitt, vorgaenger);
          vbAbschnitt.herkunftId = neuerAbschnitt.id;
          s.zuordnung.abschnittVon.set(vbAbschnitt.id, neuerAbschnitt);
        },
      });
    } else {
      const unterschiede = abschnittUnterschiede(gegen, abschnitt);
      if (unterschiede.length) {
        ergebnis.push({
          schluessel: `abschnitt:geaendert:${gegen.id}`,
          art: 'geaendert',
          ebene: 'abschnitt',
          titel: abschnittTitel(gegen),
          beschreibung: unterschiede.join('; '),
          standardGewaehlt: true,
          phase: PHASE.abschnittGeaendert,
          anwenden: (s) => {
            const ziel = s.vorlage.abschnitte.find((a) => a.id === gegen.id);
            const quelle = s.vb.abschnitte.find((a) => a.id === abschnitt.id);
            if (!ziel || !quelle) return;
            ziel.titel = quelle.titel;
            ziel.farbe = quelle.farbe;
            ziel.fachgruppe = quelle.fachgruppe;
          },
        });
      }
    }
  }

  // Laufzettel: neu (in bestehenden Abschnitten) und geändert
  for (const abschnitt of vb.abschnitte) {
    const vorlageAbschnitt = z.abschnittVon.get(abschnitt.id);
    for (const laufzettel of abschnitt.laufzettel) {
      const gegen = z.laufzettelVon.get(laufzettel.id);
      if (!gegen) {
        if (!vorlageAbschnitt) continue; // folgt dem neuen Abschnitt
        ergebnis.push({
          schluessel: `laufzettel:neu:${laufzettel.id}`,
          art: 'neu',
          ebene: 'laufzettel',
          titel: laufzettelTitel(laufzettel, abschnitt),
          beschreibung: `Neuer Laufzettel mit ${mehrzahl(laufzettel.positionen.length, 'Position', 'Positionen')}`,
          standardGewaehlt: true,
          phase: PHASE.laufzettelNeu,
          anwenden: (s) => {
            const vbAbschnitt = s.vb.abschnitte.find((a) => a.id === abschnitt.id);
            const vbLz = vbAbschnitt?.laufzettel.find((l) => l.id === laufzettel.id);
            const ziel = vbAbschnitt ? s.zuordnung.abschnittVon.get(vbAbschnitt.id) : undefined;
            if (!vbAbschnitt || !vbLz || !ziel) return;
            const kopie = kopiereLaufzettelNeu(vbLz, s.neueId);
            const index = vbAbschnitt.laufzettel.findIndex((l) => l.id === vbLz.id);
            const vorgaenger = vorgaengerInVorlage(
              vbAbschnitt.laufzettel,
              index,
              (id) => s.zuordnung.laufzettelVon.get(id),
              (id) => ziel.laufzettel.some((l) => l.id === id),
            );
            fuegeNachEin(ziel.laufzettel, kopie, vorgaenger);
            s.zuordnung.laufzettelVon.set(vbLz.id, kopie);
          },
        });
        continue;
      }
      const alterEltern = elternDerVorlage(vorlage, gegen.id);
      const neuerEltern = vorlageAbschnitt;
      let verschoben: string | null = null;
      if (!neuerEltern) verschoben = `Verschoben in neuen Abschnitt „${abschnitt.titel}“`;
      else if (alterEltern && alterEltern.id !== neuerEltern.id) {
        verschoben = `Verschoben von „${alterEltern.titel}“ nach „${neuerEltern.titel}“`;
      }
      const unterschiede = laufzettelUnterschiede(gegen, laufzettel, verschoben);
      if (!unterschiede.length) continue;
      ergebnis.push({
        schluessel: `laufzettel:geaendert:${gegen.id}`,
        art: 'geaendert',
        ebene: 'laufzettel',
        titel: laufzettelTitel(gegen, alterEltern ?? abschnitt),
        beschreibung: unterschiede.join('; '),
        standardGewaehlt: true,
        phase: PHASE.laufzettelGeaendert,
        anwenden: (s) => {
          const vbAbschnitt = s.vb.abschnitte.find((a) => a.id === abschnitt.id);
          const vbLz = vbAbschnitt?.laufzettel.find((l) => l.id === laufzettel.id);
          const ziel = s.zuordnung.laufzettelVon.get(laufzettel.id);
          if (!vbAbschnitt || !vbLz || !ziel) return;
          ziel.ueberschrift = vbLz.ueberschrift;
          ziel.lagerort = vbLz.lagerort;
          ziel.transportMit = vbLz.transportMit;
          ziel.auftraggeber = vbLz.auftraggeber;
          ziel.fachgruppe = vbLz.fachgruppe;
          const { gegenstueck } = positionenZuordnen(ziel, vbLz);
          const vorherige = new Map(ziel.positionen.map((p) => [p.id, p]));
          ziel.positionen = vbLz.positionen.map((position) => {
            const gegenId = gegenstueck.get(position.id);
            const vorherig = gegenId ? vorherige.get(gegenId) : undefined;
            if (vorherig) {
              return { ...vorherig, anzahl: position.anzahl, material: position.material };
            }
            const neu = {
              id: s.neueId(),
              herkunftId: null,
              anzahl: position.anzahl,
              material: position.material,
            };
            position.herkunftId = neu.id;
            return neu;
          });
          // Verschieben in einen anderen (bestehenden oder soeben neu angelegten) Abschnitt.
          const neuerZiel = s.zuordnung.abschnittVon.get(vbAbschnitt.id);
          const aktuellerEltern = elternDerVorlage(s.vorlage, ziel.id);
          if (neuerZiel && aktuellerEltern && aktuellerEltern.id !== neuerZiel.id) {
            aktuellerEltern.laufzettel = aktuellerEltern.laufzettel.filter((l) => l.id !== ziel.id);
            const index = vbAbschnitt.laufzettel.findIndex((l) => l.id === vbLz.id);
            const vorgaenger = vorgaengerInVorlage(
              vbAbschnitt.laufzettel,
              index,
              (id) => s.zuordnung.laufzettelVon.get(id),
              (id) => neuerZiel.laufzettel.some((l) => l.id === id),
            );
            fuegeNachEin(neuerZiel.laufzettel, ziel, vorgaenger);
          }
        },
      });
    }
  }

  // Gelöschte Laufzettel (nur in Abschnitten, die bleiben)
  for (const abschnitt of vorlage.abschnitte) {
    const bleibt = benutzteAbschnitte.has(abschnitt.id);
    for (const laufzettel of abschnitt.laufzettel) {
      if (!bleibt || benutzteLaufzettel.has(laufzettel.id)) continue;
      ergebnis.push({
        schluessel: `laufzettel:geloescht:${laufzettel.id}`,
        art: 'geloescht',
        ebene: 'laufzettel',
        titel: laufzettelTitel(laufzettel, abschnitt),
        beschreibung: `Laufzettel mit ${mehrzahl(laufzettel.positionen.length, 'Position', 'Positionen')} in dieser Vorbereitung entfernt`,
        standardGewaehlt: false,
        phase: PHASE.laufzettelGeloescht,
        anwenden: (s) => {
          const eltern = elternDerVorlage(s.vorlage, laufzettel.id);
          if (eltern) eltern.laufzettel = eltern.laufzettel.filter((l) => l.id !== laufzettel.id);
        },
      });
    }
  }

  // Gelöschte Abschnitte
  for (const abschnitt of vorlage.abschnitte) {
    if (benutzteAbschnitte.has(abschnitt.id)) continue;
    ergebnis.push({
      schluessel: `abschnitt:geloescht:${abschnitt.id}`,
      art: 'geloescht',
      ebene: 'abschnitt',
      titel: abschnittTitel(abschnitt),
      beschreibung: `Abschnitt mit ${mehrzahl(anzahlLaufzettel(abschnitt), 'Laufzettel', 'Laufzetteln')} und ${mehrzahl(anzahlPositionen(abschnitt), 'Position', 'Positionen')} in dieser Vorbereitung entfernt`,
      standardGewaehlt: false,
      phase: PHASE.abschnittGeloescht,
      anwenden: (s) => {
        s.vorlage.abschnitte = s.vorlage.abschnitte.filter((a) => a.id !== abschnitt.id);
      },
    });
  }

  // Reihenfolge der Laufzettel je bestehendem Abschnitt
  for (const abschnitt of vb.abschnitte) {
    const gegen = z.abschnittVon.get(abschnitt.id);
    if (!gegen) continue;
    const gewuenscht = abschnitt.laufzettel
      .map((l) => z.laufzettelVon.get(l.id))
      .filter((l): l is VbLaufzettel => l !== undefined && gegen.laufzettel.includes(l))
      .map((l) => l.id);
    const aktuell = gegen.laufzettel.map((l) => l.id).filter((id) => gewuenscht.includes(id));
    if (gewuenscht.join() === aktuell.join()) continue;
    ergebnis.push({
      schluessel: `reihenfolge:laufzettel:${gegen.id}`,
      art: 'geaendert',
      ebene: 'reihenfolge',
      titel: `Reihenfolge der Laufzettel in „${gegen.titel}“`,
      beschreibung: 'Laufzettel sind in dieser Vorbereitung anders angeordnet',
      standardGewaehlt: true,
      phase: PHASE.reihenfolgeLaufzettel,
      anwenden: (s) => {
        const ziel = s.vorlage.abschnitte.find((a) => a.id === gegen.id);
        const vbAbschnitt = s.vb.abschnitte.find((a) => a.id === abschnitt.id);
        if (!ziel || !vbAbschnitt) return;
        const wunsch = vbAbschnitt.laufzettel
          .map((l) => s.zuordnung.laufzettelVon.get(l.id)?.id)
          .filter((id): id is string => id !== undefined);
        ziel.laufzettel = ordneNach(ziel.laufzettel, wunsch);
      },
    });
  }

  // Reihenfolge der Abschnitte
  const abschnittWunsch = vb.abschnitte
    .map((a) => z.abschnittVon.get(a.id)?.id)
    .filter((id): id is string => id !== undefined);
  const abschnittAktuell = vorlage.abschnitte
    .map((a) => a.id)
    .filter((id) => abschnittWunsch.includes(id));
  if (abschnittWunsch.join() !== abschnittAktuell.join()) {
    ergebnis.push({
      schluessel: 'reihenfolge:abschnitte',
      art: 'geaendert',
      ebene: 'reihenfolge',
      titel: 'Reihenfolge der Abschnitte',
      beschreibung: 'Abschnitte sind in dieser Vorbereitung anders angeordnet',
      standardGewaehlt: true,
      phase: PHASE.reihenfolgeAbschnitte,
      anwenden: (s) => {
        const wunsch = s.vb.abschnitte
          .map((a) => s.zuordnung.abschnittVon.get(a.id)?.id)
          .filter((id): id is string => id !== undefined);
        s.vorlage.abschnitte = ordneNach(s.vorlage.abschnitte, wunsch);
      },
    });
  }

  return ergebnis;
}

/**
 * Unterschiede zwischen Vorlage und Vorbereitung. Reihenfolge der Liste: Anweisungen,
 * Abschnitte, Laufzettel (neu/geändert, dann gelöscht), Abschnittslöschungen, Reihenfolgen.
 * Eine frisch kopierte, unveränderte Vorbereitung liefert eine leere Liste.
 */
export function vbAbgleich(vorlage: VbInhalt, vb: VbInhalt): VbAenderung[] {
  return berechne(vorlage, vb).map(
    ({ schluessel, art, ebene, titel, beschreibung, standardGewaehlt }) => ({
      schluessel,
      art,
      ebene,
      titel,
      beschreibung,
      standardGewaehlt,
    }),
  );
}

/**
 * Wendet nur die gewählten Änderungen auf die Vorlage an. Neue Elemente erhalten in der
 * Vorlage eine neue Id (`herkunftId` `null`); in der VB zeigt ihre `herkunftId` danach auf
 * diese Id. Eingaben bleiben unverändert, beide Stände werden als neue Objekte geliefert.
 * Unbekannte Schlüssel werden ignoriert.
 */
export function wendeAenderungenAn(
  vorlage: VbInhalt,
  vb: VbInhalt,
  schluessel: ReadonlySet<string>,
  neueId: IdErzeuger = () => crypto.randomUUID(),
): { vorlage: VbInhalt; vb: VbInhalt } {
  const zustand: Zustand = {
    vorlage: structuredClone(vorlage),
    vb: structuredClone(vb),
    zuordnung: { abschnittVon: new Map(), laufzettelVon: new Map() },
    neueId,
  };
  zustand.zuordnung = zuordnen(zustand.vorlage, zustand.vb);
  const gewaehlt = berechne(vorlage, vb)
    .filter((a) => schluessel.has(a.schluessel))
    .sort((a, b) => a.phase - b.phase);
  for (const aenderung of gewaehlt) aenderung.anwenden(zustand);
  return { vorlage: zustand.vorlage, vb: zustand.vb };
}
