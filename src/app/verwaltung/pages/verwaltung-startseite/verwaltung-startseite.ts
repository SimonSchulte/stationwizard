import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-verwaltung-startseite',
  imports: [RouterLink, MatIconModule],
  templateUrl: './verwaltung-startseite.html',
  styleUrl: './verwaltung-startseite.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerwaltungStartseite {}
