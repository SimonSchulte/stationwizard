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
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, MeldungsDienst } from '../../../kern/zustand/zustand';
import { ArtikelZuordnung } from '../../components/artikel-zuordnung/artikel-zuordnung';
import { AUFBAU_GRENZEN } from '../../models/aufbau.model';
import { Artikel, Lager } from '../../models/stammdaten.model';
import { AufbauVorlagenStoreService } from '../../services/aufbau-vorlagen-store.service';
import { lagerSchluessel } from '../../services/lager';
import {
  baueAufbauInhalt,
  LagerAufloesung,
  sammleArtikelNamen,
} from '../../services/packliste-aufbau';
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
    ArtikelZuordnung,
    Ladeanzeige,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
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

  /** Gewähltes Lager je gefundenem Lager (Vergleichsform); `''` = neu anlegen. Fehlt der Eintrag, gilt das gleichnamige. */
  private readonly lagerWahl = signal<ReadonlyMap<string, string>>(new Map());
  /** Gewählter Katalogartikel je gefundenem Namen; `null` = frei lassen. Fehlt der Eintrag, gilt der gleichnamige. */
  private readonly artikelWahl = signal<ReadonlyMap<string, string | null>>(new Map());

  /** Lager und Plätze der Liste, mit dem Ziel im Bestand und dem Hinweis, was neu angelegt wird. */
  protected readonly lagerVorschau = computed(() => {
    const plan = this.ergebnis()?.plan;
    if (!plan) return [];
    const nachName = new Map(this.stammdaten.lager().map((l) => [lagerSchluessel(l.name), l]));
    const nachId = new Map(this.stammdaten.lager().map((l) => [l.id, l]));
    const wahl = this.lagerWahl();
    return plan.lager.map((l) => {
      const schluessel = lagerSchluessel(l.name);
      const gewaehlt = wahl.get(schluessel);
      const ziel = gewaehlt === undefined ? nachName.get(schluessel) : nachId.get(gewaehlt);
      const bekannt = new Set((ziel?.plaetze ?? []).map((p) => lagerSchluessel(p.name)));
      return {
        name: l.name,
        schluessel,
        zielId: ziel?.id ?? '',
        neu: !ziel,
        plaetze: l.plaetze.map((p) => ({ name: p, neu: !bekannt.has(lagerSchluessel(p)) })),
      };
    });
  });

  protected readonly lagerOptionen = computed(() =>
    [...this.stammdaten.lager()].sort((a, b) => a.name.localeCompare(b.name, 'de')),
  );

  protected readonly artikelOptionen = computed(() =>
    [...this.stammdaten.artikel()]
      .map((a) => ({ id: a.id, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de')),
  );

  /** Artikelnamen der Liste mit dem zugeordneten Katalogartikel. */
  protected readonly artikelVorschau = computed(() => {
    const plan = this.ergebnis()?.plan;
    if (!plan) return [];
    const wahl = this.artikelWahl();
    return sammleArtikelNamen(plan).map((a) => ({
      ...a,
      artikelId: wahl.has(a.schluessel)
        ? wahl.get(a.schluessel)!
        : (this.stammdaten.artikelFinden(a.name)?.id ?? null),
    }));
  });

  protected readonly zugeordneteArtikel = computed(
    () => this.artikelVorschau().filter((a) => a.artikelId !== null).length,
  );

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

  protected lagerGewaehlt(schluessel: string, zielId: string): void {
    this.lagerWahl.update((alt) => new Map(alt).set(schluessel, zielId));
  }

  protected artikelGewaehlt(schluessel: string, artikelId: string | null): void {
    this.artikelWahl.update((alt) => new Map(alt).set(schluessel, artikelId));
  }

  protected async dateiGewaehlt(ereignis: Event): Promise<void> {
    const feld = ereignis.target as HTMLInputElement;
    const datei = feld.files?.[0];
    feld.value = '';
    if (!datei) return;
    this.liest.set(true);
    this.ergebnis.set(null);
    try {
      this.lagerWahl.set(new Map());
      this.artikelWahl.set(new Map());
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
        const gewaehlt = this.lagerWahl().get(lagerSchluessel(l.name));
        // Ein gewähltes Lager bekommt fehlende Plätze; sonst gilt der Name (gleichnamiges Lager oder neu).
        const zielName = gewaehlt
          ? (this.stammdaten.lager().find((x) => x.id === gewaehlt)?.name ?? l.name)
          : l.name;
        const lager = await this.stammdaten.lagerMitPlaetzenSicherstellen(zielName, l.plaetze);
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
      const artikelNachName = new Map<string, Artikel>();
      for (const a of this.artikelVorschau()) {
        const artikel = a.artikelId ? this.stammdaten.artikelNachId().get(a.artikelId) : undefined;
        if (artikel) artikelNachName.set(a.schluessel, artikel);
      }
      const id = crypto.randomUUID();
      const version = await this.vorlagen.anlegen({
        id,
        titel: this.titel().trim(),
        inhalt: baueAufbauInhalt(ergebnis.plan, aufloesen, (name) =>
          artikelNachName.get(lagerSchluessel(name)),
        ),
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
