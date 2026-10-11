import Phaser from 'phaser';
import { COLORS } from '../../config/theme';
import type { Suit } from './blackjackEngine';

export const CARD_W = 54;
export const CARD_H = 76;
export const CHIP_R = 22;
export const FELT_W = 352;
export const FELT_H = 420;
/** Betting circle centre, in felt coordinates. */
export const BET_CIRCLE_Y = 372;

/** Texture keys owned by Taco 21. Everything is drawn procedurally. */
export const BJ_TEXTURES = {
  face: 'bj-card-face',
  courtFace: 'bj-card-face-court',
  back: 'bj-card-back',
  shoe: 'bj-shoe',
  felt: 'bj-felt',
  chip: (value: number) => `bj-chip-${value}`,
  suit: (suit: Suit, big: boolean) => `bj-suit-${suit}-${big ? 'lg' : 'sm'}`,
} as const;

export const SUIT_SIZE = { lg: 26, sm: 11 } as const;

/** Chip textures carry a drop shadow; this origin puts the chip face at the image position. */
export const CHIP_ORIGIN = {
  x: (CHIP_R + 2) / (2 * (CHIP_R + 2) + 2),
  y: (CHIP_R + 2) / (2 * (CHIP_R + 2) + 3),
} as const;

/** Chip colours: base, edge spots, label colour (CSS). */
export const CHIP_STYLES: Record<number, { base: number; spot: number; ring: number; label: string }> = {
  2: { base: COLORS.cream, spot: COLORS.red, ring: COLORS.creamDark, label: '#8f1414' },
  4: { base: COLORS.lime, spot: COLORS.cream, ring: 0x5a9a2c, label: '#1a0e0a' },
  10: { base: COLORS.red, spot: COLORS.yellow, ring: COLORS.redDark, label: '#fff3d6' },
  20: { base: COLORS.dark, spot: COLORS.yellow, ring: COLORS.yellowDark, label: '#ffc300' },
};

export function isRedSuit(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

/** Creates every Taco 21 texture once per game (guarded, safe to call on every create). */
export function ensureBlackjackTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(BJ_TEXTURES.felt)) return;
  const gfx = () => scene.make.graphics({ x: 0, y: 0 }, false);

  makeCardFaces(gfx);
  makeCardBack(gfx());
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    makeSuit(gfx(), suit, SUIT_SIZE.lg, BJ_TEXTURES.suit(suit, true));
    makeSuit(gfx(), suit, SUIT_SIZE.sm, BJ_TEXTURES.suit(suit, false));
  }
  Object.keys(CHIP_STYLES).forEach((v) => makeChip(gfx(), Number(v)));
  makeShoe(gfx());
  makeFelt(gfx());
}

function makeCardFaces(gfx: () => Phaser.GameObjects.Graphics): void {
  for (const court of [false, true]) {
    const g = gfx();
    // Soft drop shadow, then the card stock.
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(2, 3, CARD_W, CARD_H, 6);
    g.fillStyle(COLORS.creamDark);
    g.fillRoundedRect(0, 0, CARD_W, CARD_H, 6);
    g.fillStyle(COLORS.cream);
    g.fillRoundedRect(1, 1, CARD_W - 2, CARD_H - 2, 5);
    if (court) {
      // Picture cards get a gold frame around the centre suit.
      g.lineStyle(2, COLORS.yellowDark);
      g.strokeRoundedRect(13, 15, CARD_W - 26, CARD_H - 30, 4);
      g.lineStyle(1, COLORS.red, 0.7);
      g.strokeRoundedRect(16, 18, CARD_W - 32, CARD_H - 36, 3);
    }
    g.generateTexture(court ? BJ_TEXTURES.courtFace : BJ_TEXTURES.face, CARD_W + 2, CARD_H + 3);
    g.destroy();
  }
}

/** Little taco shell used in the card-back pattern. */
function taco(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number): void {
  g.fillStyle(COLORS.lime);
  g.fillCircle(x - w * 0.22, y - w * 0.06, w * 0.16);
  g.fillCircle(x + w * 0.2, y - w * 0.06, w * 0.16);
  g.fillStyle(COLORS.yellow);
  g.slice(x, y - w * 0.05, w / 2, 0, Math.PI, false);
  g.fillPath();
}

