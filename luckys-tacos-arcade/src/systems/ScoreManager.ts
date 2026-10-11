import { PLAYER } from '../config/gameConfig';

/** Minimal storage contract so tests and future backends can swap it out. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Tracks score, lives and persisted high score. Pure logic, no Phaser. */
export class ScoreManager {
  private _score = 0;
  private _lives: number;
  private _highScore: number;

  constructor(
    private readonly store: KeyValueStore | null,
    private readonly highScoreKey: string,
    private readonly startingLives: number = PLAYER.startingLives,
  ) {
    this._lives = startingLives;
    this._highScore = this.readHighScore();
  }

  get score(): number {
    return this._score;
  }
  get lives(): number {
    return this._lives;
  }
  get highScore(): number {
    return this._highScore;
  }
  get isGameOver(): boolean {
    return this._lives <= 0;
  }

  addPoints(points: number): number {
    if (points <= 0 || this.isGameOver) return this._score;
    this._score += Math.round(points);
    return this._score;
  }

  /** Removes a life and returns lives remaining. */
  loseLife(): number {
    this._lives = Math.max(0, this._lives - 1);
    return this._lives;
  }

  /** Saves the high score if beaten. Returns true when a new record was set. */
  commitHighScore(): boolean {
    if (this._score <= this._highScore) return false;
    this._highScore = this._score;
    try {
      this.store?.setItem(this.highScoreKey, String(this._highScore));
    } catch {
      // Storage can be unavailable (private mode); the record still holds in memory.
    }
    return true;
  }

  reset(): void {
    this._score = 0;
    this._lives = this.startingLives;
  }

  private readHighScore(): number {
    try {
      const raw = this.store?.getItem(this.highScoreKey);
      const value = raw ? Number.parseInt(raw, 10) : 0;
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }
}

/** Browser localStorage if usable, else null. */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
