import Phaser from 'phaser';
import { COLORS } from '../../config/theme';
import type { SlotSymbol } from './slotsMath';

/** Texture keys owned by Taco Slots. Symbols use symbolTexture(). */
export const SLOTS_TEXTURES = {
  coin: 'slots-coin',
  bulb: 'slots-bulb',
  sparkle: 'slots-sparkle',
  shade: 'slots-shade',
} as const;

/** Symbol textures are square; the reels draw them at this size. */
export const SYMBOL_SIZE = 64;

export function symbolTexture(symbol: SlotSymbol): string {
  return `slots-sym-${symbol}`;
}

// A few food colours that sit outside the core brand palette.
const GREEN_DARK = 0x2f5d1e;
const GREEN_MID = 0x3f7a22;
const AVOCADO_FLESH = 0xdcec9a;
const PIT = 0x8a5a2b;
const PIT_DARK = 0x5e3a1a;
const LIME_PITH = 0xeef7c8;
const LIME_JUICE = 0x9fd35a;
const ONION_SKIN = 0xe0a24a;
const ONION_EDGE = 0x9c5a1c;
const ONION_LINE = 0xb87430;
const ONION_SHINE = 0xf6cf8a;
const CHILI_SHINE = 0xff6b6b;

type Draw = (g: Phaser.GameObjects.Graphics) => void;

/**
 * Draws every Taco Slots texture once (original art, brand palette).
 * Safe to call on every create(); existing keys are skipped.
 */
export function ensureSlotsTextures(scene: Phaser.Scene): void {
  const make = (key: string, w: number, h: number, draw: Draw) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  const S = SYMBOL_SIZE;
  make(symbolTexture('taco'), S, S, drawLuckyTaco);
  make(symbolTexture('sauce'), S, S, drawHotSauce);
  make(symbolTexture('chili'), S, S, drawChili);
  make(symbolTexture('avocado'), S, S, drawAvocado);
  make(symbolTexture('lime'), S, S, drawLime);
  make(symbolTexture('onion'), S, S, drawOnion);
  make(SLOTS_TEXTURES.coin, 20, 20, drawCoin);
  make(SLOTS_TEXTURES.bulb, 12, 12, (g) => {
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(6, 6, 6);
    g.fillStyle(0xffffff);
    g.fillCircle(6, 6, 4);
  });
  make(SLOTS_TEXTURES.sparkle, 16, 16, (g) => {
    g.fillStyle(0xffffff);
    g.fillPoints(starPoints(8, 8, 4, 8, 2), true);
  });
  // Soft dark fade used at the top and bottom of the reel window (no shaders needed).
  make(SLOTS_TEXTURES.shade, 4, 40, (g) => {
    for (let y = 0; y < 40; y++) {
      g.fillStyle(COLORS.dark, 0.6 * Math.pow(1 - y / 40, 1.8));
      g.fillRect(0, y, 4, 1);
    }
  });
}

/** Alternating outer/inner radius polygon, pointing up. */
function starPoints(cx: number, cy: number, points: number, outer: number, inner: number): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out;
}

