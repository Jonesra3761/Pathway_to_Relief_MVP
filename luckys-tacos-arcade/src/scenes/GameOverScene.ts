import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { COLORS, CSS } from '../config/theme';
import { Starfield } from '../entities/Starfield';
import type { RunSummary } from '../services/gameEvents';
import { getRewardsProvider } from '../services/rewards';
import { SCENES } from './keys';
import { button, text } from './ui';

const INPUT_LOCK_MS = 700;

export class GameOverScene extends Phaser.Scene {
  private stars!: Starfield;
  private summary!: RunSummary;
  private readyAt = 0;
  private leaving = false;

  constructor() {
    super(SCENES.gameOver);
  }

  init(data: RunSummary): void {
    this.summary = data;
    this.leaving = false;
  }

  create(): void {
    const s = this.summary;
    const cx = GAME_WIDTH / 2;
    this.readyAt = this.time.now + INPUT_LOCK_MS;
    this.cameras.main.setBackgroundColor(COLORS.dark);
    this.stars = new Starfield(this);

    text(this, cx, 110, 'GAME OVER', 40, CSS.yellow).setStroke(CSS.red, 8);

    this.add.rectangle(cx, 250, 280, 170, COLORS.darkMid).setStrokeStyle(3, COLORS.red);
    text(this, cx, 190, 'FINAL SCORE', 14, CSS.red);
    const scoreText = text(this, cx, 226, '0', 40, CSS.cream);
    this.tweens.addCounter({
      from: 0,
      to: s.score,
      duration: Math.min(1200, 200 + s.score / 10),
      onUpdate: (tw) => scoreText.setText(Math.round(tw.getValue() ?? 0).toLocaleString()),
    });
    text(this, cx, 272, `Wave ${s.wave}  ·  ${s.enemiesDestroyed} baddies busted`, 13, CSS.cream).setAlpha(0.85);
    text(this, cx, 304, `HIGH SCORE  ${s.highScore.toLocaleString()}`, 14, CSS.yellow);

    if (s.newHighScore) {
      const badge = text(this, cx, 156, '★ NEW HIGH SCORE! ★', 16, CSS.dark).setPadding(10, 4, 10, 4);
      badge.setBackgroundColor(CSS.yellow);
      this.tweens.add({ targets: badge, scale: 1.1, duration: 400, yoyo: true, repeat: -1 });
    }

    // Phase 2 hook: a rewards provider can attach a message (e.g. a QR ticket). No-op today.
    const rewardText = text(this, cx, 360, '', 14, CSS.yellow).setWordWrapWidth(280);
    getRewardsProvider()
      .onRunComplete(s)
      .then((result) => {
        if (result && this.scene.isActive()) rewardText.setText([result.headline, result.detail ?? ''].join('\n'));
      })
      .catch((err) => console.error('[rewards] onRunComplete failed', err));

    button(this, cx, 440, 'PLAY AGAIN', () => this.go(SCENES.game));
    button(this, cx, 510, 'MAIN MENU', () => this.go(SCENES.menu), 'secondary');
    text(this, cx, GAME_HEIGHT - 40, 'Press R or Space to restart', 12, CSS.cream).setAlpha(0.6);

    const kb = this.input.keyboard;
    kb?.on('keydown-R', () => this.go(SCENES.game));
    kb?.on('keydown-SPACE', () => this.go(SCENES.game));
    kb?.on('keydown-ENTER', () => this.go(SCENES.game));
  }

  update(_time: number, delta: number): void {
    this.stars.update(delta);
  }

  private go(scene: string): void {
    if (this.leaving || this.time.now < this.readyAt) return;
    this.leaving = true;
    this.scene.start(scene);
  }
}
