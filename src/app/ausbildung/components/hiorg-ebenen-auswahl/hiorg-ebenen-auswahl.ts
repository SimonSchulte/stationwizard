import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { HiorgEbene } from '../../services/tages-inhalt';

/** Wie dicht die HiOrg-Termine im Raster stehen: einzeln, gesammelt oder ausgeblendet. */
@Component({
  selector: 'app-hiorg-ebenen-auswahl',
  imports: [MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './hiorg-ebenen-auswahl.html',
  styleUrl: './hiorg-ebenen-auswahl.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HiorgEbenenAuswahl {
  readonly ebene = model.required<HiorgEbene>();

  protected readonly optionen: readonly { wert: HiorgEbene; text: string }[] = [
    { wert: 'einzeln', text: 'Einzeln' },
    { wert: 'gesammelt', text: 'Gesammelt' },
    { wert: 'aus', text: 'Ausgeblendet' },
  ];
}
