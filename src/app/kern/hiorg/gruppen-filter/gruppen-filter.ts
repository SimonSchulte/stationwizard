import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

/** Mehrfachauswahl über die bei HiOrg gefundenen Gruppen; leere Auswahl heißt alle. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-gruppen-filter',
  imports: [MatFormFieldModule, MatSelectModule],
  templateUrl: './gruppen-filter.html',
  styleUrl: './gruppen-filter.less',
})
export class GruppenFilter {
  readonly gruppen = input.required<readonly string[]>();
  readonly auswahl = model<string[]>([]);
}
