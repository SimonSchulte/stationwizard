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
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { heuteIso, jahrVon } from '../../../kern/kalender/datum';
import { SystemkonfigurationStoreService } from '../../../systemkonfiguration/services/systemkonfiguration-store.service';
import { KilometerBilanz } from '../kilometer-bilanz/kilometer-bilanz';
import {
  EIGENTUEMER,
  Eigentuemer,
  Fahrzeugstamm,
  Wartungstermin,
} from '../../models/fahrzeug.model';
import { AblesungStoreService } from '../../services/ablesung-store.service';
import { AblesungHinweis, pruefeAblesungPlausibilitaet } from '../../services/ablesung-pruefung';
import { EIGENTUEMER_LABEL } from '../../services/eigentuemer-label';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { GRUPPE_LABEL } from '../../services/gruppe-label';
import { KmBerichtStoreService } from '../../services/km-bericht-store.service';
import {
  berechneJahresbilanz,
  ermittleKilometerAmpel,
  KILOMETER_AMPEL_SCHWELLENWERTE_STANDARD,
  KilometerAmpel,
  restmonateImJahr,
} from '../../services/kilometer-soll';
import {
  ermittleWartungsstatus,
  sortiereOffeneWartungen,
  WartungsAmpel,
  Wartungsstatus,
} from '../../services/wartungsstatus';

/** Vereinheitlicht Kilometer- und Wartungsampel auf dieselbe Dreifarbdarstellung. */
export function ampelKlasse(ampel: KilometerAmpel | WartungsAmpel | null): string {
  switch (ampel) {
    case 'rot':
    case 'ueberfaellig':
      return 'rot';
    case 'gelb':
    case 'warnung':
      return 'gelb';
    case 'gruen':
    case 'ok':
    case 'erledigt':
      return 'gruen';
    default:
      return 'neutral';
  }
}

function tageBisFaelligText(tage: number): string {
  if (tage < 0) return `${Math.abs(tage)} Tage überfällig`;
  if (tage === 0) return 'heute fällig';
  return `in ${tage} Tagen fällig`;
}

interface LeitTermin {
  bezeichnung: string;
  ampel: WartungsAmpel | null;
  text: string;
}

interface ListenEintrag {
  fahrzeug: Fahrzeugstamm;
  kmAmpel: KilometerAmpel | null;
  kmText: string;
  leitTermin: LeitTermin;
}

interface TerminAnzeige {
  status: Wartungsstatus;
  text: string;
}

