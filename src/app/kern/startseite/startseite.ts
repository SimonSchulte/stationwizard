import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-startseite',
  imports: [RouterLink, MatIconModule],
  templateUrl: './startseite.html',
  styleUrl: './startseite.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Startseite {}
