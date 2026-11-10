import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import {
  AUFBAU_GRENZEN,
  AufbauEinheit,
  AufbauEintrag,
  AufbauPhase,
} from '../../models/aufbau.model';
import { Artikel, Kiste, Lager } from '../../models/stammdaten.model';
import {
  ABSCHNITT_FARBEN,
  ABSCHNITT_FARBE_BEZEICHNUNG,
  AbschnittFarbe,
} from '../../models/druck.model';
import { AufbauProblem, kisteWeichtAb } from '../../services/aufbau-abgleich';
import { mengeText } from '../../services/aufbau-zettel';
import { fotoVerkleinern } from '../../services/foto-verkleinern';
import { istGueltigeMenge } from '../../services/stammdaten-pruefung';

export interface EinheitAenderung {
  name?: string;
  farbe?: AbschnittFarbe;
  anweisung?: string;
  foto?: string | undefined;
}

export interface EintragAenderung {
  eintragId: string;
  menge?: number;
  anzahl?: number;
  lagerId?: string | null;
  phase?: AufbauPhase | null;
}

interface Zeile {
  eintrag: AufbauEintrag;
  titel: string;
  lagerName: string;
  menge: string;
  weichtAb: boolean;
  problem: boolean;
}

/**
 * Angaben einer gewählten Einheit: Name, Farbe (nur oberste Ebene), Foto, Anweisung und ihr
 * Inhalt (Kisten, lose Artikel, Wagen). Rein darstellend: jede Änderung geht als eigene Ausgabe an
 * die Seite, die sie in den Aufbau einarbeitet.
 */
@Component({
  selector: 'app-einheit-detail',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
  ],
  templateUrl: './einheit-detail.html',
  styleUrl: './einheit-detail.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EinheitDetail {
  readonly einheit = input.required<AufbauEinheit>();
  /** `true` für Fahrzeug und freien Wagen; ein Wagen im Fahrzeug erbt die Farbe. */
  readonly oberste = input(true);
  readonly lager = input.required<readonly Lager[]>();
  readonly artikel = input.required<readonly Artikel[]>();
  readonly kisten = input.required<readonly Kiste[]>();
  readonly probleme = input<readonly AufbauProblem[]>([]);

  readonly geaendert = output<EinheitAenderung>();
  readonly eintragGeaendert = output<EintragAenderung>();
  readonly eintragEntfernt = output<string>();
  readonly kisteHinzugefuegt = output<string>();
  readonly artikelHinzugefuegt = output<{ artikelId: string; menge: number }>();
  readonly kisteAbgeglichen = output<string>();
  readonly entfernt = output<void>();
  readonly fotoFehler = output<string>();

  protected readonly farben = ABSCHNITT_FARBEN;
  protected readonly farbName = ABSCHNITT_FARBE_BEZEICHNUNG;
  protected readonly maxName = AUFBAU_GRENZEN.name;
  protected readonly maxAnweisung = AUFBAU_GRENZEN.anweisung;
  protected readonly fotoLaeuft = signal(false);
  protected readonly neuerArtikelId = signal<string | null>(null);
  protected readonly neueMenge = signal(1);

  protected readonly neueMengeGueltig = computed(
    () => this.neuerArtikelId() !== null && istGueltigeMenge(this.neueMenge()),
  );

  protected readonly zeilen = computed<Zeile[]>(() => {
    const lager = new Map(this.lager().map((l) => [l.id, l.name]));
    const artikel = new Map(this.artikel().map((a) => [a.id, a]));
    const kisten = new Map(this.kisten().map((k) => [k.id, k]));
    const probleme = new Set(
      this.probleme()
        .filter((p) => p.einheitId === this.einheit().id && p.eintragId)
        .map((p) => p.eintragId),
    );
    return this.einheit().inhalt.map((eintrag): Zeile => {
      if (eintrag.art === 'kiste') {
        const stamm = eintrag.kisteId ? kisten.get(eintrag.kisteId) : undefined;
        return {
          eintrag,
          titel: eintrag.name,
          lagerName: eintrag.lagerId ? (lager.get(eintrag.lagerId) ?? '') : '',
          menge: `${eintrag.inhalt.length} Pos.`,
          weichtAb: !!stamm && kisteWeichtAb(eintrag, stamm),
          problem: probleme.has(eintrag.id),
        };
      }
      if (eintrag.art === 'artikel') {
        const stamm = artikel.get(eintrag.artikelId);
        return {
          eintrag,
          titel: stamm?.name ?? 'Unbekannter Artikel',
          lagerName: eintrag.lagerId ? (lager.get(eintrag.lagerId) ?? '') : '',
          menge: mengeText(eintrag.menge, stamm?.einheit ?? '', eintrag.bemerkung),
          weichtAb: false,
          problem: probleme.has(eintrag.id),
        };
      }
      return {
        eintrag,
        titel: `${eintrag.einheit.name} (Wagen)`,
        lagerName: '',
        menge: `${eintrag.einheit.inhalt.length} Einträge`,
        weichtAb: false,
        problem: false,
      };
    });
  });

  protected einheitName(artikelId: string | null): string {
    return this.artikel().find((a) => a.id === artikelId)?.einheit ?? '';
  }

  protected textAus(ereignis: Event): string {
    return (ereignis.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected zahlAus(ereignis: Event): number {
    return Number((ereignis.target as HTMLInputElement).value.replace(',', '.'));
  }

  protected artikelHinzufuegen(): void {
    const artikelId = this.neuerArtikelId();
    if (artikelId === null || !istGueltigeMenge(this.neueMenge())) return;
    this.artikelHinzugefuegt.emit({ artikelId, menge: this.neueMenge() });
    this.neuerArtikelId.set(null);
    this.neueMenge.set(1);
  }

  protected mengeAendern(eintragId: string, wert: number): void {
    if (istGueltigeMenge(wert)) this.eintragGeaendert.emit({ eintragId, menge: wert });
  }

  protected anzahlAendern(eintragId: string, wert: number): void {
    if (Number.isInteger(wert) && wert >= 1 && wert <= AUFBAU_GRENZEN.kistenAnzahl) {
      this.eintragGeaendert.emit({ eintragId, anzahl: wert });
    }
  }

  protected async fotoGewaehlt(ereignis: Event): Promise<void> {
    const feld = ereignis.target as HTMLInputElement;
    const datei = feld.files?.[0];
    feld.value = '';
    if (!datei) return;
    this.fotoLaeuft.set(true);
    try {
      this.geaendert.emit({ foto: await fotoVerkleinern(datei) });
    } catch (fehler) {
      this.fotoFehler.emit(fehler instanceof Error ? fehler.message : 'Das Foto ging nicht.');
    } finally {
      this.fotoLaeuft.set(false);
    }
  }
}
