import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Einstiegskarte } from '../einstieg/einstiegskarte';
import { Einstiegsraster } from '../einstieg/einstiegsraster';
import { Einstiegsseite } from '../einstieg/einstiegsseite';

@Component({
  selector: 'app-startseite',
  imports: [Einstiegsseite, Einstiegsraster, Einstiegskarte],
  templateUrl: './startseite.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Startseite {}
