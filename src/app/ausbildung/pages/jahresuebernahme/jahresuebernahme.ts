import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink } from '@angular/router';
import { KATEGORIE_FARBEN } from '../../data/kategorien';
import { KalenderDatenService } from '../../services/kalender-daten.service';
import {
  berechneUebernahme,
  vorhandeneIdeen,
  vorhandeneKatsThemen,
} from '../../services/jahresuebernahme';

/**
 * Übernahme von Offenen Ideen und KatS-Ausbildungsplan-Themen aus einem Jahr in
 * ein anderes. Jedes Jahr hat seine eigene Ideensammlung und seinen eigenen
 * KatS-Plan; ein neues Jahr beginnt leer. Hier wird bewusst entschieden, was
 * weiterlaufen soll – übernommen werden Kopien, das Quelljahr bleibt unverändert.
 *
 * Die Seite ändert nur den Arbeitsstand des Kalenders (mit Rückgängig); in der
 * Datenbank steht das Ergebnis erst nach „Speichern“ im Kalender.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-jahresuebernahme',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  templateUrl: './jahresuebernahme.html',
  styleUrl: './jahresuebernahme.less',
})
export class Jahresuebernahme {
  private readonly kalender = inject(KalenderDatenService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly zustand = this.kalender.zustand;
  readonly jahre = this.kalender.verfuegbareJahre;
  readonly kategorieFarben = KATEGORIE_FARBEN;
  readonly laedt = signal(false);
  readonly fehler = signal('');

  /** Quelle: ein Jahr vor dem Ziel, sonst das jüngste andere Jahr. */
  readonly quellJahr = linkedSignal<number[], number | null>({
    source: () => this.jahre(),
    computation: (jahre, vorher) => {
      if (vorher?.value != null && jahre.includes(vorher.value)) return vorher.value;
      return jahre.length > 1 ? jahre[jahre.length - 2] : null;
    },
  });
  readonly zielJahr = linkedSignal<number[], number | null>({
    source: () => this.jahre(),
    computation: (jahre, vorher) => {
      if (vorher?.value != null && jahre.includes(vorher.value)) return vorher.value;
      return jahre.length > 1 ? jahre[jahre.length - 1] : null;
    },
  });

  readonly quelle = computed(() => {
    const jahr = this.quellJahr();
    return jahr === null ? undefined : this.kalender.blatt(jahr);
  });
  readonly ziel = computed(() => {
    const jahr = this.zielJahr();
    return jahr === null ? undefined : this.kalender.blatt(jahr);
  });

  /** Gleiches Jahr als Quelle und Ziel ergäbe nur Dubletten. */
  readonly gleichesJahr = computed(
    () => this.quellJahr() !== null && this.quellJahr() === this.zielJahr(),
  );

  private readonly schonImZiel = computed(() => {
    const quelle = this.quelle();
    const ziel = this.ziel();
    if (!quelle || !ziel || this.gleichesJahr()) {
      return { ideen: new Set<string>(), themen: new Set<string>() };
    }
    return { ideen: vorhandeneIdeen(quelle, ziel), themen: vorhandeneKatsThemen(quelle, ziel) };
  });

  /** Vorbelegt ist alles, was das Zieljahr noch nicht hat; ein Wechsel der Jahre setzt neu. */
  readonly ideenAuswahl = linkedSignal<ReadonlySet<string>>(
    () =>
      new Set(
        (this.quelle()?.ideen ?? [])
          .filter((i) => !this.schonImZiel().ideen.has(i.id))
          .map((i) => i.id),
      ),
  );
  readonly themenAuswahl = linkedSignal<ReadonlySet<string>>(
    () =>
      new Set(
        (this.quelle()?.katsThemen ?? [])
          .filter((t) => !this.schonImZiel().themen.has(t.id))
          .map((t) => t.id),
      ),
  );

  readonly ideen = computed(() =>
    (this.quelle()?.ideen ?? []).map((idee) => ({
      idee,
      vorhanden: this.schonImZiel().ideen.has(idee.id),
    })),
  );
  readonly themen = computed(() =>
    (this.quelle()?.katsThemen ?? []).map((thema) => ({
      thema,
      vorhanden: this.schonImZiel().themen.has(thema.id),
    })),
  );

  readonly anzahlAusgewaehlt = computed(() => this.ideenAuswahl().size + this.themenAuswahl().size);
  readonly kannUebernehmen = computed(
    () =>
      this.zustand() === 'verbunden' &&
      !this.gleichesJahr() &&
      this.ziel() !== undefined &&
      this.anzahlAusgewaehlt() > 0,
  );

  constructor() {
    // Direktaufruf der Adresse: erst den Kalender laden, sonst gäbe es keine Jahre.
    if (this.zustand() !== 'verbunden' && !this.kalender.beschaeftigt()) {
      void this.laden();
    }
  }

  private async laden(): Promise<void> {
    this.laedt.set(true);
    try {
      await this.kalender.laden();
    } catch (ursache) {
      if (this.zustand() !== 'nicht-eingerichtet') {
        this.fehler.set(ursache instanceof Error ? ursache.message : String(ursache));
      }
    } finally {
      this.laedt.set(false);
    }
  }

  schalteIdee(id: string, an: boolean): void {
    this.ideenAuswahl.update((auswahl) => umgeschaltet(auswahl, id, an));
  }

  schalteThema(id: string, an: boolean): void {
    this.themenAuswahl.update((auswahl) => umgeschaltet(auswahl, id, an));
  }

  alleIdeen(an: boolean): void {
    this.ideenAuswahl.set(new Set(an ? this.ideen().map((z) => z.idee.id) : []));
  }

  alleThemen(an: boolean): void {
    this.themenAuswahl.set(new Set(an ? this.themen().map((z) => z.thema.id) : []));
  }

  uebernehmen(): void {
    const quelle = this.quelle();
    const ziel = this.ziel();
    if (!quelle || !ziel || !this.kannUebernehmen()) return;
    const ergebnis = berechneUebernahme(quelle, ziel, {
      ideenIds: this.ideenAuswahl(),
      katsThemaIds: this.themenAuswahl(),
    });
    try {
      this.kalender.uebernehmeInJahr(ziel.jahr, ergebnis.ideen, ergebnis.katsThemen);
    } catch (ursache) {
      this.fehler.set(ursache instanceof Error ? ursache.message : String(ursache));
      return;
    }
    this.snackBar.open(
      `${ergebnis.ideen.length} Idee(n) und ${ergebnis.katsThemen.length} KatS-Thema/-Themen ` +
        `nach ${ziel.jahr} übernommen. Zum Sichern im Kalender „Speichern“ wählen.`,
      'OK',
      { duration: 10000 },
    );
    void this.router.navigateByUrl('/kalender');
  }
}

function umgeschaltet(auswahl: ReadonlySet<string>, id: string, an: boolean): Set<string> {
  const neu = new Set(auswahl);
  if (an) neu.add(id);
  else neu.delete(id);
  return neu;
}
