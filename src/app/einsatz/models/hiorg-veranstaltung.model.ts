import type { HiorgArt, HiorgEintrag } from '../../ausbildung/models/hiorg-kalender.model';

export type { HiorgArt };

/**
 * Ein Dienst oder eine Veranstaltung aus dem HiOrg-Kalenderfeed, wie die Einsatzübersicht sie
 * führt. Mehrere Feed-Einträge mit derselben Art und `id` (Serientermine, mehrere Schichten)
 * ergeben eine Veranstaltung mit mehreren Schichten.
 */
export interface HiorgVeranstaltung {
  /**
   * Verknüpfung mit dem Einsatz (`Einsatz.hiorgVeranstaltungId`): `dienst-<id>` bzw.
   * `termin-<id>`. Die `id` des Feeds allein ist über beide Arten hinweg nicht eindeutig.
   */
  veranstaltungId: string;
  art: HiorgArt;
  titel: string;
  /** Lokal `YYYY-MM-DDTHH:mm` (Berliner Zeit); ohne Uhrzeit im Feed `00:00`. */
  beginn: string;
  /** Lokal `YYYY-MM-DDTHH:mm`; ohne Endzeit im Feed `23:59` des letzten Tages. */
  ende: string;
  /** Die Feed-Einträge, nach Beginn sortiert; je Eintrag eine Schicht. */
  schichten: readonly HiorgEintrag[];
}
