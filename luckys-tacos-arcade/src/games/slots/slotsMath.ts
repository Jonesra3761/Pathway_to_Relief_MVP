/**
 * Taco Slots rules and math. Pure TypeScript, no Phaser, so every outcome
 * and the long-run return can be unit tested exactly.
 *
 * Machine: 3 reels x 3 visible rows, 5 fixed paylines, three of a kind wins.
 * The Lucky Taco is wild: it stands in for any symbol, and three Lucky Tacos
 * on a line pay the jackpot. There are no other special pays.
 */

/** Reel symbols, from the top prize down. */
export const SYMBOLS = ['taco', 'sauce', 'chili', 'avocado', 'lime', 'onion'] as const;
export type SlotSymbol = (typeof SYMBOLS)[number];

export const WILD: SlotSymbol = 'taco';

export interface SymbolInfo {
  name: string;
  /** Line pay for three of a kind, multiplied by the line bet. */
  pay: number;
}

export const SYMBOL_INFO: Record<SlotSymbol, SymbolInfo> = {
  taco: { name: 'Lucky Taco', pay: 400 },
  sauce: { name: 'Hot Sauce', pay: 60 },
  chili: { name: 'Chili', pay: 25 },
  avocado: { name: 'Avocado', pay: 12 },
  lime: { name: 'Lime', pay: 8 },
  onion: { name: 'Onion', pay: 5 },
};

const CODES: Record<string, SlotSymbol> = { W: 'taco', S: 'sauce', C: 'chili', A: 'avocado', L: 'lime', O: 'onion' };

/**
 * Fixed reel strips, one letter per stop (W=Lucky Taco, S=Hot Sauce, C=Chili,
 * A=Avocado, L=Lime, O=Onion). No symbol sits next to itself, so the window
 * never shows a stacked pair. Changing a strip changes the return; the tests
 * re-check it exactly.
 *   Reel 1 & 3: 1 W, 3 S, 4 C, 5 A, 5 L, 6 O.   Reel 2: 1 W, 3 S, 4 C, 4 A, 5 L, 7 O.
 */
const STRIP_CODES = ['LOALOCOASCAOASLSCWOLOALC', 'LOAOWSOCOSCLAOSLAOCLOLCA', 'OSOLCACOLSAWAOCLALOSLAOC'] as const;

export const REEL_STRIPS: readonly (readonly SlotSymbol[])[] = STRIP_CODES.map((code) =>
  [...code].map((ch) => {
    const symbol = CODES[ch];
    if (!symbol) throw new Error(`Unknown reel code "${ch}"`);
    return symbol;
  }),
);

export const REEL_COUNT = 3;
export const ROW_COUNT = 3;

export interface Payline {
  /** 1-based number shown to the player. */
  id: number;
  name: string;
  /** Row (0 = top) used on each reel, left to right. */
  rows: readonly [number, number, number];
}

export const PAYLINES: readonly Payline[] = [
  { id: 1, name: 'Middle', rows: [1, 1, 1] },
  { id: 2, name: 'Top', rows: [0, 0, 0] },
  { id: 3, name: 'Bottom', rows: [2, 2, 2] },
  { id: 4, name: 'Diagonal down', rows: [0, 1, 2] },
  { id: 5, name: 'Diagonal up', rows: [2, 1, 0] },
];

/** Selectable line bets. Every spin plays all 5 lines. */
export const LINE_BETS = [1, 2, 5] as const;
export type LineBet = (typeof LINE_BETS)[number];

export const MIN_TOTAL_BET = totalBet(LINE_BETS[0]);

/** A win of at least this many times the total bet gets the big celebration. */
export const BIG_WIN_MULTIPLIER = 10;

/**
 * Long-run return to player for this exact strip set, shown on the paytable.
 * Verified by full enumeration in tests/slots.test.ts.
 */
export const THEORETICAL_RTP = 0.94784;

/** Random source returning a float in [0, 1). Injected so tests can seed it. */
export type Rng = () => number;

/** grid[reel][row], row 0 = top. */
export type Grid = SlotSymbol[][];

export interface LineWin {
  line: Payline;
  /** The symbol paid (the wild only when all three are wilds). */
  symbol: SlotSymbol;
  /** Line pay before the line bet is applied. */
  multiplier: number;
  /** Credits won on this line (multiplier x line bet). */
  amount: number;
  /** [reel, row] of each symbol on the line. */
  cells: [number, number][];
}

