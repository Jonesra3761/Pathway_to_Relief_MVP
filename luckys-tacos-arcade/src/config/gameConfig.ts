/**
 * Central tuning values. Gameplay code reads from here so balance changes
 * don't require touching scene logic.
 */
export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;

export const PLAYER = {
  y: GAME_HEIGHT - 70,
  speed: 320, // px/s for keyboard movement
  touchFollowSpeed: 520, // max px/s when following a finger
  fireIntervalMs: 260,
  bulletSpeed: 560,
  startingLives: 3,
  invulnerableMs: 2000,
  respawnDelayMs: 900,
  margin: 22,
} as const;

export const ENEMY = {
  bulletSpeed: 240,
  formationTop: 90,
  colSpacing: 36,
  rowSpacing: 34,
  swayAmplitude: 26,
  swayPeriodMs: 3200,
  diveSpeed: 190,
  returnDurationMs: 900,
} as const;

export const STORAGE_KEYS = {
  highScore: 'luckys-tacos-arcade:high-score',
} as const;
