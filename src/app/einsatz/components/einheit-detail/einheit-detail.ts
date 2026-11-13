import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AUFBAU_GRENZEN,
  AufbauEinheit,
  AufbauEintrag,
  AufbauKistenPosition,
  AufbauPhase,
} from '../../models/aufbau.model';
import { Artikel, Kiste, Lager, Platz } from '../../models/stammdaten.model';
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

export interface KistePositionNeu {
  eintragId: string;
  position: AufbauKistenPosition;
}

export interface KistePositionAenderung {
  eintragId: string;
  index: number;
  menge: number;
}

export interface KistePositionEntfernung {
  eintragId: string;
  index: number;
}

export interface EintragAenderung {
  eintragId: string;
  /** Neuer Name einer Kiste im Aufbau (die Stammdaten bleiben unberührt). */
  name?: string;
  menge?: number;
  anzahl?: number;
  lagerId?: string | null;
  /** Platz im Lager; ein Lagerwechsel ohne Angabe entfernt den Platz. */
  platzId?: string | null;
  phase?: AufbauPhase | null;
  /** Standard-Kiste an- oder abschalten (nur bei leerem Inhalt wirksam). */
  standardInhalt?: boolean;
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
 * Angaben einer gewählten Einheit: Name, Farbe, Foto, Anweisung und ihr
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
    MatTooltipModule,
  ],
  templateUrl: './einheit-detail.html',
  styleUrl: './einheit-detail.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EinheitDetail {
  readonly einheit = input.required<AufbauEinheit>();
  readonly lager = input.required<readonly Lager[]>();
  readonly artikel = input.required<readonly Artikel[]>();
  readonly kisten = input.required<readonly Kiste[]>();
  readonly probleme = input<readonly AufbauProblem[]>([]);

  readonly geaendert = output<EinheitAenderung>();
  readonly eintragGeaendert = output<EintragAenderung>();
  readonly eintragEntfernt = output<string>();
  readonly kisteHinzugefuegt = output<string>();
  readonly artikelHinzugefuegt = output<{ artikelId: string; menge: number }>();
  readonly freierArtikelHinzugefuegt = output<{
    name: string;
    einheit: string;
    menge: number;
    lagerId: string | null;
  }>();
  readonly freieKisteHinzugefuegt = output<{ name: string; anzahl: number }>();
  readonly kistePositionHinzugefuegt = output<KistePositionNeu>();
  readonly kistePositionGeaendert = output<KistePositionAenderung>();
  readonly kistePositionEntfernt = output<KistePositionEntfernung>();
  /** Ein freier Artikel (Eintrag-Id) soll in den Katalog übernommen werden. */
  readonly freierArtikelUebernommen = output<string>();
  /** Eine freie Kistenposition soll in den Katalog übernommen werden. */
  readonly freiePositionUebernommen = output<KistePositionEntfernung>();
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
  protected readonly freierName = signal('');
  protected readonly freieEinheit = signal('');
  protected readonly freieMenge = signal(1);
  protected readonly freiesLager = signal<string | null>(null);
  protected readonly kistenName = signal('');
  /** Kiste, deren Inhalt gerade aufgeklappt ist. */
  protected readonly offeneKiste = signal<string | null>(null);
  protected readonly posName = signal('');
  protected readonly posEinheit = signal('');
  protected readonly posMenge = signal(1);
  protected readonly posArtikelId = signal<string | null>(null);
  protected readonly posFreiGueltig = computed(
    () => this.posName().trim().length > 0 && istGueltigeMenge(this.posMenge()),
  );
  protected readonly posKatalogGueltig = computed(
    () => this.posArtikelId() !== null && istGueltigeMenge(this.posMenge()),
  );
  protected readonly maxEinheit = AUFBAU_GRENZEN.einheit;
  protected readonly freierArtikelGueltig = computed(
    () => this.freierName().trim().length > 0 && istGueltigeMenge(this.freieMenge()),
  );
  protected readonly freieKisteGueltig = computed(() => this.kistenName().trim().length > 0);

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
      if (eintrag.art === 'frei') {
        return {
          eintrag,
          titel: eintrag.name,
          lagerName: eintrag.lagerId ? (lager.get(eintrag.lagerId) ?? '') : '',
          menge: mengeText(eintrag.menge, eintrag.einheit, eintrag.bemerkung),
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

  protected kisteUmbenennen(eintragId: string, ereignis: Event): void {
    const feld = ereignis.target as HTMLInputElement;
    const name = feld.value.trim().replace(/\s+/g, ' ');
    const aktuell = this.einheit().inhalt.find((x) => x.id === eintragId);
    if (name === '' || aktuell?.art !== 'kiste') {
      // Leerer Name gilt nicht: das Feld zeigt wieder den gespeicherten.
      if (aktuell?.art === 'kiste') feld.value = aktuell.name;
      return;
    }
    if (name !== aktuell.name) this.eintragGeaendert.emit({ eintragId, name });
  }

  /** Plätze des Lagers eines Eintrags (leer ohne Lager oder ohne gepflegte Plätze). */
  protected plaetzeVon(lagerId: string | null): readonly Platz[] {
    return this.lager().find((l) => l.id === lagerId)?.plaetze ?? [];
  }

  protected kisteUmschalten(eintragId: string): void {
    this.offeneKiste.update((id) => (id === eintragId ? null : eintragId));
  }

  protected positionsName(p: AufbauKistenPosition): string {
    return p.artikelId === null
      ? p.name
      : (this.artikel().find((a) => a.id === p.artikelId)?.name ?? 'Unbekannter Artikel');
  }

  protected positionsEinheit(p: AufbauKistenPosition): string {
    return p.artikelId === null
      ? p.einheit
      : (this.artikel().find((a) => a.id === p.artikelId)?.einheit ?? '');
  }

  protected positionFrei(eintragId: string): void {
    if (!this.posFreiGueltig()) return;
    this.kistePositionHinzugefuegt.emit({
      eintragId,
      position: {
        artikelId: null,
        name: this.posName().trim(),
        einheit: this.posEinheit().trim(),
        menge: this.posMenge(),
        bemerkung: '',
      },
    });
    this.posName.set('');
    this.posMenge.set(1);
  }

  protected positionKatalog(eintragId: string): void {
    const artikelId = this.posArtikelId();
    if (artikelId === null || !this.posKatalogGueltig()) return;
    this.kistePositionHinzugefuegt.emit({
      eintragId,
      position: { artikelId, menge: this.posMenge(), bemerkung: '' },
    });
    this.posArtikelId.set(null);
    this.posMenge.set(1);
  }

  protected positionMenge(eintragId: string, index: number, menge: number): void {
    if (istGueltigeMenge(menge)) this.kistePositionGeaendert.emit({ eintragId, index, menge });
  }

  protected freienArtikelHinzufuegen(): void {
    if (!this.freierArtikelGueltig()) return;
    this.freierArtikelHinzugefuegt.emit({
      name: this.freierName().trim(),
      einheit: this.freieEinheit().trim(),
      menge: this.freieMenge(),
      lagerId: this.freiesLager(),
    });
    this.freierName.set('');
    this.freieMenge.set(1);
  }

  protected freieKisteHinzufuegen(): void {
    if (!this.freieKisteGueltig()) return;
    this.freieKisteHinzugefuegt.emit({ name: this.kistenName().trim(), anzahl: 1 });
    this.kistenName.set('');
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