function makeCardBack(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(2, 3, CARD_W, CARD_H, 6);
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(0, 0, CARD_W, CARD_H, 6);
  g.fillStyle(COLORS.red);
  g.fillRoundedRect(3, 3, CARD_W - 6, CARD_H - 6, 4);
  // Diamond lattice.
  g.lineStyle(1, COLORS.redDark, 0.9);
  for (let d = -CARD_H; d < CARD_W + CARD_H; d += 10) {
    g.lineBetween(d, 3, d + CARD_H, CARD_H + 3);
    g.lineBetween(d, CARD_H + 3, d + CARD_H, 3);
  }
  // Repaint the border over the lattice overflow.
  g.lineStyle(3, COLORS.cream);
  g.strokeRoundedRect(1.5, 1.5, CARD_W - 3, CARD_H - 3, 5);
  g.lineStyle(1.5, COLORS.yellow);
  g.strokeRoundedRect(6, 6, CARD_W - 12, CARD_H - 12, 3);
  // Taco pattern around a centre medallion.
  [
    [16, 18],
    [38, 18],
    [16, 60],
    [38, 60],
  ].forEach(([x, y]) => taco(g, x, y, 12));
  g.fillStyle(COLORS.yellow);
  g.fillCircle(CARD_W / 2, CARD_H / 2, 13);
  g.fillStyle(COLORS.red);
  g.fillCircle(CARD_W / 2, CARD_H / 2, 10.5);
  taco(g, CARD_W / 2, CARD_H / 2 + 4, 15);
  g.generateTexture(BJ_TEXTURES.back, CARD_W + 2, CARD_H + 3);
  g.destroy();
}

/** Original suit shapes built from circles and triangles (no font glyphs needed). */
function makeSuit(g: Phaser.GameObjects.Graphics, suit: Suit, s: number, key: string): void {
  g.fillStyle(isRedSuit(suit) ? COLORS.red : COLORS.dark);
  switch (suit) {
    case 'H':
      g.fillCircle(s * 0.28, s * 0.3, s * 0.27);
      g.fillCircle(s * 0.72, s * 0.3, s * 0.27);
      g.fillTriangle(s * 0.02, s * 0.38, s * 0.98, s * 0.38, s * 0.5, s * 0.98);
      break;
    case 'D':
      g.fillPoints(
        [
          new Phaser.Math.Vector2(s * 0.5, 0),
          new Phaser.Math.Vector2(s * 0.9, s * 0.5),
          new Phaser.Math.Vector2(s * 0.5, s),
          new Phaser.Math.Vector2(s * 0.1, s * 0.5),
        ],
        true,
      );
      break;
    case 'S':
      g.fillCircle(s * 0.28, s * 0.58, s * 0.25);
      g.fillCircle(s * 0.72, s * 0.58, s * 0.25);
      g.fillTriangle(s * 0.04, s * 0.52, s * 0.96, s * 0.52, s * 0.5, 0);
      g.fillTriangle(s * 0.5, s * 0.55, s * 0.3, s, s * 0.7, s);
      break;
    case 'C':
      g.fillCircle(s * 0.5, s * 0.27, s * 0.23);
      g.fillCircle(s * 0.25, s * 0.6, s * 0.23);
      g.fillCircle(s * 0.75, s * 0.6, s * 0.23);
      g.fillCircle(s * 0.5, s * 0.52, s * 0.14);
      g.fillTriangle(s * 0.5, s * 0.5, s * 0.3, s, s * 0.7, s);
      break;
  }
  g.generateTexture(key, s, s);
  g.destroy();
}

