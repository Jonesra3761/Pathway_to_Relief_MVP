import Phaser from 'phaser';
import { ENEMY, GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { buildSlots, type WaveConfig } from '../systems/waves';
import { Enemy } from './Enemy';

const ENTRY_DURATION_MS = 1300;
const ENTRY_STAGGER_MS = 70;

function bezier(out: Phaser.Math.Vector2, a: Phaser.Math.Vector2, c: Phaser.Math.Vector2, bx: number, by: number, t: number) {
  const u = 1 - t;
  out.set(u * u * a.x + 2 * u * t * c.x + t * t * bx, u * u * a.y + 2 * u * t * c.y + t * t * by);
  return out;
}

/**
 * Owns one wave of enemies: swooping entry, swaying formation, dive attacks
 * and enemy fire. The scene supplies callbacks for shooting so this class
 * stays independent of bullet pooling.
 */
export class EnemyFormation {
  readonly group: Phaser.Physics.Arcade.Group;
  private config!: WaveConfig;
  private waveStartTime = 0;
  private nextDiveAt = 0;
  private readonly tmp = new Phaser.Math.Vector2();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fire: (x: number, y: number, aimX?: number) => void,
    private readonly getPlayerX: () => number,
  ) {
    this.group = scene.physics.add.group({ runChildUpdate: false });
  }

  get aliveCount(): number {
    return this.group.countActive(true);
  }

  get isSettled(): boolean {
    return this.enemies().every((e) => e.state !== 'entering');
  }

  enemies(): Enemy[] {
    return this.group.getChildren().filter((c) => c.active) as Enemy[];
  }

  spawnWave(config: WaveConfig, now: number): void {
    this.config = config;
    this.group.clear(true, true);
    this.waveStartTime = now;
    const slots = buildSlots(config, ENEMY.colSpacing, ENEMY.rowSpacing);
    // First dive only after the whole formation has flown in.
    this.nextDiveAt = now + ENTRY_DURATION_MS + slots.length * ENTRY_STAGGER_MS + 1200;
    slots.forEach((slot, i) => {
      const enemy = new Enemy(this.scene, slot);
      this.group.add(enemy);
      const fromLeft = slot.col < config.rows[slot.row].count / 2;
      const startX = fromLeft ? -30 : GAME_WIDTH + 30;
      enemy.pathStart.set(startX, 120 + slot.row * 30);
      enemy.pathControl.set(GAME_WIDTH / 2 + (fromLeft ? 60 : -60), -80);
      enemy.pathStartTime = now + i * ENTRY_STAGGER_MS;
      enemy.pathDuration = ENTRY_DURATION_MS;
      enemy.setPosition(startX, enemy.pathStart.y);
      enemy.state = 'entering';
    });
  }

  /** Formation anchor; sways horizontally and breathes slightly. */
  private slotPosition(enemy: Enemy, now: number): { x: number; y: number } {
    const t = (now - this.waveStartTime) / ENEMY.swayPeriodMs;
    const sway = Math.sin(t * Math.PI * 2) * ENEMY.swayAmplitude;
    const breathe = 1 + Math.sin(t * Math.PI * 4) * 0.04;
    return {
      x: GAME_WIDTH / 2 + sway + enemy.slot.x * breathe,
      y: ENEMY.formationTop + enemy.slot.y,
    };
  }

  update(now: number, deltaMs: number): void {
    if (!this.config) return;
    const dt = deltaMs / 1000;
    const enemies = this.enemies();

    for (const e of enemies) {
      const slot = this.slotPosition(e, now);
      switch (e.state) {
        case 'entering':
        case 'returning': {
          const raw = (now - e.pathStartTime) / e.pathDuration;
          if (raw < 0) {
            e.setVisible(false);
            break;
          }
          e.setVisible(true);
          const t = Phaser.Math.Easing.Sine.Out(Math.min(1, raw));
          bezier(this.tmp, e.pathStart, e.pathControl, slot.x, slot.y, t);
          e.setRotation(Phaser.Math.Angle.Between(e.x, e.y, this.tmp.x, this.tmp.y) - Math.PI / 2);
          e.setPosition(this.tmp.x, this.tmp.y);
          if (raw >= 1) {
            e.state = 'formation';
            e.setRotation(0);
          }
          break;
        }
        case 'formation': {
          e.setPosition(slot.x, slot.y);
          if (Math.random() < this.config.fireChancePerSec * dt && this.hasClearShot(e, enemies)) {
            this.fire(e.x, e.y + 12);
          }
          break;
        }
        case 'diving':
          this.updateDiver(e, now, dt);
          break;
      }
    }

    if (now >= this.nextDiveAt) {
      this.launchDive(enemies, now);
      this.nextDiveAt = now + this.config.diveIntervalMs * Phaser.Math.FloatBetween(0.7, 1.3);
    }
  }

  /** Only the lowest enemy in a column fires from formation, so shots don't hit friends. */
  private hasClearShot(e: Enemy, enemies: Enemy[]): boolean {
    return !enemies.some(
      (o) => o !== e && o.state === 'formation' && Math.abs(o.x - e.x) < 14 && o.y > e.y,
    );
  }

  private launchDive(enemies: Enemy[], now: number): void {
    const diving = enemies.filter((e) => e.state === 'diving').length;
    if (diving >= this.config.maxDivers) return;
    const candidates = enemies.filter((e) => e.state === 'formation');
    if (candidates.length === 0) return;
    const e = Phaser.Utils.Array.GetRandom(candidates);
    e.state = 'diving';
    e.diveOriginX = e.x;
    e.diveTargetX = Phaser.Math.Clamp(this.getPlayerX() + Phaser.Math.Between(-40, 40), 20, GAME_WIDTH - 20);
    e.diveStartTime = now;
    e.diveSpeed = ENEMY.diveSpeed * this.config.diveSpeedMultiplier;
    e.diveShotsLeft = e.kind === 'chili' ? 2 : 1;
    e.nextDiveShotAt = now + Phaser.Math.Between(250, 700);
    e.setData('diveStartY', e.y);
  }

  private updateDiver(e: Enemy, now: number, dt: number): void {
    const elapsed = (now - e.diveStartTime) / 1000;
    const startY = e.getData('diveStartY') as number;
    const prevX = e.x;
    const prevY = e.y;
    // A short hop up, then accelerate down while homing in on the player's lane.
    const y = startY - 30 * Math.sin(Math.min(elapsed * 4, Math.PI)) + e.diveSpeed * Math.max(0, elapsed - 0.25) * (1 + elapsed * 0.4);
    const progress = Phaser.Math.Clamp((y - startY) / (GAME_HEIGHT - startY), 0, 1);
    const x = Phaser.Math.Linear(e.diveOriginX, e.diveTargetX, progress) + Math.sin(elapsed * 4) * 34;
    e.setPosition(x, y);
    if (dt > 0) e.setRotation(Phaser.Math.Angle.Between(prevX, prevY, x, y) - Math.PI / 2);

    if (e.diveShotsLeft > 0 && now >= e.nextDiveShotAt && y < GAME_HEIGHT - 160) {
      e.diveShotsLeft -= 1;
      e.nextDiveShotAt = now + 450;
      this.fire(e.x, e.y + 12, this.getPlayerX());
    }

    if (y > GAME_HEIGHT + 30) {
      // Wrap to the top and fly back into the formation.
      e.state = 'returning';
      e.setRotation(0);
      e.pathStart.set(Phaser.Math.Clamp(x, 20, GAME_WIDTH - 20), -30);
      e.pathControl.set(e.pathStart.x, 40);
      e.pathStartTime = now;
      e.pathDuration = ENEMY.returnDurationMs;
      e.setPosition(e.pathStart.x, e.pathStart.y);
    }
  }

  clear(): void {
    this.group.clear(true, true);
  }
}
