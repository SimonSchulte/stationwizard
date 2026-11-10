import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { AufbauVorlagenReiter } from '../../components/aufbau-vorlagen-reiter/aufbau-vorlagen-reiter';
import { PepVorlagenReiter } from '../../components/pep-vorlagen-reiter/pep-vorlagen-reiter';
import { VbVorlagenReiter } from '../../components/vb-vorlagen-reiter/vb-vorlagen-reiter';

/**
 * Verwaltung der Einsatz-Vorlagen (`/verwaltung/einsatz-vorlagen`): Reiter „PEP“, „VB“ und „Aufbau“.
 * Jeder Reiter hält Liste, Ansicht und Aktionen seiner Vorlagenart selbst und lädt erst, wenn
 * er geöffnet wird.
 */
@Component({
  selector: 'app-einsatz-vorlagen',
  imports: [MatTabsModule, Seitenkopf, PepVorlagenReiter, VbVorlagenReiter, AufbauVorlagenReiter],
  templateUrl: './einsatz-vorlagen.html',
  styleUrl: './einsatz-vorlagen.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EinsatzVorlagen {}
