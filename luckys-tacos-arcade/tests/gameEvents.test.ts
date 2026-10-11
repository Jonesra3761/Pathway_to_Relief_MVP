import { describe, expect, it, vi } from 'vitest';
import { GameEventBus } from '../src/services/gameEvents';
import { NoopRewardsProvider } from '../src/services/rewards';

describe('GameEventBus', () => {
  it('delivers payloads and supports unsubscribe', () => {
    const bus = new GameEventBus();
    const fn = vi.fn();
    const off = bus.on('wave:start', fn);
    bus.emit('wave:start', { wave: 2 });
    off();
    bus.emit('wave:start', { wave: 3 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ wave: 2 });
  });

  it('isolates failing handlers from the game', () => {
    const bus = new GameEventBus();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn();
    bus.on('player:hit', () => {
      throw new Error('integration down');
    });
    bus.on('player:hit', ok);
    expect(() => bus.emit('player:hit', { livesRemaining: 1 })).not.toThrow();
    expect(ok).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('NoopRewardsProvider', () => {
  it('grants nothing in Phase 1', async () => {
    await expect(new NoopRewardsProvider().onRunComplete()).resolves.toBeNull();
  });
});
