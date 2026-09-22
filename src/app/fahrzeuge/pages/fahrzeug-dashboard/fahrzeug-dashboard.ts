import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { formatiereDatum, heuteIso, jahrVon } from '../../../kern/kalender/datum';
import { SystemkonfigurationStoreService } from '../../../systemkonfiguration/services/systemkonfiguration-store.service';
import { KilometerBilanz } from '../../components/kilometer-bilanz/kilometer-bilanz';
import { WartungenListe } from '../../components/wartungen-liste/wartungen-liste';
import { FahrzeugListe } from '../fahrzeug-liste/fahrzeug-liste';
import { KilometerUebersicht } from '../kilometer-uebersicht/kilometer-uebersicht';
import { Eigentuemer, Fahrzeugstamm } from '../../models/fahrzeug.model';
import { hatAbleseLueckeNachTagen } from '../../services/ablesung-pruefung';
import { EIGENTUEMER_LABEL } from '../../services/eigentuemer-label';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { KmBerichtStoreService } from '../../services/km-bericht-store.service';
import {
  ermittleKilometerAmpel,
  KILOMETER_AMPEL_SCHWELLENWERTE_STANDARD,
  KilometerAmpel,
  KilometerJahresbilanz,
  restmonateImJahr,
} from '../../services/kilometer-soll';
import { ermittleWartungsstatus, Wartungsstatus } from '../../services/wartungsstatus';

/** Anzahl der Termine in der kompakten Übersicht; die vollständige Liste steht im eigenen Tab. */
const KOMPAKT_WARTUNGEN_ANZAHL = 5;

interface WartungMitFahrzeug {
  fahrzeug: Fahrzeugstamm;
  status: Wartungsstatus;
}

/** Eine Kilometerkarte der Übersicht, aufbereitet aus einer Berichtszeile. */
interface BilanzKarte {
  /** Fahrzeug-UUID für Verlinkung und `track`. */
  id: string;
  bezeichnung: string;
  kennzeichen: string;
  eigentuemer: Eigentuemer;
  bilanz: KilometerJahresbilanz;
  ampel: KilometerAmpel | null;
  hatAbleseLuecke: boolean;
  /** ISO-Datum der letzten Ablesung, oder `null` ohne jede Ablesung. */
  letzteAblesungAm: string | null;
}

function tageBisFaelligText(tage: number): string {
  if (tage < 0) return `${Math.abs(tage)} Tage überfällig`;
  if (tage === 0) return 'heute fällig';
  return `in ${tage} Tagen fällig`;
}

