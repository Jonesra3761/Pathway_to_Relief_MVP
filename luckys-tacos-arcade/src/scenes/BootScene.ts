import Phaser from 'phaser';
import { COLORS } from '../config/theme';
import { SCENES, TEXTURES } from './keys';

/**
 * Draws every texture procedurally so Phase 1 ships with zero binary assets.
 * Swapping in illustrated sprites later only means loading files under the same keys.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    this.makePlayer(TEXTURES.player, 1);
    this.makePlayer(TEXTURES.lifeIcon, 0.5);
    this.makeBullets();
    this.makeEnemies();
    this.makeParticles();
    this.scene.start(SCENES.menu);
  }

  private gfx(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 }, false);
  }

  /** The "Taco Cruiser": a crunchy shell loaded with toppings and a salsa cannon. */
  private makePlayer(key: string, scale: number): void {
    const g = this.gfx();
    g.setScale(scale);
    // Thruster fins.
    g.fillStyle(COLORS.red);
    g.fillTriangle(2, 30, 10, 20, 12, 34);
    g.fillTriangle(42, 30, 34, 20, 32, 34);
    // Salsa cannon.
    g.fillStyle(COLORS.creamDark);
    g.fillRect(19, 0, 6, 10);
    g.fillStyle(COLORS.red);
    g.fillRect(19, 0, 6, 3);
    // Toppings.
    g.fillStyle(COLORS.lime);
    [8, 15, 22, 29, 36].forEach((x) => g.fillCircle(x, 15, 5));
    g.fillStyle(COLORS.red);
    [12, 25, 33].forEach((x) => g.fillCircle(x, 13, 3));
    g.fillStyle(COLORS.cream);
    [18, 29].forEach((x) => g.fillCircle(x, 11, 2.5));
    // Shell.
    g.fillStyle(COLORS.yellowDark);
    g.slice(22, 17, 19, 0, Math.PI, false);
    g.fillPath();
    g.fillStyle(COLORS.yellow);
    g.slice(22, 17, 17, 0, Math.PI, false);
    g.fillPath();
    g.fillStyle(COLORS.yellowDark);
    [[14, 22], [24, 26], [30, 21], [19, 30]].forEach(([x, y]) => g.fillCircle(x, y, 1.6));
    g.generateTexture(key, Math.ceil(44 * scale), Math.ceil(37 * scale));
    g.destroy();
  }

  private makeBullets(): void {
    // Hot-sauce drop.
    let g = this.gfx();
    g.fillStyle(COLORS.red);
    g.fillTriangle(4, 0, 0, 9, 8, 9);
    g.fillCircle(4, 10, 4);
    g.fillStyle(COLORS.yellow);
    g.fillCircle(3, 10, 1.5);
    g.generateTexture(TEXTURES.playerBullet, 8, 14);
    g.destroy();

    // Spicy seed.
    g = this.gfx();
    g.fillStyle(COLORS.yellow);
    g.fillEllipse(4, 6, 8, 12);
    g.fillStyle(COLORS.cream);
    g.fillEllipse(3, 4, 3, 5);
    g.generateTexture(TEXTURES.enemyBullet, 8, 12);
    g.destroy();
  }

  private drawEyes(g: Phaser.GameObjects.Graphics, cx: number, cy: number, spread: number): void {
    g.fillStyle(0xffffff);
    g.fillCircle(cx - spread, cy, 3.5);
    g.fillCircle(cx + spread, cy, 3.5);
    g.fillStyle(COLORS.dark);
    g.fillCircle(cx - spread + 0.8, cy + 0.8, 1.8);
    g.fillCircle(cx + spread - 0.8, cy + 0.8, 1.8);
    // Angry brows.
    g.lineStyle(2, COLORS.dark);
    g.lineBetween(cx - spread - 4, cy - 6, cx - spread + 3, cy - 3);
    g.lineBetween(cx + spread + 4, cy - 6, cx + spread - 3, cy - 3);
  }

  private makeEnemies(): void {
    // Chili Commander (2 hits).
    let g = this.gfx();
    g.fillStyle(COLORS.lime);
    g.fillRect(14, 0, 4, 7);
    g.fillEllipse(16, 6, 12, 5);
    g.fillStyle(COLORS.redDark);
    g.fillEllipse(16, 17, 26, 20);
    g.fillTriangle(6, 20, 26, 20, 16, 30);
    g.fillStyle(COLORS.red);
    g.fillEllipse(16, 16, 22, 17);
    g.fillTriangle(8, 19, 24, 19, 16, 28);
    g.fillStyle(0xff6b6b);
    g.fillEllipse(10, 12, 5, 3);
    this.drawEyes(g, 16, 16, 5);
    g.generateTexture('enemy-chili', 32, 31);
    g.destroy();

    // Bell Pepper Bandit.
    g = this.gfx();
    g.fillStyle(COLORS.lime);
    g.fillRect(12, 0, 4, 6);
    g.fillStyle(COLORS.yellowDark);
    g.fillCircle(8, 14, 8);
    g.fillCircle(20, 14, 8);
    g.fillCircle(14, 18, 9);
    g.fillStyle(COLORS.yellow);
    g.fillCircle(8, 13, 6.5);
    g.fillCircle(20, 13, 6.5);
    g.fillCircle(14, 17, 7.5);
    this.drawEyes(g, 14, 14, 5);
    g.generateTexture('enemy-pepper', 28, 27);
    g.destroy();

    // Onion Ogre.
    g = this.gfx();
    g.fillStyle(COLORS.lime);
    g.fillTriangle(12, 0, 16, 0, 14, 7);
    g.fillStyle(COLORS.creamDark);
    g.fillEllipse(14, 16, 26, 22);
    g.fillStyle(COLORS.cream);
    g.fillEllipse(14, 15, 22, 19);
    g.lineStyle(1, COLORS.creamDark);
    g.strokeEllipse(14, 16, 12, 18);
    this.drawEyes(g, 14, 15, 5);
    g.generateTexture('enemy-onion', 28, 28);
    g.destroy();
  }

  private makeParticles(): void {
    let g = this.gfx();
    g.fillStyle(0xffffff);
    g.fillCircle(3, 3, 3);
    g.generateTexture(TEXTURES.spark, 6, 6);
    g.destroy();

    g = this.gfx();
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture(TEXTURES.star, 2, 2);
    g.destroy();
  }
}
