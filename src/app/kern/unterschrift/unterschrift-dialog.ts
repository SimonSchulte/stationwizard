import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { UnterschriftAnzeige } from './unterschrift-anzeige';
import {
  istZeichnungBrauchbar,
  UNTERSCHRIFT_BREITE,
  UNTERSCHRIFT_HOEHE,
  UNTERSCHRIFT_PUNKTE_MAX,
  UNTERSCHRIFT_SCHRIFTEN,
  UNTERSCHRIFT_STRICHE_MAX,
  UNTERSCHRIFT_TEXT_MAX,
  UnterschriftDaten,
  UnterschriftPunkt,
  UnterschriftSchrift,
} from './unterschrift.model';

export interface UnterschriftDialogDaten {
  /** Bisher hinterlegte Unterschrift, `null` wenn es noch keine gibt. */
  aktuell: UnterschriftDaten | null;
  /** Vorschlag für den Text der Schriftunterschrift, in der Regel der eigene Name. */
  name: string;
}

/** Ergebnis: neue Unterschrift, `'entfernen'` oder (Abbrechen) kein Ergebnis. */
export type UnterschriftDialogErgebnis = UnterschriftDaten | 'entfernen';

type Modus = 'schrift' | 'zeichnung';

/**
 * Legt die eigene Unterschrift fest: wahlweise aus einer Schrift erzeugt oder mit Maus, Stift
 * oder Finger gezeichnet. Rein darstellend, gespeichert wird vom Aufrufer.
 */
@Component({
  selector: 'app-unterschrift-dialog',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    UnterschriftAnzeige,
  ],
  templateUrl: './unterschrift-dialog.html',
  styleUrl: './unterschrift-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnterschriftDialog {
  readonly daten = inject<UnterschriftDialogDaten>(MAT_DIALOG_DATA);
  readonly dialogRef =
    inject<MatDialogRef<UnterschriftDialog, UnterschriftDialogErgebnis>>(MatDialogRef);

  readonly SCHRIFTEN = UNTERSCHRIFT_SCHRIFTEN;
  readonly TEXT_MAX = UNTERSCHRIFT_TEXT_MAX;
  readonly BREITE = UNTERSCHRIFT_BREITE;
  readonly HOEHE = UNTERSCHRIFT_HOEHE;

  readonly modus = signal<Modus>(this.daten.aktuell?.art ?? 'schrift');
  readonly text = signal(
    this.daten.aktuell?.art === 'schrift' ? this.daten.aktuell.text : this.daten.name,
  );
  readonly schrift = signal<UnterschriftSchrift>(
    this.daten.aktuell?.art === 'schrift' ? this.daten.aktuell.font : UNTERSCHRIFT_SCHRIFTEN[0],
  );
  readonly striche = signal<UnterschriftPunkt[][]>(
    this.daten.aktuell?.art === 'zeichnung' ? this.daten.aktuell.striche.map((s) => [...s]) : [],
  );

  private readonly zeichenflaeche = viewChild<ElementRef<HTMLCanvasElement>>('zeichenflaeche');
  private aktuellerStrich: UnterschriftPunkt[] | null = null;

  /** Die Unterschrift, die „Speichern“ übernehmen würde, oder `null`, wenn sie noch unvollständig ist. */
  readonly ergebnis = computed<UnterschriftDaten | null>(() => {
    if (this.modus() === 'schrift') {
      const text = this.text().trim();
      return text ? { art: 'schrift', text, font: this.schrift() } : null;
    }
    const striche = this.striche().filter((strich) => strich.length > 0);
    return istZeichnungBrauchbar(striche) ? { art: 'zeichnung', striche } : null;
  });

  constructor() {
    effect(() => {
      const flaeche = this.zeichenflaeche()?.nativeElement;
      const striche = this.striche();
      if (flaeche) zeichneStriche(flaeche, striche);
    });
  }

  schriftWaehlen(font: UnterschriftSchrift): void {
    this.schrift.set(font);
  }

  textAendern(wert: string): void {
    this.text.set(wert.slice(0, UNTERSCHRIFT_TEXT_MAX));
  }

  strichBeginnen(ereignis: PointerEvent): void {
    const flaeche = this.zeichenflaeche()?.nativeElement;
    if (!flaeche || this.striche().length >= UNTERSCHRIFT_STRICHE_MAX) return;
    if (this.punktAnzahl() >= UNTERSCHRIFT_PUNKTE_MAX) return;
    flaeche.setPointerCapture(ereignis.pointerId);
    const strich: UnterschriftPunkt[] = [this.punkt(flaeche, ereignis)];
    this.aktuellerStrich = strich;
    this.striche.update((liste) => [...liste, strich]);
  }

  strichFortsetzen(ereignis: PointerEvent): void {
    const flaeche = this.zeichenflaeche()?.nativeElement;
    const strich = this.aktuellerStrich;
    if (!flaeche || !strich || this.punktAnzahl() >= UNTERSCHRIFT_PUNKTE_MAX) return;
    const punkt = this.punkt(flaeche, ereignis);
    const letzter = strich[strich.length - 1];
    if (letzter && letzter[0] === punkt[0] && letzter[1] === punkt[1]) return;
    strich.push(punkt);
    // Neue Liste, damit der Zeichen-Effekt läuft; der Strich selbst ist dasselbe Objekt.
    this.striche.update((liste) => [...liste]);
  }

  strichBeenden(): void {
    this.aktuellerStrich = null;
  }

  zeichnungLoeschen(): void {
    this.aktuellerStrich = null;
    this.striche.set([]);
  }

  speichern(): void {
    const ergebnis = this.ergebnis();
    if (ergebnis) this.dialogRef.close(ergebnis);
  }

  private punktAnzahl(): number {
    return this.striche().reduce((summe, strich) => summe + strich.length, 0);
  }

  private punkt(flaeche: HTMLCanvasElement, ereignis: PointerEvent): UnterschriftPunkt {
    const rahmen = flaeche.getBoundingClientRect();
    const x = ((ereignis.clientX - rahmen.left) * UNTERSCHRIFT_BREITE) / (rahmen.width || 1);
    const y = ((ereignis.clientY - rahmen.top) * UNTERSCHRIFT_HOEHE) / (rahmen.height || 1);
    return [
      Math.min(UNTERSCHRIFT_BREITE, Math.max(0, Math.round(x))),
      Math.min(UNTERSCHRIFT_HOEHE, Math.max(0, Math.round(y))),
    ];
  }
}

function zeichneStriche(flaeche: HTMLCanvasElement, striche: readonly UnterschriftPunkt[][]): void {
  const kontext = flaeche.getContext('2d');
  if (!kontext) return;
  kontext.clearRect(0, 0, flaeche.width, flaeche.height);
  kontext.lineWidth = 3;
  kontext.lineCap = 'round';
  kontext.lineJoin = 'round';
  kontext.strokeStyle = getComputedStyle(flaeche).color;
  for (const strich of striche) {
    kontext.beginPath();
    strich.forEach(([x, y], index) => (index === 0 ? kontext.moveTo(x, y) : kontext.lineTo(x, y)));
    // Ein einzelner Punkt bleibt als kleiner Punkt sichtbar.
    if (strich.length === 1) kontext.lineTo(strich[0][0] + 0.1, strich[0][1]);
    kontext.stroke();
  }
}
