import { Injectable } from '@angular/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';

/** Deutsche Beschriftungen für `mat-datepicker` (Material liefert sonst Englisch, auch für Bildschirmleser). */
@Injectable()
export class DatepickerDeutsch extends MatDatepickerIntl {
  override calendarLabel = 'Kalender';
  override openCalendarLabel = 'Kalender öffnen';
  override closeCalendarLabel = 'Kalender schließen';
  override prevMonthLabel = 'Vorheriger Monat';
  override nextMonthLabel = 'Nächster Monat';
  override prevYearLabel = 'Vorheriges Jahr';
  override nextYearLabel = 'Nächstes Jahr';
  override prevMultiYearLabel = 'Vorherige 24 Jahre';
  override nextMultiYearLabel = 'Nächste 24 Jahre';
  override switchToMonthViewLabel = 'Monatsansicht wählen';
  override switchToMultiYearViewLabel = 'Monat und Jahr wählen';
}
