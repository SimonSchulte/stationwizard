import { istObjekt, istText } from '../../kern/text/pruefung';
import {
  AUFBAU_GRENZEN,
  Aufbau,
  AufbauEinheit,
  AufbauEintrag,
  AufbauInhalt,
  AufbauKistenPosition,
  AufbauVorlage,
  AufbauVorlageKopf,
} from '../models/aufbau.model';
import { ABSCHNITT_FARBEN } from '../models/druck.model';
import { istGanzzahlAb, istTextBis, istUuid, istUuidOderNull, nurFelder } from './einsatz-pruefung';
import { istGueltigeMenge } from './stammdaten-pruefung';

/**
 * Prüfung unbekannter Serverantworten gegen den Aufbau-Vertrag: unbekannte Felder abgelehnt, Ids im
 * gesamten Inhalt eindeutig, Grenzen eingehalten. Ob die Verweise auf Artikel und Lager passen,
 * zeigt der Abgleich mit den Stammdaten (`aufbau-abgleich.ts`), nicht diese Prüfung.
 */

interface Zaehler {
  ids: Set<string>;
  einheiten: number;
}

function neueId(wert: unknown, z: Zaehler): boolean {
  if (!istUuid(wert)) return false;
  const id = wert.toLowerCase();
  if (z.ids.has(id)) return false;
  z.ids.add(id);
  return true;
}

function istPhase(wert: unknown): boolean {
  return wert === null || wert === 'vorher' || wert === 'zum-schluss';
}

function istKistenPosition(wert: unknown): wert is AufbauKistenPosition {
  if (
    !istObjekt(wert) ||
    typeof wert['menge'] !== 'number' ||
    !istGueltigeMenge(wert['menge']) ||
    !istTextBis(wert['bemerkung'], AUFBAU_GRENZEN.bemerkung)
  ) {
    return false;
  }
  if (wert['artikelId'] === null) {
    return (
      nurFelder(wert, ['artikelId', 'name', 'einheit', 'menge', 'bemerkung']) &&
      istTextBis(wert['name'], AUFBAU_GRENZEN.name, 1) &&
      istTextBis(wert['einheit'], AUFBAU_GRENZEN.einheit)
    );
  }
  return nurFelder(wert, ['artikelId', 'menge', 'bemerkung']) && istUuid(wert['artikelId']);
}

function istEintrag(wert: unknown, z: Zaehler, inFahrzeug: boolean): wert is AufbauEintrag {
  if (!istObjekt(wert)) return false;
  if (wert['art'] === 'artikel') {
    return (
      nurFelder(wert, ['art', 'id', 'artikelId', 'menge', 'bemerkung', 'lagerId', 'phase']) &&
      neueId(wert['id'], z) &&
      istUuid(wert['artikelId']) &&
      typeof wert['menge'] === 'number' &&
      istGueltigeMenge(wert['menge']) &&
      istTextBis(wert['bemerkung'], AUFBAU_GRENZEN.bemerkung) &&
      istUuidOderNull(wert['lagerId']) &&
      istPhase(wert['phase'])
    );
  }
  if (wert['art'] === 'frei') {
    return (
      nurFelder(wert, ['art', 'id', 'name', 'einheit', 'menge', 'bemerkung', 'lagerId', 'phase']) &&
      neueId(wert['id'], z) &&
      istTextBis(wert['name'], AUFBAU_GRENZEN.name, 1) &&
      istTextBis(wert['einheit'], AUFBAU_GRENZEN.einheit) &&
      typeof wert['menge'] === 'number' &&
      istGueltigeMenge(wert['menge']) &&
      istTextBis(wert['bemerkung'], AUFBAU_GRENZEN.bemerkung) &&
      istUuidOderNull(wert['lagerId']) &&
      istPhase(wert['phase'])
    );
  }
  if (wert['art'] === 'kiste') {
    const inhalt = wert['inhalt'];
    const positionen = Array.isArray(inhalt) ? inhalt : null;
    return (
      nurFelder(wert, [
        'art',
        'id',
        'kisteId',
        'name',
        'lagerId',
        'anzahl',
        'inhalt',
        'standardInhalt',
        'phase',
      ]) &&
      neueId(wert['id'], z) &&
      istUuidOderNull(wert['kisteId']) &&
      istTextBis(wert['name'], AUFBAU_GRENZEN.name, 1) &&
      istUuidOderNull(wert['lagerId']) &&
      (wert['standardInhalt'] === undefined || typeof wert['standardInhalt'] === 'boolean') &&
      istGanzzahlAb(wert['anzahl'], 1) &&
      (wert['anzahl'] as number) <= AUFBAU_GRENZEN.kistenAnzahl &&
      positionen !== null &&
      positionen.length <= AUFBAU_GRENZEN.kistenPositionen &&
      positionen.every(istKistenPosition) &&
      new Set(
        positionen.flatMap((p: AufbauKistenPosition) =>
          p.artikelId ? [p.artikelId.toLowerCase()] : [],
        ),
      ).size === positionen.filter((p: AufbauKistenPosition) => p.artikelId).length &&
      istPhase(wert['phase'])
    );
  }
  if (wert['art'] === 'wagen') {
    return (
      inFahrzeug &&
      nurFelder(wert, ['art', 'id', 'einheit']) &&
      neueId(wert['id'], z) &&
      istEinheit(wert['einheit'], z, false) &&
      (wert['einheit'] as AufbauEinheit).typ === 'wagen'
    );
  }
  return false;
}

