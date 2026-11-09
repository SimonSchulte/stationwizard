import { describe, expect, it } from 'vitest';
import { PaginatorDeutsch } from './paginator-deutsch';

describe('PaginatorDeutsch', () => {
  const intl = new PaginatorDeutsch();

  it('zeigt den Bereich auf Deutsch', () => {
    expect(intl.getRangeLabel(0, 25, 60)).toBe('1 – 25 von 60');
    expect(intl.getRangeLabel(2, 25, 60)).toBe('51 – 60 von 60');
  });

  it('kommt mit leerer Liste zurecht', () => {
    expect(intl.getRangeLabel(0, 25, 0)).toBe('0 von 0');
  });
});
