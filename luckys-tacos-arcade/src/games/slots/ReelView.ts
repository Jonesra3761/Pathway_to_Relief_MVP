import Phaser from 'phaser';
import { CSS } from '../../config/theme';
import { text } from '../../scenes/ui';
import { WILD, type SlotSymbol } from './slotsMath';
import { symbolTexture } from './textures';

/** Height of one reel row in px. */
export const CELL_H = 76;

const SYMBOL_SCALE = 0.95;
const SPIN_SPEED = 0.024; // rows per ms at full speed
const SPIN_ACCEL_MS = 160;
const KICK_ROWS = 0.3; // the reel lifts a little before it drops into the spin
const KICK_MS = 140;
const LANDING_ROWS = 5; // rows travelled while braking
const OVERSHOOT_ROWS = 0.24;
const SETTLE_MS = 190;
const MOTION_STRETCH = 0.2;

type ReelState = 'idle' | 'kick' | 'spinning' | 'stopping';

interface Cell {
  root: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  wildTag: Phaser.GameObjects.Text;
  symbol: SlotSymbol | null;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * One reel. It draws 5 cells (3 visible rows plus one above and below) from a
 * continuous position, so it can scroll at any speed and still land exactly on
 * the stop the math module picked.
 *
 * Position p is the absolute strip index shown in the middle row; spinning
 * lowers p, which moves symbols down. Cell index i shows strip[i + shift].
 * When braking, indices that have not been drawn yet are re-mapped (the
 * "splice") so the reel lands on the chosen stop after a fixed braking
 * distance; nothing already on screen ever changes.
 */
export class ReelView {
  readonly container: Phaser.GameObjects.Container;
  private readonly cells: Cell[] = [];
  private pos: number;
  private shift = 0;
  private splice: { below: number; shift: number } | null = null;
  private state: ReelState = 'idle';
  private speed = 0;
  private spinElapsed = 0;
  private motion = 0; // 0..1, drives the stretch "blur"
  private tween: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    private readonly midY: number,
    private readonly strip: readonly SlotSymbol[],
    stop: number,
  ) {
    this.pos = stop;
    this.container = scene.add.container(x, 0);
    for (let k = 0; k < 5; k++) {
      const image = scene.add.image(0, 0, symbolTexture(strip[0])).setScale(SYMBOL_SCALE);
      const wildTag = text(scene, 0, 27, 'WILD', 11, CSS.yellow).setStroke(CSS.dark, 4);
      const root = scene.add.container(0, 0, [image, wildTag]);
      this.container.add(root);
      this.cells.push({ root, image, wildTag, symbol: null });
    }
    this.render();
  }

  get spinning(): boolean {
    return this.state !== 'idle';
  }

  /** The symbol image in a visible row (0 = top). Only meaningful while idle. */
  imageForRow(row: number): Phaser.GameObjects.Image {
    return this.cells[row + 1].image;
  }

  /** Lift, then spin until stopAt() is called. */
  startSpin(delayMs = 0): void {
    this.tween?.stop();
    this.splice = null;
    this.state = 'kick';
    this.speed = 0;
    this.spinElapsed = 0;
    this.resetImages();
    const from = this.pos;
    this.tween = this.scene.tweens.addCounter({
      from,
      to: from + KICK_ROWS,
      delay: delayMs,
      duration: KICK_MS,
      ease: 'Sine.out',
      onUpdate: (tw) => this.moveTo(tw.getValue() ?? from),
      onComplete: () => {
        this.tween = null;
        if (this.state === 'kick') this.state = 'spinning';
      },
    });
  }

  update(deltaMs: number): void {
    if (this.state !== 'spinning') return;
    this.spinElapsed += deltaMs;
    this.speed = SPIN_SPEED * Math.min(1, this.spinElapsed / SPIN_ACCEL_MS);
    this.motion = this.speed / SPIN_SPEED;
    this.moveTo(this.pos - this.speed * deltaMs);
  }

  /** Brakes with a small bounce and lands with `stop` in the middle row. */
  stopAt(stop: number, onLanded: () => void): void {
    this.tween?.stop();
    this.tween = null;
    if (this.state === 'idle') {
      this.snapTo(stop);
      onLanded();
      return;
    }
    const speed = Math.max(this.speed, SPIN_SPEED * 0.6);
    const base = Math.floor(this.pos);
    // Rows base-2..base+2 are on screen; anything at or below base-3 is not drawn yet.
    const below = base - 3;
    const len = this.strip.length;
    // Brake a row or two longer if needed so the seam never shows the same symbol twice in a row.
    const aboveSeam = this.symbolFor(below + 1);
    let target = base - LANDING_ROWS;
    for (let extra = 0; extra < 4; extra++) {
      const t = base - LANDING_ROWS - extra;
      if (this.strip[mod(below + stop - t, len)] !== aboveSeam) {
        target = t;
        break;
      }
    }
    this.splice = { below, shift: mod(stop - target, len) };
    this.state = 'stopping';
    const from = this.pos;
    const to = target - OVERSHOOT_ROWS;
    // Quad.out starts at 2 x average speed, so this keeps the velocity continuous.
    const duration = (2 * (from - to)) / speed;
    this.tween = this.scene.tweens.addCounter({
      from,
      to,
      duration,
      ease: 'Quad.out',
      onUpdate: (tw) => {
        this.motion = 1 - tw.progress;
        this.moveTo(tw.getValue() ?? to);
      },
      onComplete: () => {
        this.motion = 0;
        this.tween = this.scene.tweens.addCounter({
          from: to,
          to: target,
          duration: SETTLE_MS,
          ease: 'Back.out',
          onUpdate: (tw) => this.moveTo(tw.getValue() ?? target),
          onComplete: () => {
            this.tween = null;
            this.snapTo(stop);
            onLanded();
          },
        });
      },
    });
  }

  /** Stops any win pulse on the symbols and redraws them at rest size. */
  redraw(): void {
    this.resetImages();
    this.render();
  }

  /** Jumps straight to a stop with no animation. */
  snapTo(stop: number): void {
    this.state = 'idle';
    this.speed = 0;
    this.motion = 0;
    this.shift = 0;
    this.splice = null;
    this.pos = mod(stop, this.strip.length);
    this.render();
  }

  private moveTo(pos: number): void {
    this.pos = pos;
    this.render();
  }

  private symbolFor(index: number): SlotSymbol {
    const shift = this.splice && index <= this.splice.below ? this.splice.shift : this.shift;
    return this.strip[mod(index + shift, this.strip.length)];
  }

  private resetImages(): void {
    this.cells.forEach((c) => this.scene.tweens.killTweensOf(c.image));
  }

  private render(): void {
    const base = Math.floor(this.pos);
    const stretch = 1 + MOTION_STRETCH * this.motion;
    this.cells.forEach((cell, k) => {
      const index = base + k - 2;
      cell.root.y = this.midY + (index - this.pos) * CELL_H;
      const symbol = this.symbolFor(index);
      if (symbol !== cell.symbol) {
        cell.symbol = symbol;
        cell.image.setTexture(symbolTexture(symbol));
        cell.wildTag.setVisible(symbol === WILD);
      }
      cell.image.setScale(SYMBOL_SCALE, SYMBOL_SCALE * stretch).setAlpha(1 - 0.18 * this.motion);
    });
  }
}
