import { Injectable, inject } from '@angular/core';
import { MatSnackBar, type MatSnackBarRef } from '@angular/material/snack-bar';
import { MeldungSnackbar, type MeldungSnackbarDaten } from './meldung-snackbar';

import type { MeldungArt } from './meldung-art';
export type { MeldungArt } from './meldung-art';

export interface MeldungOptionen {
  /** Beschriftung eines Aktionsknopfs, etwa „Erneut versuchen“. */
  aktion?: string;
  beiAktion?: () => void;
  /** Wird gerufen, wenn die Person die Meldung selbst schließt (nicht bei Aktion/Ablauf). */
  beiSchliessen?: () => void;
  /** Anzeigedauer in Millisekunden; `null` bleibt stehen, bis sie geschlossen wird. */
  dauerMs?: number | null;
}

/** Griff auf eine angeforderte Meldung; schließt sie oder nimmt sie aus der Warteschlange. */
export interface MeldungsGriff {
  schliessen(): void;
}

interface Eintrag {
  art: MeldungArt;
  text: string;
  optionen: MeldungOptionen;
  ref: MatSnackBarRef<MeldungSnackbar> | null;
  beendet: boolean;
}

/**
 * Standarddauer: Erfolg und Hinweis verschwinden von selbst, Warnungen und Fehler bleiben
 * länger stehen; mit einer Aktion („Erneut versuchen“) bleiben sie, bis sie erledigt sind.
 */
function standardDauer(art: MeldungArt, mitAktion: boolean): number | null {
  if (mitAktion && (art === 'fehler' || art === 'warnung')) return null;
  return art === 'fehler' || art === 'warnung' ? 10_000 : 5_000;
}

/**
 * Einzige Stelle, die Fehler, Warnungen, Hinweise und Erfolgsmeldungen ausgibt: als
 * Material-Snackbar (`MatSnackBar`) mit Symbol und Farbe je Art. Weil eine Snackbar immer nur
 * eine Meldung zeigt, stehen weitere in einer Warteschlange und folgen nacheinander. Fehler
 * und Warnungen werden für Bildschirmleser sofort (`assertive`) angesagt.
 *
 * Nicht hierher gehören Fehler eines einzelnen Formularfelds (`mat-error`) und Hinweise, die
 * an einer Tabellenzeile hängen – die bleiben an ihrem Ort.
 */
@Injectable({ providedIn: 'root' })
export class MeldungsDienst {
  private readonly snackBar = inject(MatSnackBar);
  private readonly warteschlange: Eintrag[] = [];
  private aktuell: Eintrag | null = null;

  fehler(text: string, optionen: MeldungOptionen = {}): MeldungsGriff {
    return this.zeige('fehler', text, optionen);
  }

  warnung(text: string, optionen: MeldungOptionen = {}): MeldungsGriff {
    return this.zeige('warnung', text, optionen);
  }

  info(text: string, optionen: MeldungOptionen = {}): MeldungsGriff {
    return this.zeige('info', text, optionen);
  }

  erfolg(text: string, optionen: MeldungOptionen = {}): MeldungsGriff {
    return this.zeige('erfolg', text, optionen);
  }

  zeige(art: MeldungArt, text: string, optionen: MeldungOptionen = {}): MeldungsGriff {
    const eintrag: Eintrag = { art, text, optionen, ref: null, beendet: false };
    this.warteschlange.push(eintrag);
    this.weiter();
    return { schliessen: () => this.schliessen(eintrag) };
  }

  private schliessen(eintrag: Eintrag): void {
    if (eintrag.beendet) return;
    eintrag.beendet = true;
    if (eintrag.ref) {
      eintrag.ref.dismiss();
    } else {
      const index = this.warteschlange.indexOf(eintrag);
      if (index >= 0) this.warteschlange.splice(index, 1);
    }
  }

  private weiter(): void {
    if (this.aktuell) return;
    const eintrag = this.warteschlange.shift();
    if (!eintrag) return;
    this.aktuell = eintrag;
    const { art, text, optionen } = eintrag;
    const dauer =
      optionen.dauerMs === undefined ? standardDauer(art, !!optionen.aktion) : optionen.dauerMs;
    const daten: MeldungSnackbarDaten = { art, text, aktion: optionen.aktion ?? null };
    const ref = this.snackBar.openFromComponent(MeldungSnackbar, {
      data: daten,
      duration: dauer ?? undefined,
      panelClass: ['meldung-snack', `meldung-snack--${art}`],
      politeness: art === 'fehler' || art === 'warnung' ? 'assertive' : 'polite',
    });
    eintrag.ref = ref;
    ref.onAction().subscribe(() => optionen.beiAktion?.());
    ref.afterDismissed().subscribe(({ dismissedByAction }) => {
      const vonPerson = !dismissedByAction && ref.instance.vonPersonGeschlossen;
      if (vonPerson && !eintrag.beendet) optionen.beiSchliessen?.();
      eintrag.beendet = true;
      this.aktuell = null;
      this.weiter();
    });
  }
}
