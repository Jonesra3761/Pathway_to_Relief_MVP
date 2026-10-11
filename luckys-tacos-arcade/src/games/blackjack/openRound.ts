import type { KeyValueStore } from '../../systems/ScoreManager';
import { MAX_ROUND_WAGER, type Bank } from './blackjackEngine';

export const OPEN_ROUND_KEY = 'luckys-tacos-arcade:blackjack-open-round';

/**
 * Write-ahead note of the credits riding on an unfinished hand. The stake is
 * saved with the wallet the moment it is taken, but the round itself only
 * lives in memory. If the browser discards the tab without a 'pagehide'
 * (common for backgrounded mobile tabs) the next visit refunds the note.
 */
export class OpenRoundLog {
  constructor(private readonly store: KeyValueStore | null) {}

  /** Records the round's total stake so far; call after every stake taken. */
  save(wagered: number): void {
    try {
      this.store?.setItem(OPEN_ROUND_KEY, String(wagered));
    } catch {
      // Storage unavailable: pagehide/shutdown settlement still covers normal exits.
    }
  }

  /** The round was paid out; nothing is owed any more. */
  clear(): void {
    try {
      this.store?.setItem(OPEN_ROUND_KEY, '0');
    } catch {
      // See save().
    }
  }

  /** Credits left on a round that never settled (0 if none). Capped at one round's maximum stake. */
  pending(): number {
    try {
      const value = Number.parseInt(this.store?.getItem(OPEN_ROUND_KEY) ?? '', 10);
      return Number.isInteger(value) && value > 0 ? Math.min(value, MAX_ROUND_WAGER) : 0;
    } catch {
      return 0;
    }
  }
}

/**
 * Refunds a round a previous page left unsettled. The cards are gone, so the
 * hand is void and its whole stake comes back as a 'refund'. Returns the
 * credits refunded; `onRefund` reports it like any other settled round.
 */
export function recoverOpenRound(
  log: OpenRoundLog,
  bank: Pick<Bank, 'deposit'>,
  onRefund: (wagered: number) => void,
): number {
  const owed = log.pending();
  if (owed <= 0) return 0;
  bank.deposit(owed, 'refund');
  log.clear();
  onRefund(owed);
  return owed;
}
