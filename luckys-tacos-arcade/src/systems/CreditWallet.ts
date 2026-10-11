import type { KeyValueStore } from './ScoreManager';

/**
 * Why credits moved. 'purchase' and 'promo' are reserved for the future
 * loyalty integration; Phase 1 only uses the others.
 */
export type CreditReason = 'starter' | 'refill' | 'bet' | 'payout' | 'refund' | 'purchase' | 'promo';

export interface CreditChange {
  balance: number;
  delta: number;
  reason: CreditReason;
}

type Listener = (change: CreditChange) => void;

export const WALLET_DEFAULTS = {
  startingBalance: 100,
  refillAmount: 100,
} as const;

/**
 * Play-money credit balance shared by the casino-style games.
 * Credits are whole numbers, never negative, and have no cash value.
 */
export class CreditWallet {
  private _balance: number;
  private listeners = new Set<Listener>();

  constructor(
    private readonly store: KeyValueStore | null,
    private readonly storageKey: string,
    startingBalance: number = WALLET_DEFAULTS.startingBalance,
  ) {
    const saved = this.read();
    if (saved === null) {
      this._balance = startingBalance;
      this.write();
    } else {
      this._balance = saved;
    }
  }

  get balance(): number {
    return this._balance;
  }

  canAfford(amount: number): boolean {
    return isValidAmount(amount) && amount <= this._balance;
  }

  /** Removes credits. Returns false (and changes nothing) if invalid or unaffordable. */
  spend(amount: number, reason: CreditReason = 'bet'): boolean {
    if (!this.canAfford(amount)) return false;
    this.apply(-amount, reason);
    return true;
  }

  /** Adds credits. Returns false for invalid amounts. */
  deposit(amount: number, reason: CreditReason): boolean {
    if (!isValidAmount(amount)) return false;
    this.apply(amount, reason);
    return true;
  }

  /**
   * Free play-money top-up when the player can no longer afford the minimum bet.
   * Returns the credits granted (0 if not needed).
   */
  refillIfBroke(minBet: number, amount: number = WALLET_DEFAULTS.refillAmount): number {
    if (this._balance >= minBet || !isValidAmount(amount)) return 0;
    this.apply(amount, 'refill');
    return amount;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private apply(delta: number, reason: CreditReason): void {
    this._balance += delta;
    this.write();
    const change: CreditChange = { balance: this._balance, delta, reason };
    this.listeners.forEach((l) => {
      try {
        l(change);
      } catch (err) {
        console.error('[wallet] listener failed', err);
      }
    });
  }

  private read(): number | null {
    try {
      const raw = this.store?.getItem(this.storageKey);
      if (raw === null || raw === undefined) return null;
      const value = Number.parseInt(raw, 10);
      return Number.isFinite(value) && value >= 0 ? value : null;
    } catch {
      return null;
    }
  }

  private write(): void {
    try {
      this.store?.setItem(this.storageKey, String(this._balance));
    } catch {
      // Storage unavailable; balance still works for this session.
    }
  }
}

function isValidAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0;
}
