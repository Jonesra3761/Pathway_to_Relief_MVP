/** Enemy kinds. Each is an original Lucky's Tacos ingredient-themed baddie. */
export type EnemyKind = 'pepper' | 'onion' | 'chili';

export interface EnemyKindInfo {
  texture: string;
  /** Points while sitting in formation. Diving enemies are worth double. */
  points: number;
  hitPoints: number;
}

export const ENEMY_KINDS: Record<EnemyKind, EnemyKindInfo> = {
  chili: { texture: 'enemy-chili', points: 150, hitPoints: 2 },
  pepper: { texture: 'enemy-pepper', points: 80, hitPoints: 1 },
  onion: { texture: 'enemy-onion', points: 50, hitPoints: 1 },
};

export interface WaveConfig {
  wave: number;
  /** Row layout from top to bottom; each row lists its kind and column count. */
  rows: { kind: EnemyKind; count: number }[];
  /** Milliseconds between dive attack launches. */
  diveIntervalMs: number;
  /** Max simultaneous divers. */
  maxDivers: number;
  /** Chance per second for each formation enemy to shoot. */
  fireChancePerSec: number;
  diveSpeedMultiplier: number;
}

/** Builds the wave definition for a 1-based wave number; difficulty ramps and caps. */
export function getWaveConfig(wave: number): WaveConfig {
  const w = Math.max(1, Math.floor(wave));
  const step = Math.min(w - 1, 8);
  return {
    wave: w,
    rows: [
      { kind: 'chili', count: w >= 3 ? 6 : 4 },
      { kind: 'pepper', count: 8 },
      { kind: 'pepper', count: 8 },
      { kind: 'onion', count: w >= 2 ? 8 : 6 },
    ],
    diveIntervalMs: Math.max(900, 2600 - step * 220),
    maxDivers: Math.min(5, 1 + Math.floor(w / 2)),
    fireChancePerSec: Math.min(0.06, 0.012 + step * 0.006),
    diveSpeedMultiplier: 1 + step * 0.08,
  };
}

export interface Slot {
  row: number;
  col: number;
  kind: EnemyKind;
  /** Offset from formation center. */
  x: number;
  y: number;
}

/** Converts a wave's rows into centered slot positions. */
export function buildSlots(config: WaveConfig, colSpacing: number, rowSpacing: number): Slot[] {
  const slots: Slot[] = [];
  config.rows.forEach((row, r) => {
    const width = (row.count - 1) * colSpacing;
    for (let c = 0; c < row.count; c++) {
      slots.push({ row: r, col: c, kind: row.kind, x: -width / 2 + c * colSpacing, y: r * rowSpacing });
    }
  });
  return slots;
}

export function pointsFor(kind: EnemyKind, diving: boolean): number {
  const base = ENEMY_KINDS[kind].points;
  return diving ? base * 2 : base;
}
