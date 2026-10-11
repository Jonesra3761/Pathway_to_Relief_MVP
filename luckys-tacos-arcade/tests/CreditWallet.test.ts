import { describe, expect, it, vi } from 'vitest';
import { CreditWallet } from '../src/systems/CreditWallet';
import type { KeyValueStore } from '../src/systems/ScoreManager';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('CreditWallet', () => {
  it('grants the starting balance once and persists it', () => {
    const store = new MemoryStore();
    const a = new CreditWallet(store, 'c', 100);
    expect(a.balance).toBe(100);
    a.spend(30);
    const b = new CreditWallet(store, 'c', 100);
    expect(b.balance).toBe(70);
  });

  it('keeps a saved zero balance instead of re-granting starter credits', () => {
    const store = new MemoryStore();
    const a = new CreditWallet(store, 'c', 100);
    a.spend(100);
    expect(new CreditWallet(store, 'c', 100).balance).toBe(0);
  });

  it('rejects overspending, fractions, zero and negatives without changing balance', () => {
    const w = new CreditWallet(null, 'c', 10);
    expect(w.spend(11)).toBe(false);
    expect(w.spend(1.5)).toBe(false);
    expect(w.spend(0)).toBe(false);
    expect(w.spend(-5)).toBe(false);
    expect(w.deposit(-5, 'payout')).toBe(false);
    expect(w.deposit(2.5, 'payout')).toBe(false);
    expect(w.balance).toBe(10);
    expect(w.spend(10)).toBe(true);
    expect(w.balance).toBe(0);
  });

  it('refills only when the player cannot afford the minimum bet', () => {
    const w = new CreditWallet(null, 'c', 10);
    expect(w.refillIfBroke(5, 100)).toBe(0);
    w.spend(8);
    expect(w.refillIfBroke(5, 100)).toBe(100);
    expect(w.balance).toBe(102);
  });

  it('notifies listeners with delta and reason, and isolates failures', () => {
    const w = new CreditWallet(null, 'c', 50);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: unknown[] = [];
    w.onChange(() => {
      throw new Error('boom');
    });
    const off = w.onChange((c) => seen.push(c));
    w.spend(20, 'bet');
    w.deposit(40, 'payout');
    off();
    w.spend(1);
    expect(seen).toEqual([
      { balance: 30, delta: -20, reason: 'bet' },
      { balance: 70, delta: 40, reason: 'payout' },
    ]);
    err.mockRestore();
  });

  it('ignores corrupt stored values', () => {
    const store = new MemoryStore();
    store.setItem('c', 'banana');
    expect(new CreditWallet(store, 'c', 100).balance).toBe(100);
    store.setItem('c', '-40');
    expect(new CreditWallet(store, 'c', 100).balance).toBe(100);
  });
});
