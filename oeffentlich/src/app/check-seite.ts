import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Checkstand } from '../../../src/app/material/models/check.model';
import { PruefArtikel, PruefFach } from '../../../src/app/material/models/pruefvorlage.model';
import {
  artikelVerfallsstatus,
  fachStand,
  fortschritt,
  heuteBerlin,
  leererStand,
  verfallsdatumStatus,
} from '../../../src/app/material/services/check-status';
import { checkTokenAusPfad } from './pfad';
import { leseGemerktenNamen, merkeNamen } from './gemerkter-name';
import { leseCheckEntwurf, merkeCheckEntwurf, vergissCheckEntwurf } from './gemerkter-check';
import {
  ladeBehaelter,
  sendeCheck,
  type CheckQuittung,
  type OeffentlicherBehaelter,
} from './check-api';

type Zustand = 'laedt' | 'formular' | 'sendet' | 'gesendet' | 'unbekannt';

const NAME_MIN = 2;
const NAME_MAX = 60;
const BEMERKUNG_MAX = 200;
const ENTPRELLUNG_MS = 2000;

/**
 * Der öffentliche Fahrzeugcheck in einer Komponente.
 *
 * Sie kennt genau einen Behälter – den aus dem Token im Pfad – und bietet
 * keinen Weg in die App: kein Router, keine Navigation, kein Link. Die
 * Bedienlogik entspricht der angemeldeten Prüfseite, ist aber eigenständig
 * ohne Angular Material umgesetzt; geteilt wird nur die reine Statuslogik aus
 * `src/app/material/services/check-status.ts`.
 *
 * Bewusst ohne Datumsfeld: den Prüftag setzt der Server als Berliner
 * Kalendertag. Bewusst auch ohne den letzten Stand oder frühere Checks – die
 * kennt diese Seite nicht und darf sie nicht kennen.
 */
