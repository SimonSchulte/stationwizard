import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, MeldungsDienst } from '../../../kern/zustand/zustand';
import { AUFBAU_GRENZEN } from '../../models/aufbau.model';
import { Lager } from '../../models/stammdaten.model';
import { AufbauVorlagenStoreService } from '../../services/aufbau-vorlagen-store.service';
import { lagerSchluessel } from '../../services/lager';
import { baueAufbauInhalt, LagerAufloesung } from '../../services/packliste-aufbau';
import { PacklisteLeser } from '../../services/packliste-excel';
import { leitePacklisteAb, PacklisteErgebnis } from '../../services/packliste-import';
import { StammdatenStoreService } from '../../services/stammdaten-store.service';

/**
 * Einmalige Übernahme einer Excel-Packliste als Aufbau-Vorlage (`/verwaltung/packliste-import`). Die Datei wird im
 * Browser gelesen, die Vorschau nennt Zahlen und Warnungen. Beim Anlegen entstehen fehlende Lager und Plätze in den
 * Stammdaten (Artikelkatalog und Kisten-Stammdaten bleiben unberührt, der Aufbau trägt freie Artikel und Kisten)
 * und eine neue Aufbau-Vorlage; vorhandene Lager werden wiederverwendet. Rechte vorerst alle, Rollen später.
 */
@Component({
  selector: 'app-packliste-import',
  imports: [
    Ladeanzeige,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    Seitenkopf,
  ],
  templateUrl: './packliste-import.html',
  styleUrl: './packliste-import.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PacklisteImport implements OnInit {
  private readonly stammdaten = inject(StammdatenStoreService);
  private readonly vorlagen = inject(AufbauVorlagenStoreService);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly router = inject(Router);
  private readonly leser = inject(PacklisteLeser);

  protected readonly dateiname = signal('');
  protected readonly ergebnis = signal<PacklisteErgebnis | null>(null);
  protected readonly titel = signal('Packliste');
  protected readonly liest = signal(false);
  protected readonly arbeitet = signal(false);
  protected readonly maxTitel = AUFBAU_GRENZEN.name;

  /** Lager und Plätze der Liste, mit dem Hinweis, was neu angelegt wird. */
  protected readonly lagerVorschau = computed(() => {
    const plan = this.ergebnis()?.plan;
    if (!plan) return [];
    const vorhanden = new Map(this.stammdaten.lager().map((l) => [lagerSchluessel(l.name), l]));
    return plan.lager.map((l) => {
      const bestehend = vorhanden.get(lagerSchluessel(l.name));
      const bekannt = new Set((bestehend?.plaetze ?? []).map((p) => lagerSchluessel(p.name)));
      return {
        name: l.name,
        neu: !bestehend,
        plaetze: l.plaetze.map((p) => ({ name: p, neu: !bekannt.has(lagerSchluessel(p)) })),
      };
    });
  });

  protected readonly kannAnlegen = computed(
    () =>
      this.ergebnis() !== null &&
      this.titel().trim() !== '' &&
      !this.arbeitet() &&
      !this.stammdaten.laedt(),
  );

  ngOnInit(): void {
    void this.stammdaten.laden();
  }

  protected titelGeaendert(ereignis: Event): void {
    this.titel.set((ereignis.target as HTMLInputElement).value);
  }

  protected async dateiGewaehlt(ereignis: Event): Promise<void> {
    const feld = ereignis.target as HTMLInputElement;
    const datei = feld.files?.[0];
    feld.value = '';
    if (!datei) return;
    this.liest.set(true);
    this.ergebnis.set(null);
    try {
      this.ergebnis.set(leitePacklisteAb(await this.leser.lesen(datei)));
      this.dateiname.set(datei.name);
      this.titel.set(datei.name.replace(/\.[^.]+$/, '').slice(0, AUFBAU_GRENZEN.name));
    } catch (fehler) {
      this.dateiname.set('');
      this.meldungen.fehler(
        fehler instanceof Error ? fehler.message : 'Die Datei konnte nicht gelesen werden.',
      );
    } finally {
      this.liest.set(false);
    }
  }

  protected async anlegen(): Promise<void> {
    const ergebnis = this.ergebnis();
    if (!ergebnis || !this.kannAnlegen()) return;
    this.arbeitet.set(true);
    try {
      await this.stammdaten.laden();
      const lagerNachName = new Map<string, Lager>();
      for (const l of ergebnis.plan.lager) {
        const lager = await this.stammdaten.lagerMitPlaetzenSicherstellen(l.name, l.plaetze);
        if (!lager) {
          this.meldungen.fehler(
            this.stammdaten.fehler() || `Das Lager „${l.name}“ konnte nicht angelegt werden.`,
          );
          return;
        }
        lagerNachName.set(lagerSchluessel(l.name), lager);
      }
      const aufloesen: LagerAufloesung = (lagerName, platzName) => {
        const lager = lagerName ? lagerNachName.get(lagerSchluessel(lagerName)) : undefined;
        const platz =
          lager && platzName
            ? lager.plaetze.find((p) => lagerSchluessel(p.name) === lagerSchluessel(platzName))
            : undefined;
        return { lagerId: lager?.id ?? null, platzId: platz?.id ?? null };
      };
      const id = crypto.randomUUID();
      const version = await this.vorlagen.anlegen({
        id,
        titel: this.titel().trim(),
        inhalt: baueAufbauInhalt(ergebnis.plan, aufloesen),
      });
      if (version === null) {
        this.meldungen.fehler(
          this.vorlagen.fehler() || 'Die Vorlage konnte nicht angelegt werden.',
        );
        return;
      }
      this.meldungen.erfolg('Die Aufbau-Vorlage wurde angelegt.');
      await this.router.navigate(['/einsatzplanung/aufbau-vorlagen', id]);
    } finally {
      this.arbeitet.set(false);
    }
  }
}
