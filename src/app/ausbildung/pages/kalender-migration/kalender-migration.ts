import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { WorkerFehler } from '../../../kern/worker-client';
import { Arbeitsmappe } from '../../models/plan.model';
import { KalenderDatenService } from '../../services/kalender-daten.service';
import { PlanStore } from '../../services/plan-store';
import { ApiKalenderStorage } from '../../storage/api-kalender-storage';
import { KalenderBereitsBefuelltFehler } from '../../storage/kalender-storage';

/** Zustand der Kalender-Datenbank, wie ihn die Übernahme vorfindet. */
export type DatenbankBefund = 'pruefen' | 'leer' | 'befuellt' | 'nicht-eingerichtet' | 'fehler';

/** Obergrenze des Workers für die Migrationsanfrage (`MIGRATION_KOERPER_GRENZE`). */
const MIGRATION_GRENZE = 2 * 1024 * 1024;

/**
 * Einmalige Übernahme der bisherigen Excel-Arbeitsmappe in die Kalender-Datenbank.
 *
 * Die Datei wird im Browser mit demselben Leser wie bisher (`excel-lesen.ts`)
 * gelesen und als Vorschau gezeigt; übertragen wird sie in **einer** Anfrage,
 * die der Worker vollständig oder gar nicht schreibt. Ist die Datenbank nicht
 * mehr leer, lehnt der Worker ab (409) – ein zweiter Klick kann keinen
 * gepflegten Stand überschreiben. Die Seite hängt im Verwaltungsbereich, die
 * Fachlogik bleibt im Kalendermodul.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kalender-migration',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, MatToolbarModule],
  templateUrl: './kalender-migration.html',
  styleUrl: './kalender-migration.less',
})
export class KalenderMigration {
  private readonly storage = inject(ApiKalenderStorage);
  private readonly kalender = inject(KalenderDatenService);
  private readonly store = inject(PlanStore);
  private readonly dialogDienst = inject(DialogDienst);

  readonly befund = signal<DatenbankBefund>('pruefen');
  readonly dateiname = signal('');
  readonly liestEin = signal(false);
  readonly fehler = signal('');
  readonly arbeitsmappe = signal<Arbeitsmappe | null>(null);
  readonly meldungen = signal<string[]>([]);
  readonly uebertraegt = signal(false);
  readonly erledigt = signal(false);

  readonly vorschau = computed(() => {
    const mappe = this.arbeitsmappe();
    if (!mappe) return null;
    const jahre = [...mappe.jahre]
      .sort((a, b) => a.jahr - b.jahr)
      .map((blatt) => ({
        jahr: blatt.jahr,
        titel: blatt.titel,
        termine: blatt.termine.length,
        mitThema: blatt.termine.filter((t) => t.thema.trim()).length,
        katsThemen: blatt.katsThemen.length,
      }));
    return {
      jahre,
      ideen: mappe.backlog.length,
      termineGesamt: jahre.reduce((summe, j) => summe + j.termine, 0),
    };
  });

  readonly kannUebernehmen = computed(
    () =>
      this.befund() === 'leer' &&
      this.arbeitsmappe() !== null &&
      (this.vorschau()?.jahre.length ?? 0) > 0 &&
      !this.uebertraegt() &&
      !this.erledigt(),
  );

  constructor() {
    void this.pruefeDatenbank();
  }

  /** Ein Lesezugriff: ist die Datenbank erreichbar und noch leer? */
  async pruefeDatenbank(): Promise<void> {
    this.befund.set('pruefen');
    try {
      const stand = await this.storage.laden();
      this.befund.set(stand.jahre.length || stand.ideen ? 'befuellt' : 'leer');
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 503) {
        this.befund.set('nicht-eingerichtet');
        return;
      }
      this.befund.set('fehler');
      this.fehler.set(fehlertext(ursache));
    }
  }

  async dateiGewaehlt(ereignis: Event): Promise<void> {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    eingabe.value = '';
    if (!datei) return;
    this.dateiname.set(datei.name);
    this.fehler.set('');
    this.arbeitsmappe.set(null);
    this.meldungen.set([]);
    this.liestEin.set(true);
    try {
      const daten = await datei.arrayBuffer();
      const { leseArbeitsmappe } = await import('../../services/excel-lesen');
      const { arbeitsmappe, meldungen } = leseArbeitsmappe(daten);
      if (!arbeitsmappe.jahre.length) {
        this.fehler.set(
          'In der Datei wurde kein Jahresblatt gefunden. Erwartet wird die bisherige ' +
            'Arbeitsmappe mit Jahresblättern, „Offene Ideen“ und „KatS-A-Plan“.',
        );
        return;
      }
      this.arbeitsmappe.set(arbeitsmappe);
      this.meldungen.set(meldungen);
    } catch {
      this.fehler.set('Die Datei konnte nicht als Excel-Arbeitsmappe gelesen werden.');
    } finally {
      this.liestEin.set(false);
    }
  }

  async uebernehmen(): Promise<void> {
    const mappe = this.arbeitsmappe();
    const vorschau = this.vorschau();
    if (!mappe || !vorschau || !this.kannUebernehmen()) return;
    if (JSON.stringify({ jahre: mappe.jahre, ideen: mappe.backlog }).length > MIGRATION_GRENZE) {
      this.fehler.set('Die Arbeitsmappe ist für eine Übernahme in einem Schritt zu groß.');
      return;
    }
    const verwerfen = this.store.ungespeichert()
      ? ' Ungespeicherte Änderungen im geöffneten Kalender werden dabei verworfen.'
      : '';
    const bestaetigt = await this.dialogDienst.bestaetigen(
      `${vorschau.jahre.length} Jahr(e) mit ${vorschau.termineGesamt} Einträgen und ` +
        `${vorschau.ideen} offene Idee(n) werden in die Datenbank übernommen. Das geht nur ` +
        `einmal; danach ist die Datenbank die führende Quelle.${verwerfen}`,
      'Excel in die Datenbank übernehmen',
      'Übernehmen',
    );
    if (!bestaetigt) return;
    this.uebertraegt.set(true);
    this.fehler.set('');
    try {
      const stand = await this.storage.migriere(mappe);
      this.kalender.uebernimm(stand);
      this.erledigt.set(true);
      this.befund.set('befuellt');
    } catch (ursache) {
      if (ursache instanceof KalenderBereitsBefuelltFehler) {
        this.befund.set('befuellt');
      }
      this.fehler.set(fehlertext(ursache));
    } finally {
      this.uebertraegt.set(false);
    }
  }
}

function fehlertext(ursache: unknown): string {
  return ursache instanceof Error ? ursache.message : String(ursache);
}