function makeChip(g: Phaser.GameObjects.Graphics, value: number): void {
  const st = CHIP_STYLES[value];
  const r = CHIP_R;
  const c = r + 2;
  g.fillStyle(0x000000, 0.35);
  g.fillCircle(c + 1, c + 2, r);
  g.fillStyle(st.base);
  g.fillCircle(c, c, r);
  // Six edge spots like a real casino chip.
  g.fillStyle(st.spot);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.slice(c, c, r, a - 0.2, a + 0.2, false);
    g.fillPath();
  }
  g.fillStyle(st.base);
  g.fillCircle(c, c, r * 0.7);
  g.lineStyle(2, st.ring);
  g.strokeCircle(c, c, r * 0.62);
  g.lineStyle(1.5, st.ring);
  g.strokeCircle(c, c, r - 0.75);
  g.generateTexture(BJ_TEXTURES.chip(value), c * 2 + 2, c * 2 + 3);
  g.destroy();
}

/** Dealing shoe: a stack of card backs in a dark box, with the next card showing in the mouth. */
function makeShoe(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(4, 8, 50, 60, 7);
  // Card backs stacked inside, visible over the top of the box.
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(7, 0, 40, 26, 3);
  g.fillStyle(COLORS.red);
  g.fillRoundedRect(9, 2, 36, 22, 2);
  g.lineStyle(1, COLORS.yellow);
  g.strokeRoundedRect(12, 5, 30, 16, 1);
  // Box body with a brass rim.
  g.fillStyle(COLORS.darkMid);
  g.fillRoundedRect(0, 14, 54, 50, 7);
  g.lineStyle(2, COLORS.yellow);
  g.strokeRoundedRect(1, 15, 52, 48, 7);
  // Mouth with the next card's back peeking out.
  g.fillStyle(COLORS.dark);
  g.fillRoundedRect(7, 32, 40, 24, 4);
  g.fillStyle(COLORS.red);
  g.fillRoundedRect(11, 36, 32, 20, 2);
  g.lineStyle(1, COLORS.yellow);
  g.strokeRoundedRect(14, 39, 26, 17, 1);
  taco(g, 27, 50, 10);
  g.generateTexture(BJ_TEXTURES.shoe, 56, 70);
  g.destroy();
}

/** Outline of the felt: square top, rounded shoulders and a wide arc toward the player. */
function feltPoints(inset: number): Phaser.Math.Vector2[] {
  const w = FELT_W;
  const shoulder = 270;
  const pts: Phaser.Math.Vector2[] = [];
  const r = 18 - inset / 2;
  const left = inset;
  const right = w - inset;
  const top = inset;
  // Top edge with rounded corners.
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (i / 6) * (Math.PI / 2);
    pts.push(new Phaser.Math.Vector2(left + r + Math.cos(a) * r, top + r + Math.sin(a) * r));
  }
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new Phaser.Math.Vector2(right - r + Math.cos(a) * r, top + r + Math.sin(a) * r));
  }
  // Half ellipse from the right shoulder round to the left one.
  const rx = (right - left) / 2;
  const ry = FELT_H - shoulder - inset;
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI;
    pts.push(new Phaser.Math.Vector2(w / 2 + Math.cos(a) * rx, shoulder + Math.sin(a) * ry));
  }
  return pts;
}

function makeFelt(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(COLORS.yellow);
  g.fillPoints(feltPoints(0), true);
  g.fillStyle(COLORS.dark);
  g.fillPoints(feltPoints(4), true);
  g.fillStyle(COLORS.redDark);
  g.fillPoints(feltPoints(6), true);
  // A gentle pool of light in the middle of the table.
  g.fillStyle(COLORS.red, 0.16);
  g.fillEllipse(FELT_W / 2, 230, 320, 300);
  g.fillStyle(COLORS.red, 0.14);
  g.fillEllipse(FELT_W / 2, 240, 230, 210);
  // Inner pinstripe that follows the rail.
  g.lineStyle(1.5, COLORS.yellow, 0.45);
  g.strokePoints(feltPoints(14), true);
  // Betting circle for the player's stake.
  g.lineStyle(2, COLORS.yellow, 0.6);
  g.strokeCircle(FELT_W / 2, BET_CIRCLE_Y, 27);
  g.generateTexture(BJ_TEXTURES.felt, FELT_W, FELT_H);
  g.destroy();
}