/** Wild / top symbol: a grinning taco on a red starburst. */
function drawLuckyTaco(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(COLORS.yellowDark);
  g.fillPoints(starPoints(32, 32, 12, 32, 25), true);
  g.fillStyle(COLORS.red);
  g.fillPoints(starPoints(32, 32, 12, 30, 23), true);
  g.fillStyle(COLORS.redDark);
  g.fillCircle(32, 32, 19);

  // Toppings peek over the shell.
  g.fillStyle(COLORS.lime);
  [13, 19, 25, 31, 37, 43, 49].forEach((x, i) => g.fillCircle(x, 29 - (i % 2) * 2, 5));
  g.fillStyle(COLORS.red);
  [18, 30, 42].forEach((x) => g.fillCircle(x, 25, 3.5));
  g.fillStyle(COLORS.cream);
  [24, 36, 47].forEach((x) => g.fillCircle(x, 24, 2.5));

  // Shell (bottom half-disc).
  g.fillStyle(COLORS.yellowDark);
  g.slice(32, 30, 24, 0, Math.PI, false);
  g.fillPath();
  g.fillStyle(COLORS.yellow);
  g.slice(32, 30, 21.5, 0, Math.PI, false);
  g.fillPath();
  g.fillStyle(COLORS.yellowDark);
  [[15, 35], [47, 36], [22, 46], [42, 46]].forEach(([x, y]) => g.fillCircle(x, y, 1.6));

  // Happy face.
  g.fillStyle(COLORS.dark);
  g.fillCircle(26, 37, 2.6);
  g.fillCircle(38, 37, 2.6);
  g.fillStyle(0xffffff);
  g.fillCircle(26.8, 36.2, 0.9);
  g.fillCircle(38.8, 36.2, 0.9);
  g.lineStyle(2.2, COLORS.dark);
  g.beginPath();
  g.arc(32, 40, 6, Math.PI * 0.18, Math.PI * 0.82, false);
  g.strokePath();

  // Lucky sparkle.
  g.fillStyle(COLORS.cream);
  g.fillPoints(starPoints(53, 11, 4, 7, 2), true);
}

/** Hot sauce bottle with a flame label. */
function drawHotSauce(g: Phaser.GameObjects.Graphics): void {
  // Body + shoulders + neck, with a dark edge.
  g.fillStyle(COLORS.redDark);
  g.fillRoundedRect(17, 23, 30, 39, 7);
  g.fillRoundedRect(25, 9, 14, 20, 3);
  g.fillStyle(COLORS.red);
  g.fillRoundedRect(19, 25, 26, 35, 6);
  g.fillEllipse(32, 27, 24, 10);
  g.fillRect(27, 11, 10, 16);
  // Cap.
  g.fillStyle(COLORS.yellowDark);
  g.fillRoundedRect(24, 2, 16, 11, 3);
  g.fillStyle(COLORS.yellow);
  g.fillRoundedRect(25, 2, 14, 8, 3);
  // Label with a flame.
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(22, 33, 20, 20, 3);
  g.fillStyle(COLORS.red);
  g.fillCircle(32, 46, 5);
  g.fillTriangle(27, 45, 37, 45, 33, 35);
  g.fillStyle(COLORS.yellow);
  g.fillCircle(32, 47, 2.5);
  g.fillTriangle(30, 47, 34, 47, 32.5, 42);
  // Glass shine.
  g.fillStyle(COLORS.cream, 0.5);
  g.fillRoundedRect(21, 28, 3, 28, 1.5);
  g.fillRect(29, 12, 2, 12);
}

/** Curved red chili with a green cap. */
function drawChili(g: Phaser.GameObjects.Graphics): void {
  const p0 = { x: 22, y: 18 };
  const p1 = { x: 56, y: 22 };
  const p2 = { x: 38, y: 60 };
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });
  const radius = (t: number) => 10.5 - 8.5 * t;
  const steps = 40;
  for (const [color, grow] of [
    [COLORS.redDark, 1.8],
    [COLORS.red, 0],
  ] as const) {
    g.fillStyle(color);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = at(t);
      g.fillCircle(p.x, p.y, radius(t) + grow);
    }
  }
  g.fillStyle(CHILI_SHINE);
  for (let i = 4; i <= 22; i++) {
    const t = i / steps;
    const p = at(t);
    g.fillCircle(p.x - radius(t) * 0.35, p.y - radius(t) * 0.45, radius(t) * 0.28);
  }
  // Cap and stem.
  g.fillStyle(GREEN_MID);
  g.fillEllipse(21, 15, 18, 10);
  g.fillStyle(COLORS.lime);
  g.fillEllipse(21, 14, 15, 7);
  g.lineStyle(4, GREEN_MID);
  g.lineBetween(19, 12, 12, 3);
}

