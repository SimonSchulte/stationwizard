import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatListModule } from '@angular/material/list';
import { heuteIso } from '../../../kern/kalender/datum';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
import { SystemkonfigurationStoreService } from '../../../systemkonfiguration/services/systemkonfiguration-store.service';
import { EIGENTUEMER, Eigentuemer, Fahrzeugstamm } from '../../models/fahrzeug.model';
import {
  ampelKlasse,
  ermittleLeitTermin,
  LeitTermin,
  tageBisFaelligText,
} from '../../services/ampel-anzeige';
import { EIGENTUEMER_LABEL } from '../../services/eigentuemer-label';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { GRUPPE_LABEL } from '../../services/gruppe-label';
import { KmBerichtStoreService } from '../../services/km-bericht-store.service';
import {
  ermittleKilometerAmpel,
  KILOMETER_AMPEL_SCHWELLENWERTE_STANDARD,
  KilometerAmpel,
  restmonateImJahr,
} from '../../services/kilometer-soll';
import { sortiereOffeneWartungen } from '../../services/wartungsstatus';
import { AmpelChip } from '../ampel-chip/ampel-chip';

interface ListenEintrag {
  fahrzeug: Fahrzeugstamm;
  kmAmpel: KilometerAmpel | null;
  kmText: string;
  leitTermin: LeitTermin;
}

/** Wie viele offene Termine die Vorschau zeigt; alle weiteren stehen in der Akte. */
const TERMINE_IN_VORSCHAU = 3;

/**
 * Fuhrpark-Übersicht: eine Liste aller Fahrzeuge (mit Suche und Eigentümer-Filter) und rechts eine
 * lesende Vorschau des gewählten Fahrzeugs. Bearbeitet wird ausschließlich in der Fahrzeugakte
 * (`/fahrzeuge/:id`); die Vorschau hat deshalb keine eigenen Formulare mehr.
 *
 * Alles, was sie zeigt, kommt aus der Fahrzeugliste und dem Fuhrpark-Bericht (je ein Aufruf über
 * alle Fahrzeuge). Ein Wechsel der Auswahl löst keine eigene Anfrage aus.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fuhrpark-uebersicht',
  imports: [
    AmpelChip,
    Leerzustand,
    MatButtonModule,
    MatButtonToggleModule,
    MatListModule,
    RouterLink,
    Suchfeld,
  ],
  templateUrl: './fuhrpark-uebersicht.html',
  styleUrl: './fuhrpark-uebersicht.less',
})
export class FuhrparkUebersicht implements OnInit {
  private readonly fahrzeugeStore = inject(FahrzeugStoreService);
  private readonly berichtStore = inject(KmBerichtStoreService);
  private readonly konfiguration = inject(SystemkonfigurationStoreService);

  readonly EIGENTUEMER = EIGENTUEMER;
  readonly EIGENTUEMER_LABEL = EIGENTUEMER_LABEL;
  readonly GRUPPE_LABEL = GRUPPE_LABEL;
  readonly ampelKlasse = ampelKlasse;

  private readonly heute = heuteIso();

  readonly suche = signal('');
  readonly eigentuemerFilter = signal<Eigentuemer | 'alle'>('alle');
  readonly ausgewaehltId = signal<string | null>(null);

  private readonly ampelSchwellenwerte = computed(() => {
    const einstellungen = this.konfiguration.gespeicherteEinstellungen();
    return einstellungen
      ? {
          gelbMonate: einstellungen.kmAmpelSchwellenwertGelbMonate,
          rotMonate: einstellungen.kmAmpelSchwellenwertRotMonate,
        }
      : KILOMETER_AMPEL_SCHWELLENWERTE_STANDARD;
  });

  private readonly restMonate = computed(() => {
    const bericht = this.berichtStore.bericht();
    return bericht ? restmonateImJahr(bericht.stichtag, bericht.jahr) : 0;
  });

  private readonly eintraege = computed<ListenEintrag[]>(() => {
    const bericht = this.berichtStore.bericht();
    const schwellenwerte = this.ampelSchwellenwerte();
    const restMonate = this.restMonate();
    return this.fahrzeugeStore.fahrzeuge().map((fahrzeug) => {
      const zeile = bericht?.zeilen.find((z) => z.id === fahrzeug.id) ?? null;
      const kmAmpel = zeile ? ermittleKilometerAmpel(zeile, restMonate, schwellenwerte) : null;
      const kmText =
        !zeile || zeile.sollKm === 0
          ? 'keine Vorgabe'
          : zeile.istKm === null
            ? 'kein Stand bekannt'
            : (zeile.restKm ?? 0) <= 0
              ? 'Jahressoll erreicht'
              : `${zeile.restKm} km offen`;
      const leitTermin = ermittleLeitTermin(fahrzeug.wartungstermine, this.heute);
      return { fahrzeug, kmAmpel, kmText, leitTermin };
    });
  });

  readonly gesamtAnzahl = computed(() => this.fahrzeugeStore.fahrzeuge().length);

  readonly gefiltert = computed<ListenEintrag[]>(() => {
    const suchtext = this.suche().trim().toLowerCase();
    const filter = this.eigentuemerFilter();
    return this.eintraege()
      .filter((e) => filter === 'alle' || e.fahrzeug.eigentuemer === filter)
      .filter(
        (e) =>
          !suchtext ||
          e.fahrzeug.bezeichnung.toLowerCase().includes(suchtext) ||
          e.fahrzeug.funkrufname.toLowerCase().includes(suchtext) ||
          e.fahrzeug.kennzeichen.toLowerCase().includes(suchtext),
      )
      .sort((a, b) => a.fahrzeug.bezeichnung.localeCompare(b.fahrzeug.bezeichnung));
  });

  readonly ausgewaehlt = computed(
    () => this.gefiltert().find((e) => e.fahrzeug.id === this.ausgewaehltId()) ?? null,
  );

  readonly naechsteTermine = computed(() =>
    sortiereOffeneWartungen(this.ausgewaehlt()?.fahrzeug.wartungstermine ?? [], this.heute)
      .slice(0, TERMINE_IN_VORSCHAU)
      .map((status) => ({ status, text: tageBisFaelligText(status.tageBisFaellig) })),
  );

  constructor() {
    // Hält die Auswahl gültig, wenn Suche/Filter sie aus der Liste werfen: fällt dann auf das
    // erste passende Fahrzeug zurück statt leerzulaufen.
    effect(() => {
      const liste = this.gefiltert();
      const aktuelle = untracked(() => this.ausgewaehltId());
      if (liste.length === 0) {
        if (aktuelle !== null) this.ausgewaehltId.set(null);
        return;
      }
      if (!liste.some((e) => e.fahrzeug.id === aktuelle)) {
        this.ausgewaehltId.set(liste[0].fahrzeug.id);
      }
    });
  }

  ngOnInit(): void {
    void this.berichtStore.berichtLaden();
    void this.konfiguration.laden();
  }

  auswaehlen(id: string): void {
    this.ausgewaehltId.set(id);
  }
}
