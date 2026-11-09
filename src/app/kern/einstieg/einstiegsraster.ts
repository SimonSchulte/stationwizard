import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Zweispaltiges Raster (mobil einspaltig) für `app-einstiegskarte`. */
@Component({
  selector: 'app-einstiegsraster',
  templateUrl: './einstiegsraster.html',
  styleUrl: './einstiegsraster.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Einstiegsraster {}
