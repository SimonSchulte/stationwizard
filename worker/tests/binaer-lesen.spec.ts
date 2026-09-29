import { describe, expect, it } from 'vitest';
import { blobZuArrayBuffer } from '../src/binaer-lesen';

describe('blobZuArrayBuffer', () => {
  it('gibt ein ArrayBuffer unverändert zurück', () => {
    const original = new Uint8Array([1, 2, 3]).buffer;
    expect(blobZuArrayBuffer(original)).toBe(original);
  });

  it('wandelt eine Sicht (Uint8Array) in ein eigenständiges ArrayBuffer', () => {
    const quelle = new Uint8Array([9, 8, 7, 6, 5]);
    const sicht = quelle.subarray(1, 4);
    const ergebnis = blobZuArrayBuffer(sicht);
    expect([...new Uint8Array(ergebnis)]).toEqual([8, 7, 6]);
  });

  it('wandelt ein einfaches Array von Byte-Werten, wie D1 BLOB-Spalten zur Laufzeit liefert', () => {
    // Nachweis gegen den echten gebündelten Worker mit echter D1-Bindung: eine
    // gelesene BLOB-Spalte kommt trotz ArrayBuffer-Typisierung der
    // Bindings-API als einfaches Array zurück. `new Response(zeile.inhalt)`
    // lieferte damit unbemerkt einen leeren Rumpf.
    const ergebnis = blobZuArrayBuffer([1, 2, 3, 4, 5]);
    expect([...new Uint8Array(ergebnis)]).toEqual([1, 2, 3, 4, 5]);
  });
});
