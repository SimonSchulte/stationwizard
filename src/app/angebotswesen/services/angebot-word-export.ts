import { formatiereDatum, wochentag } from '../../kern/kalender/datum';
import { Angebot } from '../models/angebot.model';
import { berechneAngebot, KalkulationPositionZeile } from './angebot-kalkulation';
import { formatEuro } from './waehrung';

/**
 * Baut sowohl die Klartext- als auch die HTML-Fassung der Kalkulationstabelle
 * aus derselben strukturierten Kalkulation (`berechneAngebot`) – dieselbe
 * Datenquelle wie die Bildschirmanzeige (`angebot-kalkulationstabelle`), damit
 * beide nie auseinanderlaufen können.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStunden(stunden: number): string {
  return Number.isInteger(stunden) ? String(stunden) : stunden.toFixed(2).replace(/0+$/, '');
}

function stundenText(zeile: Pick<KalkulationPositionZeile, 'art' | 'stunden'>): string {
  return zeile.art === 'fahrzeug' ? '/' : formatStunden(zeile.stunden ?? 0);
}

function einzelpreisText(zeile: Pick<KalkulationPositionZeile, 'art' | 'einzelpreisCent'>): string {
  return `${formatEuro(zeile.einzelpreisCent)} / ${zeile.art === 'fahrzeug' ? 'Pauschal' : 'Stunde'}`;
}

function schichtUeberschrift(schicht: { datum: string; von: string; bis: string }): string {
  return `Schicht: ${formatiereDatum(schicht.datum)} (${wochentag(schicht.datum)}), ${schicht.von}–${schicht.bis} Uhr`;
}

function gesamtLabel(angebot: Pick<Angebot, 'pauschalpreisAktiv'>): string {
  return angebot.pauschalpreisAktiv ? 'Gesamt (Pauschalpreis)' : 'Gesamt';
}

export function angebotAlsKlartextTabelle(angebot: Angebot): string {
  const kalkulation = berechneAngebot(angebot);
  const zeilen: string[] = [
    ['Pos.', 'Bezeichnung', 'Einzelpreis', 'Anzahl', 'Stunde(n)', 'Gesamt'].join('\t'),
  ];
  for (const gruppe of kalkulation.gruppen) {
    zeilen.push(schichtUeberschrift(gruppe.schicht));
    for (const position of gruppe.positionen) {
      zeilen.push(
        [
          String(position.pos),
          position.bezeichnung,
          einzelpreisText(position),
          String(position.anzahl),
          stundenText(position),
          formatEuro(position.gesamtCent),
        ].join('\t'),
      );
    }
    zeilen.push(['', 'Zwischensumme', '', '', '', formatEuro(gruppe.gesamtCent)].join('\t'));
  }
  zeilen.push(
    ['', gesamtLabel(angebot), '', '', '', formatEuro(kalkulation.gesamtCent)].join('\t'),
  );
  if (angebot.pauschalpreisAktiv) {
    zeilen.push(
      ['', 'rechnerisch', '', '', '', formatEuro(kalkulation.rechnerischGesamtCent)].join('\t'),
    );
  }
  return zeilen.join('\n');
}

/**
 * Eine eigenständige HTML-Tabelle für die Zwischenablage – nicht aus dem
 * gerenderten DOM gelesen, damit dieselbe Datenquelle wie Klartext und
 * Bildschirmanzeige gilt und die Funktion ohne DOM testbar bleibt.
 * Hervorhebungen stehen als Inline-`style`, weil Word beim Einfügen keine
 * extern verlinkten Komponentenstile übernimmt.
 */
export function angebotAlsHtmlTabelle(angebot: Angebot): string {
  const kalkulation = berechneAngebot(angebot);
  const kopf =
    '<tr>' +
    ['Pos.', 'Bezeichnung', 'Einzelpreis', 'Anzahl', 'Stunde(n)', 'Gesamt']
      .map((titel) => `<th style="text-align:left">${titel}</th>`)
      .join('') +
    '</tr>';
  const zeilen: string[] = [];
  for (const gruppe of kalkulation.gruppen) {
    zeilen.push(
      `<tr><td colspan="6" style="font-weight:600">${escapeHtml(schichtUeberschrift(gruppe.schicht))}</td></tr>`,
    );
    for (const position of gruppe.positionen) {
      zeilen.push(
        '<tr>' +
          `<td>${position.pos}</td>` +
          `<td>${escapeHtml(position.bezeichnung)}</td>` +
          `<td>${escapeHtml(einzelpreisText(position))}</td>` +
          `<td>${position.anzahl}</td>` +
          `<td>${stundenText(position)}</td>` +
          `<td>${formatEuro(position.gesamtCent)}</td>` +
          '</tr>',
      );
    }
    zeilen.push(
      '<tr>' +
        '<td></td>' +
        '<td style="font-weight:600">Zwischensumme</td>' +
        '<td></td><td></td><td></td>' +
        `<td style="font-weight:600">${formatEuro(gruppe.gesamtCent)}</td>` +
        '</tr>',
    );
  }
  zeilen.push(
    '<tr>' +
      '<td></td>' +
      `<td style="font-weight:700">${gesamtLabel(angebot)}</td>` +
      '<td></td><td></td><td></td>' +
      `<td style="font-weight:700">${formatEuro(kalkulation.gesamtCent)}</td>` +
      '</tr>',
  );
  if (angebot.pauschalpreisAktiv) {
    zeilen.push(
      '<tr>' +
        '<td></td>' +
        '<td style="font-size:0.85em;color:#5c6070">rechnerisch</td>' +
        '<td></td><td></td><td></td>' +
        `<td style="font-size:0.85em;color:#5c6070">${formatEuro(kalkulation.rechnerischGesamtCent)}</td>` +
        '</tr>',
    );
  }
  return (
    '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse">' +
    `<thead>${kopf}</thead><tbody>${zeilen.join('')}</tbody>` +
    '</table>'
  );
}
