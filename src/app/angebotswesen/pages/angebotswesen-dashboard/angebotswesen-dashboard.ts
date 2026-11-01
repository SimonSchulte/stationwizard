import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-angebotswesen-dashboard',
  imports: [Seitenkopf, RouterLink, MatIconModule],
  templateUrl: './angebotswesen-dashboard.html',
  styleUrl: './angebotswesen-dashboard.less',
})
export class AngebotswesenDashboard {}
