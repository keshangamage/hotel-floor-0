/**
 * Deterministic pseudo-random source. The same seed always produces the same
 * sequence, which is what lets a floor be regenerated identically.
 */
export interface Random {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Returns a new array; never mutates the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** Distinct integers in [0, count), useful for choosing indices. */
  sample(count: number, take: number): number[];
}

/** FNV-1a, so a readable seed string maps to a stable 32-bit value. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast and stable across engines. */
export function createRandom(seed: number | string): Random {
  let state = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const random: Random = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick() needs a non-empty array");
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    sample: (count, take) =>
      random.shuffle(Array.from({ length: count }, (_, i) => i)).slice(0, Math.min(take, count)),
  };

  return random;
}
