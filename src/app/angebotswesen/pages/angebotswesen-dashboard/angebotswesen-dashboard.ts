import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-angebotswesen-dashboard',
  imports: [RouterLink, MatIconModule, MatToolbarModule],
  templateUrl: './angebotswesen-dashboard.html',
  styleUrl: './angebotswesen-dashboard.less',
})
export class AngebotswesenDashboard {}
