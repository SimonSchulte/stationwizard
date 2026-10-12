import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EhrungenService, type StundenAenderung } from '../../../services/ehrungen.service';

export interface VerlaufDaten {
  id: string;
  name: string;
}

/**
 * Änderungsprotokoll der Stundenzahlen einer Person: wer wann welche Zahl aus dem Import oder
 * als manuellen Nachtrag geändert hat. Das Protokoll schreibt allein der Worker.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ehrungen-verlauf',
  imports: [MatDialogModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './ehrungen-verlauf.html',
  styleUrl: './ehrungen-verlauf.less',
})
export class EhrungenVerlauf implements OnInit {
  private readonly dienst = inject(EhrungenService);
  readonly daten = inject<VerlaufDaten>(MAT_DIALOG_DATA);

  readonly laedt = signal(true);
  readonly fehler = signal('');
  readonly eintraege = signal<StundenAenderung[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      this.eintraege.set(await this.dienst.verlaufLaden(this.daten.id));
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Das Protokoll konnte nicht geladen werden.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  zeit(zeitpunkt: string): string {
    const datum = new Date(zeitpunkt);
    return Number.isNaN(datum.getTime())
      ? zeitpunkt
      : datum.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  }

  zahl(wert: number | null): string {
    return wert === null
      ? '–'
      : wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
