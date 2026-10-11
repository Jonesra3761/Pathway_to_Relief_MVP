import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { COLORS, CSS, FONT_FAMILY } from '../config/theme';
import { TEXTURES } from '../scenes/keys';

const label = (scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 12) =>
  scene.add
    .text(x, y, text, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, fontStyle: 'bold' })
    .setResolution(2)
    .setDepth(20);

export class Hud {
  private scoreText: Phaser.GameObjects.Text;
  private highText: Phaser.GameObjects.Text;
  private waveText: Phaser.GameObjects.Text;
  private lifeIcons: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    scene.add.rectangle(GAME_WIDTH / 2, 22, GAME_WIDTH, 44, COLORS.dark, 0.85).setDepth(19);
    scene.add.rectangle(GAME_WIDTH / 2, 44, GAME_WIDTH, 2, COLORS.red).setDepth(19);
    label(scene, 10, 6, 'SCORE', CSS.red, 10);
    this.scoreText = label(scene, 10, 19, '0', CSS.cream, 16);
    label(scene, GAME_WIDTH / 2, 6, 'HIGH', CSS.red, 10).setOrigin(0.5, 0);
    this.highText = label(scene, GAME_WIDTH / 2, 19, '0', CSS.yellow, 16).setOrigin(0.5, 0);
    label(scene, GAME_WIDTH - 10, 6, 'WAVE', CSS.red, 10).setOrigin(1, 0);
    this.waveText = label(scene, GAME_WIDTH - 10, 19, '1', CSS.cream, 16).setOrigin(1, 0);
  }

  setScore(score: number, high: number): void {
    this.scoreText.setText(score.toLocaleString());
    this.highText.setText(Math.max(score, high).toLocaleString());
  }

  setWave(wave: number): void {
    this.waveText.setText(String(wave));
  }

  /** Spare lives shown bottom-left (the ship in play is not counted). */
  setLives(lives: number): void {
    this.lifeIcons.forEach((i) => i.destroy());
    this.lifeIcons = [];
    for (let i = 0; i < lives - 1; i++) {
      this.lifeIcons.push(
        this.scene.add.image(18 + i * 26, GAME_HEIGHT - 14, TEXTURES.lifeIcon).setDepth(20),
      );
    }
  }

  /** Big centered banner that fades out. */
  banner(text: string, sub?: string, durationMs = 1400): void {
    const title = label(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, text, CSS.yellow, 30)
      .setOrigin(0.5)
      .setStroke(CSS.red, 6);
    const items: Phaser.GameObjects.Text[] = [title];
    if (sub) items.push(label(this.scene, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 18, sub, CSS.cream, 14).setOrigin(0.5));
    this.scene.tweens.add({
      targets: items,
      alpha: { from: 1, to: 0 },
      delay: durationMs * 0.6,
      duration: durationMs * 0.4,
      onComplete: () => items.forEach((i) => i.destroy()),
    });
  }

  /** Floating point popup where an enemy died. */
  popup(x: number, y: number, points: number): void {
    const t = label(this.scene, x, y, `+${points}`, CSS.yellow, 11).setOrigin(0.5);
    this.scene.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }
}
