import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/** Einheitliche Ladeanzeige: Material-Spinner mit kurzem Text, als `status` angesagt. */
@Component({
  selector: 'app-ladeanzeige',
  imports: [MatProgressSpinnerModule],
  templateUrl: './ladeanzeige.html',
  styleUrl: './ladeanzeige.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status' },
})
export class Ladeanzeige {
  readonly text = input('Wird geladen …');
}
