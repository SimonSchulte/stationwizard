import { EIGENTUEMER, Eigentuemer } from '../models/fahrzeug.model';
import { BerichtZeile, KmBericht, VersandQuittung } from '../models/km-bericht.model';
import { istObjekt, istText } from '../../kern/text/pruefung';

/**
 * Prüfungen für die Berichtsantwort des Workers, bevor sie als Domänentyp
 * weiterverwendet wird – wie `fahrzeug-pruefung.ts`, ohne `any` und ohne
 * ungeprüfte Casts.
 */

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

function istGanzzahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert);
}

function istGanzzahlOderNull(wert: unknown): wert is number | null {
  return wert === null || istGanzzahl(wert);
}

function istEigentuemer(wert: unknown): wert is Eigentuemer {
  return istText(wert) && (EIGENTUEMER as readonly string[]).includes(wert);
}

function istBerichtZeile(wert: unknown): wert is BerichtZeile {
  return (
    istObjekt(wert) &&
    istText(wert['id']) &&
    wert['id'].length > 0 &&
    istText(wert['bezeichnung']) &&
    istText(wert['funkrufname']) &&
    istText(wert['kennzeichen']) &&
    istEigentuemer(wert['eigentuemer']) &&
    istGanzzahlOderNull(wert['letzterStand']) &&
    (wert['abgelesenAm'] === null ||
      (istText(wert['abgelesenAm']) && ISO_DATUM.test(wert['abgelesenAm']))) &&
    istGanzzahlOderNull(wert['tageSeitAblesung']) &&
    istGanzzahl(wert['sollKm']) &&
    istGanzzahlOderNull(wert['istKm']) &&
    istGanzzahlOderNull(wert['restKm']) &&
    typeof wert['unvollstaendig'] === 'boolean'
  );
}

export function istKmBericht(wert: unknown): wert is KmBericht {
  return (
    istObjekt(wert) &&
    istText(wert['stichtag']) &&
    ISO_DATUM.test(wert['stichtag']) &&
    istGanzzahl(wert['jahr']) &&
    Array.isArray(wert['zeilen']) &&
    wert['zeilen'].every(istBerichtZeile) &&
    istGanzzahl(wert['ohneAblesung']) &&
    istGanzzahl(wert['unterSoll'])
  );
}

export function istVersandQuittung(wert: unknown): wert is VersandQuittung {
  return (
    istObjekt(wert) &&
    istText(wert['gesendetAn']) &&
    istText(wert['gesendetAm']) &&
    istText(wert['gesendetVon']) &&
    istGanzzahl(wert['anzahlFahrzeuge']) &&
    istText(wert['versandweg'])
  );
}
