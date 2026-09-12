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
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { heuteIso, jahrVon } from '../../../kern/kalender/datum';
import { KilometerBilanz } from '../../components/kilometer-bilanz/kilometer-bilanz';
import { WartungenListe } from '../../components/wartungen-liste/wartungen-liste';
import { FahrzeugListe } from '../fahrzeug-liste/fahrzeug-liste';
import { Fahrzeugstamm } from '../../models/fahrzeug.model';
import { hatAbleseLuecke } from '../../services/ablesung-pruefung';
import { EIGENTUEMER_LABEL } from '../../services/eigentuemer-label';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { berechneJahresbilanz, KilometerJahresbilanz } from '../../services/kilometer-soll';
import { ermittleWartungsstatus, Wartungsstatus } from '../../services/wartungsstatus';
import { ApiFahrzeugStorage } from '../../storage/api-fahrzeug-storage';

/** Anzahl der Termine in der kompakten Übersicht; die vollständige Liste steht im eigenen Tab. */
const KOMPAKT_WARTUNGEN_ANZAHL = 5;

interface WartungMitFahrzeug {
  fahrzeug: Fahrzeugstamm;
  status: Wartungsstatus;
}

interface BilanzMitFahrzeug {
  fahrzeug: Fahrzeugstamm;
  bilanz: KilometerJahresbilanz;
  hatAbleseLuecke: boolean;
}

function tageBisFaelligText(tage: number): string {
  if (tage < 0) return `${Math.abs(tage)} Tage überfällig`;
  if (tage === 0) return 'heute fällig';
  return `in ${tage} Tagen fällig`;
}

/**
 * Fuhrpark-Übersicht: nächste Wartungen und Kilometerbilanzen über alle
 * Fahrzeuge. Die Kilometerbilanzen laden je Fahrzeug eine eigene
 * Ablesungshistorie (kein zentraler Endpunkt vorgesehen, siehe
 * docs/konzept-fahrzeuge.md) – bei der erwarteten Fuhrparkgröße
 * unproblematisch. Ein einzelnes fehlgeschlagenes Fahrzeug blockiert nicht
 * die Bilanzen der übrigen.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fahrzeug-dashboard',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatToolbarModule,
    KilometerBilanz,
    WartungenListe,
    FahrzeugListe,
  ],
  templateUrl: './fahrzeug-dashboard.html',
  styleUrl: './fahrzeug-dashboard.less',
})
export class FahrzeugDashboard implements OnInit {
  private readonly store = inject(FahrzeugStoreService);
  private readonly storage = inject(ApiFahrzeugStorage);
  private readonly router = inject(Router);

  readonly EIGENTUEMER_LABEL = EIGENTUEMER_LABEL;
  readonly tageBisFaelligText = tageBisFaelligText;

  readonly fahrzeuge = this.store.fahrzeuge;
  readonly listeLaedt = this.store.listeLaedt;
  readonly listeFehler = this.store.listeFehler;

  private readonly heute = heuteIso();
  readonly jahr = jahrVon(this.heute);

  readonly bilanzen = signal<BilanzMitFahrzeug[]>([]);
  readonly bilanzenLaedt = signal(false);
  readonly bilanzenFehler = signal('');

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

  private async laden(): Promise<void> {
    await this.store.listeLaden();
    await this.ladeBilanzen();
  }

  private async ladeBilanzen(): Promise<void> {
    this.bilanzenLaedt.set(true);
    this.bilanzenFehler.set('');
    try {
      const ergebnisse = await Promise.allSettled(
        this.fahrzeuge().map(async (fahrzeug): Promise<BilanzMitFahrzeug> => {
          const ablesungen = await this.storage.ladeAblesungen(fahrzeug.id);
          const letzte =
            ablesungen.length > 0
              ? ablesungen.reduce((a, b) => (a.abgelesenAm > b.abgelesenAm ? a : b))
              : null;
          return {
            fahrzeug,
            bilanz: berechneJahresbilanz(fahrzeug, ablesungen, this.jahr),
            hatAbleseLuecke: hatAbleseLuecke(letzte, this.heute),
          };
        }),
      );
      const erfolgreiche = ergebnisse
        .filter((r): r is PromiseFulfilledResult<BilanzMitFahrzeug> => r.status === 'fulfilled')
        .map((r) => r.value)
        .sort((a, b) => a.fahrzeug.bezeichnung.localeCompare(b.fahrzeug.bezeichnung));
      if (ergebnisse.some((r) => r.status === 'rejected')) {
        this.bilanzenFehler.set(
          'Für einzelne Fahrzeuge konnte die Kilometerbilanz nicht geladen werden.',
        );
      }
      this.bilanzen.set(erfolgreiche);
    } catch (fehler) {
      this.bilanzenFehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Kilometerbilanzen konnten nicht geladen werden.',
      );
    } finally {
      this.bilanzenLaedt.set(false);
    }
  }

  neuesFahrzeug(): void {
    this.store.neuesFahrzeugBeginnen();
    void this.router.navigate(['/fahrzeuge/neu']);
  }
}