/** Half an avocado with its pit. */
function drawAvocado(g: Phaser.GameObjects.Graphics): void {
  const pear = (inset: number, color: number) => {
    g.fillStyle(color);
    g.fillCircle(32, 22, 13 - inset);
    g.fillCircle(32, 42, 19 - inset);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(19 + inset, 22),
        new Phaser.Math.Vector2(45 - inset, 22),
        new Phaser.Math.Vector2(51 - inset, 42),
        new Phaser.Math.Vector2(13 + inset, 42),
      ],
      true,
    );
  };
  pear(-1.5, GREEN_DARK);
  pear(1, GREEN_MID);
  pear(3, COLORS.lime);
  pear(6, AVOCADO_FLESH);
  g.fillStyle(PIT_DARK);
  g.fillCircle(32, 42, 10.5);
  g.fillStyle(PIT);
  g.fillCircle(32, 42, 9);
  g.fillStyle(COLORS.cream, 0.55);
  g.fillCircle(28.5, 38.5, 2.6);
}

/** Lime slice with juicy wedges. */
function drawLime(g: Phaser.GameObjects.Graphics): void {
  const cx = 32;
  const cy = 32;
  g.fillStyle(GREEN_MID);
  g.fillCircle(cx, cy, 27);
  g.fillStyle(COLORS.lime);
  g.fillCircle(cx, cy, 24.5);
  g.fillStyle(LIME_PITH);
  g.fillCircle(cx, cy, 22);
  const wedges = 8;
  g.fillStyle(LIME_JUICE);
  for (let i = 0; i < wedges; i++) {
    const a0 = (i / wedges) * Math.PI * 2 + 0.09;
    const a1 = ((i + 1) / wedges) * Math.PI * 2 - 0.09;
    g.slice(cx, cy, 19.5, a0, a1, false);
    g.fillPath();
  }
  g.fillStyle(LIME_PITH);
  g.fillCircle(cx, cy, 3.5);
  g.fillStyle(0xffffff, 0.6);
  g.fillEllipse(cx - 8, cy - 10, 5, 3);
  g.fillEllipse(cx + 10, cy + 5, 4, 2.5);
}

/** Golden onion with a green sprout. */
function drawOnion(g: Phaser.GameObjects.Graphics): void {
  // Sprout behind the bulb.
  g.fillStyle(GREEN_MID);
  g.fillTriangle(28, 16, 33, 16, 25, 1);
  g.fillStyle(COLORS.lime);
  g.fillTriangle(31, 16, 36, 16, 40, 2);
  // Bulb: round body tapering to a point.
  g.fillStyle(ONION_EDGE);
  g.fillCircle(32, 40, 21);
  g.fillTriangle(14, 34, 50, 34, 32, 10);
  g.fillStyle(ONION_SKIN);
  g.fillCircle(32, 40, 19);
  g.fillTriangle(16.5, 34, 47.5, 34, 32, 13);
  // Layers.
  g.lineStyle(1.6, ONION_LINE);
  g.beginPath();
  g.arc(46, 40, 20, Math.PI * 0.68, Math.PI * 1.3, false);
  g.strokePath();
  g.beginPath();
  g.arc(18, 40, 20, Math.PI * 1.7, Math.PI * 0.32, false);
  g.strokePath();
  g.lineBetween(32, 16, 32, 58);
  // Shine.
  g.fillStyle(ONION_SHINE);
  g.fillEllipse(24, 36, 5, 12);
  // Roots.
  g.lineStyle(1.6, COLORS.creamDark);
  g.lineBetween(29, 59, 27, 63);
  g.lineBetween(32, 60, 32, 64);
  g.lineBetween(35, 59, 37, 63);
}

function drawCoin(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(COLORS.yellowDark);
  g.fillCircle(10, 10, 10);
  g.fillStyle(COLORS.yellow);
  g.fillCircle(10, 10, 8);
  g.lineStyle(1.5, COLORS.yellowDark);
  g.strokeCircle(10, 10, 5);
  g.fillStyle(COLORS.cream, 0.8);
  g.fillEllipse(7, 6, 4, 2.5);
}
