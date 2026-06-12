// ===========================================================================
// Deterministischer Zufallsgenerator (mulberry32).
//
// Warum: Für tägliche Challenge, Geister und Multiplayer müssen ALLE Spieler
// exakt dasselbe Level sehen. Mit einem festen Seed liefert dieser Generator
// immer dieselbe Zahlenfolge -> reproduzierbare Hindernisse.
//
// Math.random() ist NICHT reproduzierbar und wird im Level-Generator dadurch
// ersetzt. Rein kosmetische Zufälle (Sterne, Partikel) dürfen Math.random()
// weiter nutzen, weil sie das Gameplay nicht beeinflussen.
// ===========================================================================

export class Rng {
  private a: number

  constructor(seed: number) {
    // 32-Bit-Startzustand sicherstellen
    this.a = seed >>> 0
  }

  /** Nächste Gleitkommazahl in [0, 1) – Kern des mulberry32-Algorithmus. */
  next(): number {
    this.a |= 0
    this.a = (this.a + 0x6d2b79f5) | 0
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Zahl in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Ganzzahl in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  /** Zufälliges Element aus einem Array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]
  }

  /** Mischt ein Array in-place (Fisher-Yates) deterministisch. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
}

/**
 * Leitet aus dem heutigen UTC-Datum einen stabilen Tages-Seed ab: YYYYMMDD.
 * UTC statt lokaler Zeit, damit weltweit alle Spieler denselben Tages-Seed
 * (gleiches Level, gleiche Bestenliste, gleicher Geist) bekommen.
 */
export function dailySeed(date = new Date()): number {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1
  const d = date.getUTCDate()
  return y * 10000 + m * 100 + d
}

/** Zufälliger Seed für den normalen Endlos-Modus. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}
