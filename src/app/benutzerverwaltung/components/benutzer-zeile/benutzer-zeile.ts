import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { anzeigenameAusEmail } from '../../../kern/text/anzeigename';
import {
  Benutzerkonto,
  HAUPTROLLEN,
  HAUPTROLLE_LABEL,
  Hauptrolle,
  SONDERROLLEN,
  SONDERROLLE_LABEL,
  Sonderrolle,
} from '../../models/benutzerkonto.model';

function gleicheSonderrollen(a: readonly Sonderrolle[], b: readonly Sonderrolle[]): boolean {
  if (a.length !== b.length) return false;
  const sortiertB = [...b].sort();
  return [...a].sort().every((eintrag, index) => eintrag === sortiertB[index]);
}

/**
 * Eine Zeile der Benutzerverwaltung mit eigenem Entwurf: Rollenauswahl und
 * Sonderrollen-Checkboxen ändern zunächst nur diesen lokalen Entwurf, nicht
 * `konto()`. Erst der „Übernehmen"-Klick meldet die Änderung nach oben; ein
 * erfolgreicher Speichervorgang aktualisiert `konto()` von außen, worauf der
 * Entwurf sich wieder daran ausrichtet.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-benutzer-zeile',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
  ],
  templateUrl: './benutzer-zeile.html',
  styleUrl: './benutzer-zeile.less',
})
export class BenutzerZeile {
  readonly konto = input.required<Benutzerkonto>();
  readonly speichert = input(false);

  /** Kein echter Benutzername vorhanden – aus der E-Mail-Adresse abgeleitet, wie im übrigen Shell-Header. */
  readonly anzeigename = computed(() => anzeigenameAusEmail(this.konto().email));

  readonly uebernehmen = output<{ rolle: Hauptrolle | null; sonderrollen: Sonderrolle[] }>();

  readonly HAUPTROLLEN = HAUPTROLLEN;
  readonly HAUPTROLLE_LABEL = HAUPTROLLE_LABEL;
  readonly SONDERROLLEN = SONDERROLLEN;
  readonly SONDERROLLE_LABEL = SONDERROLLE_LABEL;

  readonly entwurfRolle = signal<Hauptrolle | null>(null);
  readonly entwurfSonderrollen = signal<Sonderrolle[]>([]);

  readonly hatAenderung = computed(
    () =>
      this.entwurfRolle() !== this.konto().rolle ||
      !gleicheSonderrollen(this.entwurfSonderrollen(), this.konto().sonderrollen),
  );

  constructor() {
    effect(() => {
      const konto = this.konto();
      this.entwurfRolle.set(konto.rolle);
      this.entwurfSonderrollen.set([...konto.sonderrollen]);
    });
  }

  hauptrolleAendern(neueRolle: Hauptrolle | ''): void {
    this.entwurfRolle.set(neueRolle === '' ? null : neueRolle);
  }

  sonderrolleUmschalten(sonderrolle: Sonderrolle, gesetzt: boolean): void {
    this.entwurfSonderrollen.update((liste) =>
      gesetzt ? [...liste, sonderrolle] : liste.filter((eintrag) => eintrag !== sonderrolle),
    );
  }

  uebernehmenKlick(): void {
    this.uebernehmen.emit({
      rolle: this.entwurfRolle(),
      sonderrollen: this.entwurfSonderrollen(),
    });
  }
}
