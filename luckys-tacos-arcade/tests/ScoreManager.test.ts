import { describe, expect, it } from 'vitest';
import { ScoreManager, type KeyValueStore } from '../src/systems/ScoreManager';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('ScoreManager', () => {
  it('starts with three lives and zero score', () => {
    const s = new ScoreManager(new MemoryStore(), 'hs');
    expect(s.lives).toBe(3);
    expect(s.score).toBe(0);
    expect(s.isGameOver).toBe(false);
  });

  it('adds points and ignores non-positive values', () => {
    const s = new ScoreManager(null, 'hs');
    s.addPoints(50);
    s.addPoints(-10);
    s.addPoints(0);
    expect(s.score).toBe(50);
  });

  it('ends the game after three lost lives and never goes negative', () => {
    const s = new ScoreManager(null, 'hs');
    expect(s.loseLife()).toBe(2);
    expect(s.loseLife()).toBe(1);
    expect(s.loseLife()).toBe(0);
    expect(s.isGameOver).toBe(true);
    expect(s.loseLife()).toBe(0);
    s.addPoints(100);
    expect(s.score).toBe(0);
  });

  it('persists and reloads the high score only when beaten', () => {
    const store = new MemoryStore();
    const a = new ScoreManager(store, 'hs');
    a.addPoints(300);
    expect(a.commitHighScore()).toBe(true);
    const b = new ScoreManager(store, 'hs');
    expect(b.highScore).toBe(300);
    b.addPoints(200);
    expect(b.commitHighScore()).toBe(false);
    expect(store.getItem('hs')).toBe('300');
  });

  it('survives broken storage', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const s = new ScoreManager(broken, 'hs');
    expect(s.highScore).toBe(0);
    s.addPoints(10);
    expect(s.commitHighScore()).toBe(true);
    expect(s.highScore).toBe(10);
  });

  it('reset restores lives and score but keeps high score', () => {
    const s = new ScoreManager(new MemoryStore(), 'hs');
    s.addPoints(80);
    s.commitHighScore();
    s.loseLife();
    s.reset();
    expect(s.score).toBe(0);
    expect(s.lives).toBe(3);
    expect(s.highScore).toBe(80);
  });
});
