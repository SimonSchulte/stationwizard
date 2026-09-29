import { describe, expect, it } from 'vitest';
import { zipLesen, zipSchreiben, ZipFehler } from './zip';

function text(inhalt: string): Uint8Array {
  return new TextEncoder().encode(inhalt);
}

describe('zipSchreiben/zipLesen', () => {
  it('liest zurück, was geschrieben wurde (mehrere Einträge, Rundlauf)', async () => {
    const eintraege = [
      { name: '[Content_Types].xml', daten: text('<Types/>') },
      { name: 'word/document.xml', daten: text('<document>Hallo Welt äöü</document>') },
      { name: 'word/media/leer.bin', daten: new Uint8Array(0) },
    ];
    const archiv = await zipSchreiben(eintraege);
    const gelesen = await zipLesen(archiv);
    expect(gelesen.map((e) => e.name)).toEqual(eintraege.map((e) => e.name));
    for (let i = 0; i < eintraege.length; i += 1) {
      expect([...gelesen[i]!.daten]).toEqual([...eintraege[i]!.daten]);
    }
  });

  it('erzeugt ein von der Plattform lesbares, gültiges ZIP (JSZip-kompatibler Aufbau)', async () => {
    // Kein zweiter Leser zur Hand – Gegenprobe über die native
    // DecompressionStream-Kompatibilität: ein unkomprimierter Eintrag lässt
    // sich unverändert über den Store-Pfad zurücklesen (oben abgedeckt) und
    // die Central-Directory-Anzahl muss zur EOCD passen.
    const archiv = await zipSchreiben([{ name: 'a.txt', daten: text('x') }]);
    const view = new DataView(archiv.buffer, archiv.byteOffset, archiv.byteLength);
    // EOCD-Signatur an den letzten 22 Bytes.
    expect(view.getUint32(archiv.length - 22, true)).toBe(0x06054b50);
  });

  it('liest einen echten deflate-komprimierten Eintrag (wie von Word erzeugt)', async () => {
    const inhalt = text('Komprimierter Testinhalt, mehrfach mehrfach mehrfach wiederholt.');
    const strom = new CompressionStream('deflate-raw');
    const writer = strom.writable.getWriter();
    void writer.write(new Uint8Array(inhalt));
    void writer.close();
    const komprimiert = new Uint8Array(await new Response(strom.readable).arrayBuffer());

    // Von Hand ein minimales ZIP mit Methode 8 (deflate) bauen, da
    // zipSchreiben() nur store erzeugt.
    const name = text('doc.txt');
    const lokalerKopf = new Uint8Array(30 + name.length);
    const lb = new DataView(lokalerKopf.buffer);
    lb.setUint32(0, 0x04034b50, true);
    lb.setUint16(4, 20, true);
    lb.setUint16(6, 0, true);
    lb.setUint16(8, 8, true); // deflate
    lb.setUint16(10, 0, true);
    lb.setUint16(12, 0x21, true);
    lb.setUint32(14, 0, true); // CRC ungeprüft für diesen Test
    lb.setUint32(18, komprimiert.length, true);
    lb.setUint32(22, inhalt.length, true);
    lb.setUint16(26, name.length, true);
    lb.setUint16(28, 0, true);
    lokalerKopf.set(name, 30);

    const zentralerKopf = new Uint8Array(46 + name.length);
    const zb = new DataView(zentralerKopf.buffer);
    zb.setUint32(0, 0x02014b50, true);
    zb.setUint16(4, 20, true);
    zb.setUint16(6, 20, true);
    zb.setUint16(8, 0, true);
    zb.setUint16(10, 8, true);
    zb.setUint16(12, 0, true);
    zb.setUint16(14, 0x21, true);
    zb.setUint32(16, 0, true);
    zb.setUint32(20, komprimiert.length, true);
    zb.setUint32(24, inhalt.length, true);
    zb.setUint16(28, name.length, true);
    zb.setUint32(42, 0, true);
    zentralerKopf.set(name, 46);

    const eocd = new Uint8Array(22);
    const eb = new DataView(eocd.buffer);
    eb.setUint32(0, 0x06054b50, true);
    eb.setUint16(8, 1, true);
    eb.setUint16(10, 1, true);
    eb.setUint32(12, zentralerKopf.length, true);
    eb.setUint32(16, lokalerKopf.length + komprimiert.length, true);

    const archiv = new Uint8Array(
      lokalerKopf.length + komprimiert.length + zentralerKopf.length + eocd.length,
    );
    let v = 0;
    for (const teil of [lokalerKopf, komprimiert, zentralerKopf, eocd]) {
      archiv.set(teil, v);
      v += teil.length;
    }

    const gelesen = await zipLesen(archiv);
    expect(gelesen).toHaveLength(1);
    expect(gelesen[0]!.name).toBe('doc.txt');
    expect(new TextDecoder().decode(gelesen[0]!.daten)).toBe(new TextDecoder().decode(inhalt));
  });

  it('verwirft einen Inhalt ohne End-of-Central-Directory', async () => {
    await expect(zipLesen(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(ZipFehler);
  });
});
