import { describe, expect, it, vi } from 'vitest';
import { AbrufPuffer } from './abruf-puffer';

describe('AbrufPuffer', () => {
  it('ruft innerhalb der Gültigkeit nur einmal ab', async () => {
    const puffer = new AbrufPuffer<number>(60_000);
    const lader = vi.fn().mockResolvedValue(1);
    expect(await puffer.hole('a', lader)).toBe(1);
    expect(await puffer.hole('a', lader)).toBe(1);
    expect(lader).toHaveBeenCalledOnce();
  });

  it('trennt verschiedene Schlüssel', async () => {
    const puffer = new AbrufPuffer<string>(60_000);
    expect(await puffer.hole('a', async () => 'A')).toBe('A');
    expect(await puffer.hole('b', async () => 'B')).toBe('B');
  });

  it('bündelt gleichzeitige Abrufe desselben Schlüssels zu einer Anfrage', async () => {
    const puffer = new AbrufPuffer<number>(60_000);
    const lader = vi.fn(
      () => new Promise<number>((aufloesen) => setTimeout(() => aufloesen(7), 0)),
    );
    const [erst, zweit] = await Promise.all([puffer.hole('a', lader), puffer.hole('a', lader)]);
    expect([erst, zweit]).toEqual([7, 7]);
    expect(lader).toHaveBeenCalledOnce();
  });

  it('puffert einen Fehler nicht – der nächste Versuch fragt wirklich nach', async () => {
    const puffer = new AbrufPuffer<number>(60_000);
    const lader = vi.fn().mockRejectedValueOnce(new Error('Netzwerk')).mockResolvedValue(5);
    await expect(puffer.hole('a', lader)).rejects.toThrow('Netzwerk');
    expect(await puffer.hole('a', lader)).toBe(5);
    expect(lader).toHaveBeenCalledTimes(2);
  });

  it('fragt nach Ablauf der Gültigkeit erneut nach', async () => {
    vi.useFakeTimers();
    try {
      const puffer = new AbrufPuffer<number>(60_000);
      const lader = vi.fn().mockResolvedValue(1);
      await puffer.hole('a', lader);
      vi.advanceTimersByTime(60_001);
      await puffer.hole('a', lader);
      expect(lader).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fragt nach dem Verwerfen erneut nach', async () => {
    const puffer = new AbrufPuffer<number>(60_000);
    const lader = vi.fn().mockResolvedValue(1);
    await puffer.hole('a', lader);
    puffer.verwerfen();
    await puffer.hole('a', lader);
    expect(lader).toHaveBeenCalledTimes(2);
  });

  it('übernimmt kein Ergebnis, das während eines Schreibzugriffs unterwegs war', async () => {
    const puffer = new AbrufPuffer<string>(60_000);
    let aufloesen: (wert: string) => void = () => undefined;
    const langsam = puffer.hole('a', () => new Promise<string>((f) => (aufloesen = f)));

    // Der Schreibzugriff passiert, während der Abruf noch läuft.
    puffer.verwerfen();
    aufloesen('alter Stand');
    expect(await langsam).toBe('alter Stand');

    const neu = vi.fn().mockResolvedValue('neuer Stand');
    expect(await puffer.hole('a', neu)).toBe('neuer Stand');
    expect(neu).toHaveBeenCalledOnce();
  });
});