export interface SpinOutcome {
  stops: number[];
  grid: Grid;
  lineBet: LineBet;
  totalBet: number;
  wins: LineWin[];
  /** Total credits returned (0 on a loss). Includes the "stake" portion of a win. */
  payout: number;
  isBigWin: boolean;
  isJackpot: boolean;
}

export function totalBet(lineBet: number): number {
  return lineBet * PAYLINES.length;
}

export function isLineBet(value: number): value is LineBet {
  return (LINE_BETS as readonly number[]).includes(value);
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Symbol at any index on a strip, wrapping in both directions. */
export function symbolAt(strip: readonly SlotSymbol[], index: number): SlotSymbol {
  return strip[mod(index, strip.length)];
}

/** The 3 visible rows of every reel: strip[stop - 1], strip[stop], strip[stop + 1]. */
export function visibleGrid(stops: readonly number[], strips: readonly (readonly SlotSymbol[])[] = REEL_STRIPS): Grid {
  return strips.map((strip, reel) => [-1, 0, 1].map((offset) => symbolAt(strip, stops[reel] + offset)));
}

/**
 * Pays three of a kind, with the wild standing in for anything.
 * Returns the paid symbol and its line multiplier, or null for no win.
 */
export function evaluateLine(symbols: readonly SlotSymbol[]): { symbol: SlotSymbol; multiplier: number } | null {
  if (symbols.length !== REEL_COUNT) return null;
  const natural = symbols.filter((s) => s !== WILD);
  if (natural.length === 0) return { symbol: WILD, multiplier: SYMBOL_INFO[WILD].pay };
  const symbol = natural[0];
  if (natural.some((s) => s !== symbol)) return null;
  return { symbol, multiplier: SYMBOL_INFO[symbol].pay };
}

/** Evaluates all 5 lines. Payout is the sum of every winning line. */
export function evaluateGrid(grid: Grid, lineBet: number): { wins: LineWin[]; payout: number } {
  const wins: LineWin[] = [];
  for (const line of PAYLINES) {
    const cells = line.rows.map((row, reel) => [reel, row] as [number, number]);
    const result = evaluateLine(cells.map(([reel, row]) => grid[reel][row]));
    if (result) wins.push({ line, ...result, amount: result.multiplier * lineBet, cells });
  }
  return { wins, payout: wins.reduce((sum, w) => sum + w.amount, 0) };
}

/** Uniform stop in [0, length), safe against an RNG that misbehaves at the edges. */
export function pickStop(rng: Rng, length: number): number {
  const r = rng();
  if (!Number.isFinite(r)) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(r * length)));
}

/** Decides a whole spin up front: one random stop per reel, then pays. */
export function spin(lineBet: number, rng: Rng = Math.random, strips = REEL_STRIPS): SpinOutcome {
  if (!isLineBet(lineBet)) throw new RangeError(`Invalid line bet ${lineBet}`);
  const stops = strips.map((strip) => pickStop(rng, strip.length));
  const grid = visibleGrid(stops, strips);
  const { wins, payout } = evaluateGrid(grid, lineBet);
  const bet = totalBet(lineBet);
  return {
    stops,
    grid,
    lineBet,
    totalBet: bet,
    wins,
    payout,
    isBigWin: payout >= bet * BIG_WIN_MULTIPLIER,
    isJackpot: wins.some((w) => w.symbol === WILD),
  };
}

const IDLE_ATTEMPTS = 50;

/**
 * Random stops for a machine at rest (before its first spin) that show no
 * paying line, so the idle window never looks like a win that wasn't paid.
 * About 69% of windows are dead, so this nearly always succeeds first try.
 */
export function idleStops(rng: Rng = Math.random, strips = REEL_STRIPS): number[] {
  const dead = (stops: number[]) => evaluateGrid(visibleGrid(stops, strips), 1).wins.length === 0;
  for (let attempt = 0; attempt < IDLE_ATTEMPTS; attempt++) {
    const stops = strips.map((strip) => pickStop(rng, strip.length));
    if (dead(stops)) return stops;
  }
  // The RNG keeps landing on wins (e.g. a stubbed one): take the first dead window in strip order.
  const combos = strips.reduce((n, s) => n * s.length, 1);
  for (let n = 0; n < combos; n++) {
    let rest = n;
    const stops = strips.map((s) => {
      const stop = rest % s.length;
      rest = Math.floor(rest / s.length);
      return stop;
    });
    if (dead(stops)) return stops;
  }
  return strips.map(() => 0);
}

/** Small seedable PRNG (mulberry32) for tests and reproducible demos. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
