import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { avatarText } from '../../services/avatar-text';

/**
 * Runder Avatar einer Einsatzkraft mit ihrem Benutzerkürzel aus HiOrg; ohne Kürzel stehen die
 * Initialen darin. Rein darstellend und für Screenreader versteckt – der Name steht stets daneben.
 */
@Component({
  selector: 'app-kuerzel-avatar',
  templateUrl: './kuerzel-avatar.html',
  styleUrl: './kuerzel-avatar.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class.klein]': 'klein()' },
})
export class KuerzelAvatar {
  readonly name = input.required<string>();
  readonly kuerzel = input<string | null | undefined>(null);
  readonly klein = input(false, { transform: booleanAttribute });

  protected readonly text = computed(() => avatarText(this.name(), this.kuerzel()));
}
