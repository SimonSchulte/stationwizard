import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Leerzustand, MeldungsDienst } from '../../../kern/zustand/zustand';
import { AbschnittFarbpunkt } from '../../components/abschnitt-farbpunkt/abschnitt-farbpunkt';
import { FachgruppeChip } from '../../components/fachgruppe-chip/fachgruppe-chip';
import { Fachgruppe } from '../../../kern/fachgruppen/fachgruppe';
import { AbschnittFarbe, VbPosition, VbVorlage } from '../../models/vb.model';
import { laufzettelNummern } from '../../services/laufzettel-platz';
import { VbDruckDienst } from '../../services/vb-druck';
import { VbVorlagenStoreService } from '../../services/vb-vorlagen-store.service';
import { MitVersion } from '../../storage/mit-version';

interface LaufzettelZeile {
  id: string;
  nr: number;
  material: string;
  lagerort: string;
  transportMit: string;
  auftraggeber: string;
}

interface AbschnittAnsicht {
  id: string;
  titel: string;
  farbe: AbschnittFarbe;
  fachgruppe: Fachgruppe | null;
  zeilen: LaufzettelZeile[];
}

/** Kurztext einer Packliste: „2× Propanflaschen, Löffel aus Kunststoff“. */
export function materialKurztext(positionen: readonly VbPosition[]): string {
  return positionen
    .map((p) => (p.anzahl.trim() ? `${p.anzahl.trim()}× ${p.material}` : p.material))
    .join(', ');
}

/**
 * VB-Vorlagen: links die Liste, rechts die Ansicht der gewählten Vorlage (Mock 3). Die
 * Vorlage wird erst beim Auswählen und ungepuffert geladen, weil ihre Version für das spätere
 * `If-Match` beim Löschen gebraucht wird. Bearbeitet wird im VB-Editor.
 */
@Component({
  selector: 'app-vb-vorlagen',
  imports: [
    RouterLink,
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatTableModule,
    Seitenkopf,
    Leerzustand,
    Ladeanzeige,
    AbschnittFarbpunkt,
    FachgruppeChip,
  ],
  templateUrl: './vb-vorlagen.html',
  styleUrl: './vb-vorlagen.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VbVorlagen implements OnInit {
  private readonly store = inject(VbVorlagenStoreService);
  private readonly dialog = inject(DialogDienst);
  private readonly druck = inject(VbDruckDienst);
  private readonly meldungen = inject(MeldungsDienst);

  readonly vorlagen = this.store.vorlagen;
  readonly listeLaedt = this.store.laedt;
  readonly spalten = ['nr', 'material', 'lagerort', 'transportMit', 'auftraggeber'];

  readonly gewaehlteId = signal<string | null>(null);
  readonly stand = signal<MitVersion<VbVorlage> | null>(null);
  readonly ansichtLaedt = signal(false);
  readonly arbeitet = signal(false);

  readonly abschnitte = computed<AbschnittAnsicht[]>(() => {
    const vorlage = this.stand()?.daten;
    if (!vorlage) return [];
    const nummern = laufzettelNummern(vorlage.inhalt);
    return vorlage.inhalt.abschnitte.map((abschnitt) => ({
      id: abschnitt.id,
      titel: abschnitt.titel,
      farbe: abschnitt.farbe,
      fachgruppe: abschnitt.fachgruppe,
      zeilen: abschnitt.laufzettel.map((laufzettel) => ({
        id: laufzettel.id,
        nr: nummern.get(laufzettel.id) ?? 0,
        material: materialKurztext(laufzettel.positionen),
        lagerort: laufzettel.lagerort,
        transportMit: laufzettel.transportMit,
        auftraggeber: laufzettel.auftraggeber,
      })),
    }));
  });

  ngOnInit(): void {
    void this.store.laden();
  }

  async waehlen(id: string): Promise<void> {
    this.gewaehlteId.set(id);
    this.stand.set(null);
    this.ansichtLaedt.set(true);
    const geladen = await this.store.vorlageLaden(id);
    // Eine inzwischen andere Auswahl behält ihren Stand.
    if (this.gewaehlteId() !== id) return;
    this.ansichtLaedt.set(false);
    if (geladen) this.stand.set(geladen);
    else this.meldungen.fehler(this.store.fehler() || 'Die Vorlage konnte nicht geladen werden.');
  }

  async drucken(): Promise<void> {
    const vorlage = this.stand()?.daten;
    if (!vorlage || this.arbeitet()) return;
    this.arbeitet.set(true);
    try {
      await this.druck.drucken(
        { titel: vorlage.titel, beginn: null, ende: null, ort: null },
        vorlage.inhalt,
      );
    } catch {
      this.meldungen.fehler('Der Druck konnte nicht erstellt werden. Bitte erneut versuchen.');
    } finally {
      this.arbeitet.set(false);
    }
  }

  async loeschen(): Promise<void> {
    const aktuell = this.stand();
    if (!aktuell || this.arbeitet()) return;
    const { id, titel } = aktuell.daten;
    const bestaetigt = await this.dialog.bestaetigen(
      `„${titel}“ wird endgültig gelöscht. Bereits aus dieser Vorlage angelegte Vorbereitungen ` +
        'bleiben unverändert erhalten, weil sie eine eigene Kopie tragen.',
      'VB-Vorlage löschen',
      'Endgültig löschen',
    );
    if (!bestaetigt) return;
    this.arbeitet.set(true);
    try {
      if (await this.store.loeschen(id, aktuell.version)) {
        if (this.gewaehlteId() === id) {
          this.gewaehlteId.set(null);
          this.stand.set(null);
        }
        this.meldungen.erfolg(`„${titel}“ wurde gelöscht.`);
      } else if (this.store.konflikt()) {
        this.meldungen.fehler(
          'Die Vorlage wurde inzwischen geändert und nicht gelöscht. Bitte erneut öffnen und prüfen.',
        );
        await this.waehlen(id);
      } else {
        this.meldungen.fehler(this.store.fehler() || 'Die Vorlage konnte nicht gelöscht werden.');
      }
    } finally {
      this.arbeitet.set(false);
    }
  }
}
