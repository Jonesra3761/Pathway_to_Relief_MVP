import { describe, expect, it } from 'vitest';
import { buildSlots, getWaveConfig, pointsFor } from '../src/systems/waves';

describe('waves', () => {
  it('ramps difficulty and caps it', () => {
    const w1 = getWaveConfig(1);
    const w5 = getWaveConfig(5);
    const w50 = getWaveConfig(50);
    expect(w5.diveIntervalMs).toBeLessThan(w1.diveIntervalMs);
    expect(w5.maxDivers).toBeGreaterThan(w1.maxDivers);
    expect(w50.diveIntervalMs).toBeGreaterThanOrEqual(900);
    expect(w50.maxDivers).toBeLessThanOrEqual(5);
    expect(w50.fireChancePerSec).toBeLessThanOrEqual(0.06);
  });

  it('treats invalid wave numbers as wave 1', () => {
    expect(getWaveConfig(0).wave).toBe(1);
    expect(getWaveConfig(-3)).toEqual(getWaveConfig(1));
  });

  it('builds centered slots that fit a 360px screen', () => {
    const cfg = getWaveConfig(3);
    const slots = buildSlots(cfg, 36, 34);
    expect(slots).toHaveLength(cfg.rows.reduce((n, r) => n + r.count, 0));
    for (const row of cfg.rows.keys()) {
      const xs = slots.filter((s) => s.row === row).map((s) => s.x);
      expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0);
    }
    const maxHalfWidth = Math.max(...slots.map((s) => Math.abs(s.x)));
    // Half-width + sway + sprite radius must stay on screen.
    expect(maxHalfWidth + 26 + 16).toBeLessThanOrEqual(180);
  });

  it('doubles points for diving enemies', () => {
    expect(pointsFor('onion', false)).toBe(50);
    expect(pointsFor('onion', true)).toBe(100);
    expect(pointsFor('chili', true)).toBe(300);
  });
});
