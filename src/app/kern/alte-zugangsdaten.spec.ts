import { entferneAlteZugangsdaten } from './alte-zugangsdaten';

describe('Alte Zugangsdaten entfernen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('löscht nur alte Zugangsdaten, ohne sie zu lesen oder sonstige Einstellungen zu löschen', () => {
    const lesen = vi.spyOn(Storage.prototype, 'getItem');
    const loeschen = vi.spyOn(Storage.prototype, 'removeItem');
    const allesLoeschen = vi.spyOn(Storage.prototype, 'clear');
    entferneAlteZugangsdaten();
    expect(loeschen.mock.calls).toEqual([['pep_efs_api_key'], ['ausbildungsplaner.nextcloud']]);
    expect(lesen).not.toHaveBeenCalled();
    expect(allesLoeschen).not.toHaveBeenCalled();
  });

  it('startet auch mit gesperrtem Browserspeicher', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('gesperrt');
    });
    expect(entferneAlteZugangsdaten).not.toThrow();
  });
});
