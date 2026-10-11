import { describe, expect, it } from 'vitest';
import {
  BIG_WIN_MULTIPLIER,
  LINE_BETS,
  MIN_TOTAL_BET,
  PAYLINES,
  REEL_STRIPS,
  SYMBOLS,
  SYMBOL_INFO,
  THEORETICAL_RTP,
  evaluateGrid,
  evaluateLine,
  idleStops,
  pickStop,
  seededRng,
  spin,
  totalBet,
  visibleGrid,
  type Grid,
  type SlotSymbol,
} from '../src/games/slots/slotsMath';

/**
 * Plays every possible combination of stops once, at line bet 1, and checks
 * each one against the other line bets.
 */
function enumerateAllSpins() {
  const [a, b, c] = REEL_STRIPS.map((s) => s.length);
  let combos = 0;
  let totalReturn = 0;
  let hits = 0;
  let bigWins = 0;
  let jackpotLines = 0;
  let maxPayout = 0;
  /** Jackpot combinations per payline id. */
  const jackpotsByLine = new Map<number, number>(PAYLINES.map((l) => [l.id, 0]));
  /** Combinations where a bigger line bet did not pay exactly lineBet x the line bet 1 payout. */
  let scaleMismatches = 0;
  for (let s0 = 0; s0 < a; s0++) {
    for (let s1 = 0; s1 < b; s1++) {
      for (let s2 = 0; s2 < c; s2++) {
        const g = visibleGrid([s0, s1, s2]);
        const { wins, payout } = evaluateGrid(g, 1);
        combos += 1;
        totalReturn += payout;
        if (payout > 0) hits += 1;
        if (payout >= totalBet(1) * BIG_WIN_MULTIPLIER) bigWins += 1;
        for (const w of wins.filter((w) => w.symbol === 'taco')) {
          jackpotLines += 1;
          jackpotsByLine.set(w.line.id, (jackpotsByLine.get(w.line.id) ?? 0) + 1);
        }
        maxPayout = Math.max(maxPayout, payout);
        for (const lb of LINE_BETS) if (evaluateGrid(g, lb).payout !== payout * lb) scaleMismatches += 1;
      }
    }
  }
  return { combos, totalReturn, hits, bigWins, jackpotLines, jackpotsByLine, scaleMismatches, maxPayout };
}

/** Builds a grid from three columns written top to bottom. */
function grid(...reels: [SlotSymbol, SlotSymbol, SlotSymbol][]): Grid {
  return reels.map((r) => [...r]);
}

describe('slots math (exact enumeration)', () => {
  const stats = enumerateAllSpins();
  const rtp = stats.totalReturn / (stats.combos * totalBet(1));
  const hitFrequency = stats.hits / stats.combos;

  it('covers every combination of reel stops', () => {
    const expected = REEL_STRIPS.reduce((n, s) => n * s.length, 1);
    expect(stats.combos).toBe(expected);
    REEL_STRIPS.forEach((s) => {
      expect(s.length).toBeGreaterThanOrEqual(16);
      expect(s.length).toBeLessThanOrEqual(32);
    });
  });

  it('returns between 90% and 97% of bets', () => {
    console.info(
      `[slots] RTP ${(rtp * 100).toFixed(4)}% (${stats.totalReturn} / ${stats.combos * totalBet(1)}), ` +
        `hit frequency ${(hitFrequency * 100).toFixed(4)}% (${stats.hits} / ${stats.combos}), ` +
        `big wins ${stats.bigWins}, jackpot lines ${stats.jackpotLines}, max payout x${stats.maxPayout / totalBet(1)} total bet`,
    );
    expect(rtp).toBeGreaterThanOrEqual(0.9);
    expect(rtp).toBeLessThanOrEqual(0.97);
  });

  it('pays something on 18% to 40% of spins', () => {
    expect(hitFrequency).toBeGreaterThanOrEqual(0.18);
    expect(hitFrequency).toBeLessThanOrEqual(0.4);
  });

  it('matches the RTP shown on the paytable', () => {
    expect(rtp).toBeCloseTo(THEORETICAL_RTP, 4);
  });

  it('scales payouts linearly with the line bet', () => {
    // Every combination, at every line bet.
    expect(stats.scaleMismatches).toBe(0);
    // And one concrete winner: all three tacos on the middle row (plus the lines they complete).
    const stops = REEL_STRIPS.map((s) => s.indexOf('taco'));
    const base = evaluateGrid(visibleGrid(stops), 1).payout;
    expect(base).toBeGreaterThan(0);
    for (const lb of LINE_BETS) expect(evaluateGrid(visibleGrid(stops), lb).payout).toBe(base * lb);
  });

  it('can reach the jackpot on every payline (exactly once each, with one wild per reel)', () => {
    expect([...stats.jackpotsByLine.entries()]).toEqual(PAYLINES.map((l) => [l.id, 1]));
    expect(stats.jackpotLines).toBe(PAYLINES.length);
  });
});

