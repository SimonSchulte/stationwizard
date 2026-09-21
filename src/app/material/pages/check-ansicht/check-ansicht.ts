import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Checkposition } from '../../models/check.model';
import { HERKUNFT_LABEL } from '../../models/pruefvorlage.model';
import { CheckStoreService } from '../../services/check-store.service';
import { artikelVerfallsstatus, heuteBerlin } from '../../services/check-status';

interface FachAnsicht {
  fachId: string;
  fach: string;
  positionen: Checkposition[];
}

/**
 * Ein abgeschlossener Fahrzeugcheck. Unveränderlich – eine Korrektur ist ein
 * neuer Check, kein Bearbeiten dieses hier.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-check-ansicht',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatToolbarModule],
  templateUrl: './check-ansicht.html',
  styleUrl: './check-ansicht.less',
})
export class CheckAnsicht {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(CheckStoreService);

  readonly check = this.store.geladenerCheck;
  readonly laedt = this.store.checkLaedt;
  readonly fehler = this.store.checkFehler;
  readonly herkunftLabel = HERKUNFT_LABEL;

  /** Standardmäßig nur die Abweichungen: hundert Zeilen „in Ordnung" liest niemand. */
  readonly alleZeigen = signal(false);

  private readonly heute = heuteBerlin();

  private readonly routenId = toSignal(
    this.route.paramMap.pipe(
      map((paramMap) => paramMap.get('id')),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  readonly abweichungen = computed(
    () => this.check()?.positionen.filter((position) => this.istAbweichung(position)) ?? [],
  );

  readonly faecher = computed<FachAnsicht[]>(() => {
    const positionen = this.alleZeigen() ? (this.check()?.positionen ?? []) : this.abweichungen();
    const gruppen = new Map<string, FachAnsicht>();
    for (const position of positionen) {
      const gruppe = gruppen.get(position.fachId);
      if (gruppe) gruppe.positionen.push(position);
      else
        gruppen.set(position.fachId, {
          fachId: position.fachId,
          fach: position.fach,
          positionen: [position],
        });
    }
    return [...gruppen.values()];
  });

  constructor() {
    effect(() => {
      const id = this.routenId();
      if (id === null) return;
      if (this.store.geladenerCheck()?.id !== id) void this.store.checkLaden(id);
    });
  }

  istAbweichung(position: Checkposition): boolean {
    if (position.istMenge < position.sollMenge || position.unbrauchbar || !position.geprueft) {
      return true;
    }
    if (!this.check()?.verfallsdatumErfasst || !position.verfallsdatumPflicht) return false;
    const status = artikelVerfallsstatus(position.verfallsdaten, this.heute);
    return status === 'abgelaufen' || status === 'laeuft-ab';
  }

  befund(position: Checkposition): string {
    const teile: string[] = [];
    if (!position.geprueft) teile.push('nicht geprüft');
    const fehlt = position.sollMenge - position.istMenge;
    if (fehlt > 0) teile.push(`${fehlt} fehlen (${position.istMenge} von ${position.sollMenge})`);
    if (position.unbrauchbar) teile.push('unbrauchbar');
    if (this.check()?.verfallsdatumErfasst && position.verfallsdatumPflicht) {
      const status = artikelVerfallsstatus(position.verfallsdaten, this.heute);
      if (status === 'abgelaufen') teile.push('Verfallsdatum abgelaufen');
      else if (status === 'laeuft-ab') teile.push('Verfallsdatum läuft bald ab');
    }
    return teile.join(' · ');
  }
}