/**
 * Fuhrpark-Übersicht: nächste Wartungen und Kilometerbilanzen über alle
 * Fahrzeuge.
 *
 * Die Kilometerbilanzen kommen aus dem Kilometerstandsbericht
 * (`GET /api/fahrzeuge/km-bericht`) – ein Aufruf für den gesamten Fuhrpark
 * statt einer Ablesungshistorie je Fahrzeug. Das war ursprünglich anders
 * gelöst, weil es beim Entwurf noch keinen Endpunkt über alle Fahrzeuge gab;
 * seit AP-S1 gibt es ihn, und die Übersicht kostete sonst bei jedem Aufruf so
 * viele Worker-Anfragen und D1-Abfragen, wie der Fuhrpark Fahrzeuge hat.
 *
 * Nebeneffekt: die Zahlen sind jetzt dieselben, die auch im versendeten
 * Bericht und auf der Fahrzeugdetailseite stehen – korrigierte Ablesungen
 * zählen nicht mehr doppelt, was die frühere Fassung hier übersah.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fahrzeug-dashboard',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatTabsModule,
    MatToolbarModule,
    KilometerBilanz,
    WartungenListe,
    FahrzeugListe,
    KilometerUebersicht,
  ],
  templateUrl: './fahrzeug-dashboard.html',
  styleUrl: './fahrzeug-dashboard.less',
})
export class FahrzeugDashboard implements OnInit {
  private readonly store = inject(FahrzeugStoreService);
  private readonly berichtStore = inject(KmBerichtStoreService);
  private readonly konfiguration = inject(SystemkonfigurationStoreService);
  private readonly router = inject(Router);

  readonly EIGENTUEMER_LABEL = EIGENTUEMER_LABEL;
  readonly tageBisFaelligText = tageBisFaelligText;
  readonly formatiereDatum = formatiereDatum;

  readonly fahrzeuge = this.store.fahrzeuge;
  readonly listeLaedt = this.store.listeLaedt;
  readonly listeFehler = this.store.listeFehler;

  private readonly heute = heuteIso();

  /** Bezugsjahr des Berichts (Berliner Stichtag), bis dahin das lokale Jahr. */
  readonly jahr = computed(() => this.berichtStore.bericht()?.jahr ?? jahrVon(this.heute));

  readonly bilanzenLaedt = this.berichtStore.laedt;
  readonly bilanzenFehler = this.berichtStore.ladeFehler;

  /**
   * Standardmäßig nur Fahrzeuge mit vorgeschriebener Laufleistung
   * (`sollKm > 0`); Fahrzeuge der Organisation haben keine Vorgabe und damit
   * auch keine Ampel, sie würden die Übersicht nur unnötig füllen.
   */
  readonly alleFahrzeugeAnzeigen = signal(false);

  private readonly ampelSchwellenwerte = computed(() => {
    const einstellungen = this.konfiguration.gespeicherteEinstellungen();
    return einstellungen
      ? {
          gelbMonate: einstellungen.kmAmpelSchwellenwertGelbMonate,
          rotMonate: einstellungen.kmAmpelSchwellenwertRotMonate,
        }
      : KILOMETER_AMPEL_SCHWELLENWERTE_STANDARD;
  });

  readonly bilanzen = computed<BilanzKarte[]>(() => {
    const bericht = this.berichtStore.bericht();
    if (!bericht) return [];
    const schwellenwerte = this.ampelSchwellenwerte();
    const restMonate = restmonateImJahr(bericht.stichtag, bericht.jahr);
    return (
      bericht.zeilen
        .filter((zeile) => this.alleFahrzeugeAnzeigen() || zeile.sollKm > 0)
        .map((zeile) => {
          const bilanz: KilometerJahresbilanz = {
            jahr: bericht.jahr,
            eigentuemer: zeile.eigentuemer,
            sollKm: zeile.sollKm,
            istKm: zeile.istKm,
            restKm: zeile.restKm,
            unvollstaendig: zeile.unvollstaendig,
          };
          return {
            id: zeile.id,
            bezeichnung: zeile.bezeichnung,
            kennzeichen: zeile.kennzeichen,
            eigentuemer: zeile.eigentuemer,
            bilanz,
            ampel: ermittleKilometerAmpel(bilanz, restMonate, schwellenwerte),
            hatAbleseLuecke: hatAbleseLueckeNachTagen(zeile.tageSeitAblesung),
            letzteAblesungAm: zeile.abgelesenAm,
          };
        })
        // Der Bericht sortiert in SQL, hier soll die deutsche Sortierung gelten.
        .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung))
    );
  });

  readonly offeneWartungen = computed<WartungMitFahrzeug[]>(() => {
    const eintraege: WartungMitFahrzeug[] = [];
    for (const fahrzeug of this.fahrzeuge()) {
      for (const termin of fahrzeug.wartungstermine) {
        if (termin.erledigtAm !== null) continue;
        eintraege.push({ fahrzeug, status: ermittleWartungsstatus(termin, this.heute) });
      }
    }
    return eintraege.sort((a, b) => a.status.tageBisFaellig - b.status.tageBisFaellig);
  });

  /** Für die Übersichtskarte: nur die dringendsten Termine, Rest steht im Tab „Liste Wartungen". */
  readonly naechsteWartungenKompakt = computed(() =>
    this.offeneWartungen().slice(0, KOMPAKT_WARTUNGEN_ANZAHL),
  );

  readonly ausgewaehlterTab = signal(0);

  alleWartungenAnzeigen(): void {
    this.ausgewaehlterTab.set(2);
  }

  ngOnInit(): void {
    void this.laden();
  }

  /** Fahrzeugliste, Bericht und Ampel-Schwellenwerte hängen nicht voneinander ab – parallel abrufen. */
  private async laden(): Promise<void> {
    await Promise.all([
      this.store.listeLaden(),
      this.berichtStore.berichtLaden(),
      this.konfiguration.laden(),
    ]);
  }

  neuesFahrzeug(): void {
    this.store.neuesFahrzeugBeginnen();
    void this.router.navigate(['/fahrzeuge/neu']);
  }
}