describe('slots reel strips', () => {
  it('use every symbol, keep one wild per reel, and never stack a symbol on itself', () => {
    REEL_STRIPS.forEach((strip) => {
      SYMBOLS.forEach((sym) => expect(strip).toContain(sym));
      expect(strip.filter((s) => s === 'taco')).toHaveLength(1);
      strip.forEach((sym, i) => expect(strip[(i + 1) % strip.length]).not.toBe(sym));
    });
  });

  it('makes rarer symbols pay more', () => {
    const pays = SYMBOLS.map((s) => SYMBOL_INFO[s].pay);
    expect([...pays].sort((x, y) => y - x)).toEqual(pays);
    pays.forEach((p) => expect(Number.isInteger(p)).toBe(true));
  });
});

describe('slots grid', () => {
  it('shows strip[stop-1], strip[stop], strip[stop+1] with wraparound', () => {
    const last = REEL_STRIPS.map((s) => s.length - 1);
    const g = visibleGrid([0, last[1], 5]);
    expect(g[0]).toEqual([REEL_STRIPS[0][last[0]], REEL_STRIPS[0][0], REEL_STRIPS[0][1]]);
    expect(g[1]).toEqual([REEL_STRIPS[1][last[1] - 1], REEL_STRIPS[1][last[1]], REEL_STRIPS[1][0]]);
    expect(g[2]).toEqual([REEL_STRIPS[2][4], REEL_STRIPS[2][5], REEL_STRIPS[2][6]]);
  });
});

describe('slots line evaluation', () => {
  it('pays three of a kind and nothing else', () => {
    expect(evaluateLine(['chili', 'chili', 'chili'])).toEqual({ symbol: 'chili', multiplier: 25 });
    expect(evaluateLine(['onion', 'onion', 'onion'])).toEqual({ symbol: 'onion', multiplier: 5 });
    expect(evaluateLine(['chili', 'chili', 'lime'])).toBeNull();
    expect(evaluateLine(['lime', 'chili', 'chili'])).toBeNull();
    expect(evaluateLine(['sauce', 'avocado', 'onion'])).toBeNull();
  });

  it('lets the Lucky Taco substitute for any symbol', () => {
    expect(evaluateLine(['taco', 'sauce', 'sauce'])).toEqual({ symbol: 'sauce', multiplier: 60 });
    expect(evaluateLine(['lime', 'taco', 'lime'])).toEqual({ symbol: 'lime', multiplier: 8 });
    expect(evaluateLine(['taco', 'taco', 'avocado'])).toEqual({ symbol: 'avocado', multiplier: 12 });
    expect(evaluateLine(['onion', 'taco', 'taco'])).toEqual({ symbol: 'onion', multiplier: 5 });
    // A wild can't join two different symbols.
    expect(evaluateLine(['chili', 'taco', 'lime'])).toBeNull();
  });

  it('pays the jackpot for three Lucky Tacos', () => {
    expect(evaluateLine(['taco', 'taco', 'taco'])).toEqual({ symbol: 'taco', multiplier: 400 });
  });

  it('rejects malformed lines', () => {
    expect(evaluateLine(['chili', 'chili'])).toBeNull();
  });

  it.each([
    [1, grid(['lime', 'chili', 'onion'], ['sauce', 'chili', 'avocado'], ['onion', 'chili', 'lime'])],
    [2, grid(['chili', 'lime', 'onion'], ['chili', 'sauce', 'avocado'], ['chili', 'onion', 'lime'])],
    [3, grid(['lime', 'onion', 'chili'], ['sauce', 'avocado', 'chili'], ['onion', 'lime', 'chili'])],
    [4, grid(['chili', 'lime', 'onion'], ['sauce', 'chili', 'avocado'], ['onion', 'lime', 'chili'])],
    [5, grid(['onion', 'lime', 'chili'], ['sauce', 'chili', 'avocado'], ['chili', 'lime', 'onion'])],
  ])('pays line %i on its own', (id, g) => {
    const { wins, payout } = evaluateGrid(g, 2);
    expect(wins.map((w) => w.line.id)).toEqual([id]);
    expect(wins[0]).toMatchObject({ symbol: 'chili', multiplier: 25, amount: 50 });
    const line = PAYLINES.find((l) => l.id === id)!;
    expect(wins[0].cells).toEqual(line.rows.map((row, reel) => [reel, row]));
    expect(payout).toBe(50);
  });

  it('adds up several winning lines, with wilds shared between them', () => {
    // Middle row is taco-taco-taco; the wild middle also completes both diagonals.
    const g = grid(['lime', 'taco', 'onion'], ['chili', 'taco', 'avocado'], ['onion', 'taco', 'lime']);
    const { wins, payout } = evaluateGrid(g, 1);
    expect(wins.map((w) => [w.line.id, w.symbol])).toEqual([
      [1, 'taco'],
      [4, 'lime'],
      [5, 'onion'],
    ]);
    expect(payout).toBe(400 + 8 + 5);
  });

  it('pays nothing on a dead grid', () => {
    const g = grid(['lime', 'chili', 'onion'], ['sauce', 'avocado', 'lime'], ['chili', 'onion', 'avocado']);
    expect(evaluateGrid(g, 5)).toEqual({ wins: [], payout: 0 });
  });
});