@Component({
  selector: 'oeff-check',
  templateUrl: './check-seite.html',
  // Kein `styleUrl`: die Stile stehen global in `oeffentlich/src/styles.less`,
  // damit die Content-Security-Policy ohne `unsafe-inline` auskommt.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckSeite {
  readonly zustand = signal<Zustand>('laedt');
  readonly behaelter = signal<OeffentlicherBehaelter | null>(null);
  readonly stand = signal<Checkstand | null>(null);
  readonly fehler = signal('');
  readonly quittung = signal<CheckQuittung | null>(null);

  readonly name = signal('');
  readonly bemerkung = signal('');
  readonly entwurfGefundenAm = signal<string | null>(null);
  readonly offeneFaecher = signal<ReadonlySet<string>>(new Set());

  /** Für Tests: erfüllt, sobald der erste Ladevorgang abgeschlossen ist. */
  readonly bereit: Promise<void>;

  private readonly token = checkTokenAusPfad(location.pathname);
  private readonly heute = heuteBerlin();
  private entpreller: ReturnType<typeof setTimeout> | null = null;

  readonly faecher = computed<PruefFach[]>(() => this.behaelter()?.vorlage.faecher ?? []);

  readonly kennzahlen = computed(() => {
    const stand = this.stand();
    if (!stand) return null;
    return fortschritt(stand, this.faecher(), this.heute);
  });

  readonly nameGueltig = computed(() => {
    const laenge = this.name().trim().length;
    return laenge >= NAME_MIN && laenge <= NAME_MAX;
  });

  readonly absendbar = computed(() => this.nameGueltig() && (this.kennzahlen()?.geprueft ?? 0) > 0);

  readonly verfallstext = computed(() => {
    const k = this.kennzahlen();
    if (!k) return '';
    if (k.abgelaufen > 0) return `${k.abgelaufen} abgelaufen`;
    if (k.laeuftAb > 0) return `${k.laeuftAb} bald fällig`;
    if (k.verfallsdatenErfasst === 0) return 'Verfallsdaten offen';
    if (k.verfallsdatenErfasst < k.verfallsdatenGesamt) {
      return `${k.verfallsdatenErfasst} von ${k.verfallsdatenGesamt} Verfallsdaten`;
    }
    return 'Verfallsdaten ohne Befund';
  });

  readonly verfallsstufe = computed(() => {
    const k = this.kennzahlen();
    if (!k) return 'offen';
    if (k.abgelaufen > 0) return 'abgelaufen';
    if (k.laeuftAb > 0) return 'warnung';
    return k.verfallsdatenErfasst < k.verfallsdatenGesamt ? 'offen' : 'ok';
  });

  constructor() {
    this.name.set(leseGemerktenNamen());
    this.bereit = this.laden();
  }

  private async laden(): Promise<void> {
    if (this.token === null) {
      this.zustand.set('unbekannt');
      return;
    }
    try {
      const behaelter = await ladeBehaelter(this.token);
      this.behaelter.set(behaelter);
      const entwurf = leseCheckEntwurf(this.token);
      if (entwurf && this.passt(entwurf.stand, behaelter.vorlage.faecher)) {
        this.stand.set(entwurf.stand);
        this.bemerkung.set(entwurf.stand.bemerkung);
        this.entwurfGefundenAm.set(entwurf.gespeichertAm);
      } else {
        // Ein Entwurf, der nicht mehr zur Liste passt, wird verworfen statt
        // halb übernommen – sonst fehlten oder blieben Positionen übrig.
        if (entwurf) vergissCheckEntwurf(this.token);
        this.stand.set(leererStand('oeffentlich', behaelter.vorlage.faecher));
      }
      this.zustand.set('formular');
    } catch {
      this.zustand.set('unbekannt');
    }
  }

  private passt(stand: Checkstand, faecher: readonly PruefFach[]): boolean {
    const artikel = faecher.flatMap((fach) => fach.artikel);
    if (Object.keys(stand.positionen).length !== artikel.length) return false;
    return artikel.every((eintrag) => {
      const position = stand.positionen[eintrag.id];
      return Boolean(position && position.verfallsdaten.length === eintrag.sollMenge);
    });
  }

  fachOffen(fachId: string): boolean {
    return this.offeneFaecher().has(fachId);
  }

  fachUmschalten(fachId: string): void {
    const naechste = new Set(this.offeneFaecher());
    if (naechste.has(fachId)) naechste.delete(fachId);
    else naechste.add(fachId);
    this.offeneFaecher.set(naechste);
  }

  fachZusammenfassung(fach: PruefFach): string {
    const stand = this.stand();
    if (!stand) return '';
    const werte = fachStand(stand, fach, this.heute);
    const teile = [`${werte.geprueft}/${werte.gesamt}`];
    if (werte.unvollstaendig > 0) teile.push(`${werte.unvollstaendig} zu melden`);
    if (werte.verfallshinweise > 0) teile.push(`${werte.verfallshinweise} Datum`);
    return teile.join(' · ');
  }

  position(artikelId: string) {
    return this.stand()?.positionen[artikelId] ?? null;
  }

  einheit(artikel: PruefArtikel): string {
    const wert = artikel.einheit.trim();
    return wert === '' ? 'Stück' : wert;
  }

  fehlmenge(artikel: PruefArtikel): number {
    const fehlt = artikel.sollMenge - (this.position(artikel.id)?.istMenge ?? 0);
    return fehlt > 0 ? fehlt : 0;
  }

  zeigtVerfallsdaten(artikel: PruefArtikel): boolean {
    return (this.stand()?.verfallsdatumErfasst ?? false) && artikel.verfallsdatumPflicht;
  }

  verfallsstatusVon(artikelId: string): string {
    const position = this.position(artikelId);
    return position ? artikelVerfallsstatus(position.verfallsdaten, this.heute) : 'keines';
  }

  statusEinesStuecks(artikelId: string, index: number): string {
    return verfallsdatumStatus(this.position(artikelId)?.verfallsdaten[index] ?? null, this.heute);
  }

  private aendere(artikelId: string, aenderung: Partial<Checkstand['positionen'][string]>): void {
    const stand = this.stand();
    const vorher = stand?.positionen[artikelId];
    if (!stand || !vorher) return;
    this.stand.set({
      ...stand,
      positionen: { ...stand.positionen, [artikelId]: { ...vorher, ...aenderung } },
    });
    this.sichere();
  }

  umschalten(artikelId: string): void {
    const position = this.position(artikelId);
    if (position) this.aendere(artikelId, { geprueft: !position.geprueft });
  }

  mengeAendern(artikelId: string, wert: number): void {
    if (!Number.isInteger(wert) || wert < 0) return;
    this.aendere(artikelId, { istMenge: wert });
  }

  mengeEingeben(artikelId: string, wert: string): void {
    const zahl = Number.parseInt(wert, 10);
    // Eine unlesbare Eingabe bleibt unbeachtet, statt still auf null zu fallen.
    if (Number.isInteger(zahl)) this.mengeAendern(artikelId, zahl);
  }

  unbrauchbarUmschalten(artikelId: string): void {
    const position = this.position(artikelId);
    if (position) this.aendere(artikelId, { unbrauchbar: !position.unbrauchbar });
  }

  /** Bei mehreren Stück wird standardmäßig ein gemeinsames Datum erfasst. */
  verfallsdatumFuerAlle(artikelId: string, monat: string): void {
    const position = this.position(artikelId);
    if (!position) return;
    this.aendere(artikelId, {
      verfallsdaten: position.verfallsdaten.map(() => (monat === '' ? null : monat)),
    });
  }

  verfallsdatumEinzeln(artikelId: string, index: number, monat: string): void {
    const position = this.position(artikelId);
    if (!position || index < 0 || index >= position.verfallsdaten.length) return;
    const verfallsdaten = [...position.verfallsdaten];
    verfallsdaten[index] = monat === '' ? null : monat;
    this.aendere(artikelId, { verfallsdaten });
  }

  gemeinsamesDatum(artikelId: string): string {
    const daten = this.position(artikelId)?.verfallsdaten ?? [];
    const erstes = daten[0] ?? '';
    return daten.every((datum) => (datum ?? '') === erstes) ? erstes : '';
  }

  readonly einzeln = signal<ReadonlySet<string>>(new Set());

  einzelnUmschalten(artikelId: string): void {
    const naechste = new Set(this.einzeln());
    if (naechste.has(artikelId)) naechste.delete(artikelId);
    else naechste.add(artikelId);
    this.einzeln.set(naechste);
  }

  bemerkungSetzen(wert: string): void {
    const gekuerzt = wert.slice(0, BEMERKUNG_MAX);
    this.bemerkung.set(gekuerzt);
    const stand = this.stand();
    if (stand) {
      this.stand.set({ ...stand, bemerkung: gekuerzt });
      this.sichere();
    }
  }

  entwurfVerwerfen(): void {
    const behaelter = this.behaelter();
    if (!behaelter || this.token === null) return;
    vergissCheckEntwurf(this.token);
    this.entwurfGefundenAm.set(null);
    this.bemerkung.set('');
    this.stand.set(leererStand('oeffentlich', behaelter.vorlage.faecher));
  }

  private sichere(): void {
    const stand = this.stand();
    if (!stand || this.token === null) return;
    if (this.entpreller !== null) clearTimeout(this.entpreller);
    const token = this.token;
    this.entpreller = setTimeout(() => merkeCheckEntwurf(token, stand), ENTPRELLUNG_MS);
  }

  async absenden(): Promise<void> {
    const stand = this.stand();
    if (!stand || this.token === null || !this.absendbar()) return;
    this.zustand.set('sendet');
    this.fehler.set('');
    try {
      const quittung = await sendeCheck(this.token, {
        name: this.name().trim(),
        bemerkung: this.bemerkung().trim(),
        verfallsdatumErfasst: stand.verfallsdatumErfasst,
        positionen: Object.values(stand.positionen),
      });
      merkeNamen(this.name().trim());
      if (this.entpreller !== null) clearTimeout(this.entpreller);
      vergissCheckEntwurf(this.token);
      this.quittung.set(quittung);
      this.zustand.set('gesendet');
    } catch (ursache) {
      this.fehler.set(
        ursache instanceof Error ? ursache.message : 'Die Meldung konnte nicht gesendet werden.',
      );
      this.zustand.set('formular');
    }
  }
}
