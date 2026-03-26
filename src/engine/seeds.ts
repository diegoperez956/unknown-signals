import type { SeededRNG } from '../types';

// Mulberry32 — fast, high-quality 32-bit PRNG
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRNG(seed: number): SeededRNG {
  const raw = mulberry32(seed);

  // Box-Muller for gaussian samples
  let hasSpare = false;
  let spare = 0;

  return {
    seed,
    next: raw,
    gaussian(mean = 0, std = 1) {
      if (hasSpare) {
        hasSpare = false;
        return spare * std + mean;
      }
      let u: number, v: number, s: number;
      do {
        u = raw() * 2 - 1;
        v = raw() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const mul = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * mul;
      hasSpare = true;
      return u * mul * std + mean;
    },
  };
}

// Master seed manager — creates independent RNG streams for each subsystem
export class SeedManager {
  private master: SeededRNG;
  private streams: Map<string, SeededRNG> = new Map();

  constructor(masterSeed?: number) {
    const seed = masterSeed ?? (Date.now() ^ (Math.random() * 0xffffffff));
    this.master = createRNG(seed);
  }

  // Get or create a named RNG stream
  stream(name: string): SeededRNG {
    let rng = this.streams.get(name);
    if (!rng) {
      rng = createRNG(Math.floor(this.master.next() * 0xffffffff));
      this.streams.set(name, rng);
    }
    return rng;
  }
}