describe('slots spin', () => {
  it('is deterministic for a seeded RNG', () => {
    const a = seededRng(1234);
    const b = seededRng(1234);
    const runA = Array.from({ length: 50 }, () => spin(2, a));
    const runB = Array.from({ length: 50 }, () => spin(2, b));
    expect(runA).toEqual(runB);
    expect(new Set(runA.map((o) => o.stops.join(','))).size).toBeGreaterThan(40);
  });

  it('maps the RNG straight onto reel stops', () => {
    const values = [0, 0.5, 0.999999];
    let i = 0;
    const out = spin(1, () => values[i++]);
    expect(out.stops).toEqual([0, Math.floor(0.5 * REEL_STRIPS[1].length), REEL_STRIPS[2].length - 1]);
    expect(out.grid).toEqual(visibleGrid(out.stops));
  });

  it('guards against out-of-range RNG values', () => {
    expect(pickStop(() => 1, 24)).toBe(23);
    expect(pickStop(() => -0.2, 24)).toBe(0);
    expect(pickStop(() => Number.NaN, 24)).toBe(0);
  });

  it('reports bet, payout and flags consistently', () => {
    const rng = seededRng(99);
    for (let n = 0; n < 500; n++) {
      const lb = LINE_BETS[n % LINE_BETS.length];
      const o = spin(lb, rng);
      expect(o.totalBet).toBe(lb * 5);
      expect(o.payout).toBe(o.wins.reduce((s, w) => s + w.amount, 0));
      expect(Number.isInteger(o.payout)).toBe(true);
      expect(o.isBigWin).toBe(o.payout >= o.totalBet * BIG_WIN_MULTIPLIER);
      expect(o.isJackpot).toBe(o.wins.some((w) => w.symbol === 'taco'));
    }
  });

  it('finds a jackpot with a forced RNG', () => {
    const tacoStops = REEL_STRIPS.map((s) => s.indexOf('taco'));
    let i = 0;
    const out = spin(5, () => (tacoStops[i] + 0.5) / REEL_STRIPS[i++].length);
    expect(out.stops).toEqual(tacoStops);
    expect(out.isJackpot).toBe(true);
    expect(out.isBigWin).toBe(true);
    expect(out.wins.find((w) => w.line.id === 1)?.amount).toBe(400 * 5);
  });

  it('starts the machine at rest on a window with no paying line', () => {
    const rng = seededRng(7);
    for (let n = 0; n < 300; n++) {
      const stops = idleStops(rng);
      stops.forEach((stop, reel) => {
        expect(Number.isInteger(stop)).toBe(true);
        expect(stop).toBeGreaterThanOrEqual(0);
        expect(stop).toBeLessThan(REEL_STRIPS[reel].length);
      });
      expect(evaluateGrid(visibleGrid(stops), 1).wins).toEqual([]);
    }
  });

  it('still finds a dead idle window when the RNG always lands on a win', () => {
    // Pins every reel on its taco: a jackpot window, every time.
    const tacoStops = REEL_STRIPS.map((s) => s.indexOf('taco'));
    let i = 0;
    const stuck = () => {
      const reel = i++ % REEL_STRIPS.length;
      return (tacoStops[reel] + 0.5) / REEL_STRIPS[reel].length;
    };
    const stops = idleStops(stuck);
    expect(stops).not.toEqual(tacoStops);
    expect(evaluateGrid(visibleGrid(stops), 1).wins).toEqual([]);
  });

  it('rejects bets that are not on the menu', () => {
    expect(() => spin(3)).toThrow(RangeError);
    expect(MIN_TOTAL_BET).toBe(5);
    expect(LINE_BETS.map(totalBet)).toEqual([5, 10, 25]);
  });
});
