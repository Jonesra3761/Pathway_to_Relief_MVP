import type { RunSummary } from './gameEvents';

/**
 * Extension point for Phase 2+ (QR tickets, loyalty rewards, merchant rules).
 * Phase 1 ships only the no-op implementation; nothing is earned or stored.
 */
export interface RewardsProvider {
  /** Called when a run ends. May return a message to show on the game-over screen. */
  onRunComplete(summary: RunSummary): Promise<RewardResult | null>;
}

export interface RewardResult {
  headline: string;
  detail?: string;
}

export class NoopRewardsProvider implements RewardsProvider {
  async onRunComplete(): Promise<RewardResult | null> {
    return null;
  }
}

let provider: RewardsProvider = new NoopRewardsProvider();

export function getRewardsProvider(): RewardsProvider {
  return provider;
}

export function setRewardsProvider(next: RewardsProvider): void {
  provider = next;
}