/**
 * Fuhrpark-Master/Detail: eine Liste aller Fahrzeuge (mit Suche und
 * Eigentümer-Filter) und ein Detailbereich für das gewählte Fahrzeug, ohne
 * Trennung zwischen Kilometer- und Wartungsdaten. Kilometerstände und
 * Wartungstermine lassen sich direkt hier erfassen bzw. als erledigt melden,
 * ohne vorher einen separaten Bearbeiten-Modus zu öffnen – jede Aktion
 * speichert sofort über `FahrzeugStoreService`/`AblesungStoreService`.
 *
 * Nutzt bewusst dieselben Stores wie die Fahrzeugdetailseite (Einzel-Entwurf
 * mit ETag-Konfliktbehandlung): ein Wechsel der Auswahl lädt das gewählte
 * Fahrzeug neu, genau wie ein Routenwechsel auf der Detailseite.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fuhrpark-uebersicht',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    KilometerBilanz,
  ],
  templateUrl: './fuhrpark-uebersicht.html',
  styleUrl: './fuhrpark-uebersicht.less',
})
export class FuhrparkUebersicht implements OnInit {
  private readonly fahrzeugeStore = inject(FahrzeugStoreService);
  private readonly berichtStore = inject(KmBerichtStoreService);
  private readonly konfiguration = inject(SystemkonfigurationStoreService);
  readonly ablesungStore = inject(AblesungStoreService);

  readonly EIGENTUEMER = EIGENTUEMER;
  readonly EIGENTUEMER_LABEL = EIGENTUEMER_LABEL;
  readonly GRUPPE_LABEL = GRUPPE_LABEL;
  readonly ampelKlasse = ampelKlasse;

  readonly ladeLaeuft = this.fahrzeugeStore.ladeLaeuft;
  readonly ladeFehler = this.fahrzeugeStore.ladeFehler;
  readonly speicherFehler = this.fahrzeugeStore.speicherFehler;
  readonly speicherKonflikt = this.fahrzeugeStore.speicherKonflikt;
  readonly speichertGerade = this.fahrzeugeStore.speichertGerade;

  private readonly heute = heuteIso();

  readonly suche = signal('');
  readonly eigentuemerFilter = signal<Eigentuemer | 'alle'>('alle');
  readonly ausgewaehltId = signal<string | null>(null);

  readonly kmDatum = signal(heuteIso());
  readonly kmEingabe = signal('');
  readonly kmBestaetigung = signal<{ wert: number; datum: string } | null>(null);

  readonly neuerTerminBezeichnung = signal('');
  readonly neuerTerminDatum = signal(heuteIso());

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
      const offene = sortiereOffeneWartungen(fahrzeug.wartungstermine, this.heute);
      const leitTermin: LeitTermin =
        offene.length > 0
          ? {
              bezeichnung: offene[0].termin.bezeichnung,
              ampel: offene[0].ampel,
              text: tageBisFaelligText(offene[0].tageBisFaellig),
            }
          : { bezeichnung: 'Keine offenen Termine', ampel: null, text: '' };
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

  readonly ausgewaehltesFahrzeug = computed(() => this.fahrzeugeStore.entwurf());

  readonly ausgewaehlteBilanz = computed(() => {
    const entwurf = this.ausgewaehltesFahrzeug();
    if (!entwurf) return null;
    return berechneJahresbilanz(entwurf, this.ablesungStore.ablesungen(), jahrVon(this.heute));
  });

  readonly ausgewaehlteAmpel = computed<KilometerAmpel | null>(() => {
    const bilanz = this.ausgewaehlteBilanz();
    if (!bilanz) return null;
    return ermittleKilometerAmpel(bilanz, this.restMonate(), this.ampelSchwellenwerte());
  });

  readonly ausgewaehlteTermine = computed<TerminAnzeige[]>(() => {
    const entwurf = this.ausgewaehltesFahrzeug();
    if (!entwurf) return [];
    return [...entwurf.wartungstermine]
      .map((termin) => {
        const status = ermittleWartungsstatus(termin, this.heute);
        return { status, text: tageBisFaelligText(status.tageBisFaellig) };
      })
      .sort((a, b) => a.status.tageBisFaellig - b.status.tageBisFaellig);
  });

  readonly kmEingabeZahl = computed<number | null>(() => {
    const wert = Number(this.kmEingabe());
    return this.kmEingabe().trim() !== '' && Number.isFinite(wert) && wert >= 0 ? wert : null;
  });

  readonly kmHinweis = computed<AblesungHinweis>(() => {
    const wert = this.kmEingabeZahl();
    if (wert === null) return null;
    const letzte = this.ablesungStore.letzteAblesung();
    return pruefeAblesungPlausibilitaet(wert, letzte ? { stand: letzte.stand } : null);
  });

  constructor() {
    // Hält die Auswahl gültig, wenn Suche/Filter sie aus der Liste werfen –
    // fällt dann auf das erste passende Fahrzeug zurück statt leerzulaufen.
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

    effect(() => {
      const id = this.ausgewaehltId();
      untracked(() => this.formularZuruecksetzen());
      if (!id) return;
      void this.fahrzeugeStore.fahrzeugLaden(id);
      void this.ablesungStore.laden(id);
    });
  }

  ngOnInit(): void {
    void this.berichtStore.berichtLaden();
    void this.konfiguration.laden();
  }

  auswaehlen(id: string): void {
    this.ausgewaehltId.set(id);
  }

  private formularZuruecksetzen(): void {
    this.kmDatum.set(heuteIso());
    this.kmEingabe.set('');
    this.kmBestaetigung.set(null);
    this.neuerTerminBezeichnung.set('');
    this.neuerTerminDatum.set(heuteIso());
  }

  async kmErfassen(): Promise<void> {
    const id = this.ausgewaehltId();
    const stand = this.kmEingabeZahl();
    if (!id || stand === null) return;
    const datum = this.kmDatum();
    const erfolg = await this.ablesungStore.erfassen({
      fahrzeugId: id,
      abgelesenAm: datum,
      stand,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    if (erfolg) {
      this.kmBestaetigung.set({ wert: stand, datum });
      this.kmEingabe.set('');
      this.kmDatum.set(heuteIso());
      // Der Ampelstand in der Liste kommt aus dem Fuhrpark-Bericht (ein
      // Aufruf über alle Fahrzeuge) und muss nach der eigenen Schreibung neu
      // geladen werden, sonst zeigt die Liste die gerade erfasste Ablesung nicht.
      void this.berichtStore.berichtLaden();
    }
  }

  async terminAlsErledigtMelden(terminId: string): Promise<void> {
    const liste = this.fahrzeugeStore.entwurf()?.wartungstermine ?? [];
    this.fahrzeugeStore.wartungstermineAktualisieren(
      liste.map((termin) =>
        termin.id === terminId ? { ...termin, erledigtAm: heuteIso() } : termin,
      ),
    );
    await this.fahrzeugeStore.speichern();
  }

  async neuerTerminHinzufuegen(): Promise<void> {
    const bezeichnung = this.neuerTerminBezeichnung().trim();
    if (!bezeichnung) return;
    const liste = this.fahrzeugeStore.entwurf()?.wartungstermine ?? [];
    const termin: Wartungstermin = {
      id: crypto.randomUUID(),
      art: 'frei',
      bezeichnung,
      faelligAm: this.neuerTerminDatum(),
      erinnerungTage: 30,
      erledigtAm: null,
    };
    this.fahrzeugeStore.wartungstermineAktualisieren([...liste, termin]);
    const erfolg = await this.fahrzeugeStore.speichern();
    if (erfolg) {
      this.neuerTerminBezeichnung.set('');
      this.neuerTerminDatum.set(heuteIso());
    }
  }

  async nachKonfliktNeuLaden(): Promise<void> {
    const id = this.ausgewaehltId();
    if (id) await this.fahrzeugeStore.neuLadenNachKonflikt(id);
  }
}
