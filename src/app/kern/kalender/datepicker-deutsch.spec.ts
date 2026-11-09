import { describe, expect, it } from 'vitest';
import { DatepickerDeutsch } from './datepicker-deutsch';

describe('DatepickerDeutsch', () => {
  it('liefert deutsche Beschriftungen', () => {
    const intl = new DatepickerDeutsch();
    expect(intl.openCalendarLabel).toBe('Kalender öffnen');
    expect(intl.prevMonthLabel).toBe('Vorheriger Monat');
    expect(intl.nextMonthLabel).toBe('Nächster Monat');
  });
});
