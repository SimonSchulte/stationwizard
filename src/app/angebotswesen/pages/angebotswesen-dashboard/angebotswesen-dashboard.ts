import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Einstiegskarte } from '../../../kern/einstieg/einstiegskarte';
import { Einstiegsraster } from '../../../kern/einstieg/einstiegsraster';
import { Einstiegsseite } from '../../../kern/einstieg/einstiegsseite';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-angebotswesen-dashboard',
  imports: [Seitenkopf, Einstiegsseite, Einstiegsraster, Einstiegskarte],
  templateUrl: './angebotswesen-dashboard.html',
})
export class AngebotswesenDashboard {}