function istEinheit(wert: unknown, z: Zaehler, oberste: boolean): wert is AufbauEinheit {
  if (
    !istObjekt(wert) ||
    !nurFelder(wert, ['id', 'typ', 'name', 'farbe', 'foto', 'anweisung', 'bemerkung', 'inhalt'])
  ) {
    return false;
  }
  z.einheiten += 1;
  if (z.einheiten > AUFBAU_GRENZEN.einheiten) return false;
  const typ = wert['typ'];
  if (typ !== 'fahrzeug' && typ !== 'wagen') return false;
  if (!oberste && typ !== 'wagen') return false;
  const foto = wert['foto'];
  const inhalt = wert['inhalt'];
  return (
    neueId(wert['id'], z) &&
    istTextBis(wert['name'], AUFBAU_GRENZEN.name, 1) &&
    istText(wert['farbe']) &&
    (ABSCHNITT_FARBEN as readonly string[]).includes(wert['farbe']) &&
    istTextBis(wert['anweisung'], AUFBAU_GRENZEN.anweisung) &&
    istTextBis(wert['bemerkung'], AUFBAU_GRENZEN.bemerkung) &&
    (foto === undefined ||
      (istText(foto) &&
        foto.length <= AUFBAU_GRENZEN.foto &&
        foto.startsWith('data:image/jpeg;base64,'))) &&
    Array.isArray(inhalt) &&
    inhalt.length <= AUFBAU_GRENZEN.eintraegeJeEinheit &&
    inhalt.every((e) => istEintrag(e, z, typ === 'fahrzeug'))
  );
}

export function istAufbauInhalt(wert: unknown): wert is AufbauInhalt {
  if (!istObjekt(wert) || !nurFelder(wert, ['anweisungen', 'einheiten'])) return false;
  const einheiten = wert['einheiten'];
  if (!istTextBis(wert['anweisungen'], AUFBAU_GRENZEN.anweisungen)) return false;
  if (!Array.isArray(einheiten) || einheiten.length > AUFBAU_GRENZEN.einheiten) return false;
  const z: Zaehler = { ids: new Set(), einheiten: 0 };
  return einheiten.every((e) => istEinheit(e, z, true));
}

export function istAufbau(wert: unknown): wert is Aufbau {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['vorlageId', 'vorlageVersion', 'inhalt']) &&
    istUuidOderNull(wert['vorlageId']) &&
    (wert['vorlageVersion'] === null || istGanzzahlAb(wert['vorlageVersion'], 1)) &&
    istAufbauInhalt(wert['inhalt'])
  );
}

export function istAufbauVorlage(wert: unknown): wert is AufbauVorlage {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'titel', 'inhalt']) &&
    istUuid(wert['id']) &&
    istTextBis(wert['titel'], 200, 1) &&
    istAufbauInhalt(wert['inhalt'])
  );
}

export function istAufbauVorlageKopf(wert: unknown): wert is AufbauVorlageKopf {
  return (
    istObjekt(wert) &&
    nurFelder(wert, [
      'id',
      'titel',
      'version',
      'einheiten',
      'kisten',
      'positionen',
      'geaendertAm',
    ]) &&
    istUuid(wert['id']) &&
    istTextBis(wert['titel'], 200, 1) &&
    istGanzzahlAb(wert['version'], 1) &&
    istGanzzahlAb(wert['einheiten'], 0) &&
    istGanzzahlAb(wert['kisten'], 0) &&
    istGanzzahlAb(wert['positionen'], 0) &&
    istText(wert['geaendertAm'])
  );
}
