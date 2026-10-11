import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, STORAGE_KEYS } from '../config/gameConfig';
import { COLORS, CSS } from '../config/theme';
import { Starfield } from '../entities/Starfield';
import { ScoreManager, browserStore } from '../systems/ScoreManager';
import { ENEMY_KINDS, type EnemyKind } from '../systems/waves';
import { SCENES, TEXTURES } from './keys';
import { button, text } from './ui';

const ROSTER: { kind: EnemyKind; name: string }[] = [
  { kind: 'chili', name: 'Chili Commander' },
  { kind: 'pepper', name: 'Bell Pepper Bandit' },
  { kind: 'onion', name: 'Onion Ogre' },
];

export class MenuScene extends Phaser.Scene {
  private stars!: Starfield;
  private started = false;

  constructor() {
    super(SCENES.menu);
  }

  create(): void {
    this.started = false;
    this.cameras.main.setBackgroundColor(COLORS.dark);
    this.stars = new Starfield(this);
    const cx = GAME_WIDTH / 2;

    // Sign-style title block.
    this.add.rectangle(cx, 112, 300, 112, COLORS.red).setStrokeStyle(4, COLORS.yellow);
    this.add.rectangle(cx, 112, 286, 98).setStrokeStyle(2, COLORS.cream, 0.6);
    text(this, cx, 88, "LUCKY'S TACOS", 34, CSS.yellow).setStroke(CSS.dark, 6);
    text(this, cx, 132, 'ARCADE ATTACK', 22, CSS.cream).setStroke(CSS.dark, 4);

    const ship = this.add.image(cx, 220, TEXTURES.player).setScale(1.6);
    this.tweens.add({ targets: ship, y: 210, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    text(this, cx, 270, 'SCORE TABLE', 13, CSS.red);
    ROSTER.forEach((r, i) => {
      const y = 302 + i * 38;
      this.add.image(cx - 104, y, ENEMY_KINDS[r.kind].texture);
      this.add
        .text(cx - 80, y, r.name, { fontFamily: 'inherit', fontSize: '14px', color: CSS.cream, fontStyle: 'bold' })
        .setResolution(2)
        .setOrigin(0, 0.5);
      text(this, cx + 112, y, `${ENEMY_KINDS[r.kind].points}`, 14, CSS.yellow).setOrigin(1, 0.5);
    });
    text(this, cx, 412, 'Diving enemies score double!', 12, CSS.yellow);

    const high = new ScoreManager(browserStore(), STORAGE_KEYS.highScore).highScore;
    text(this, cx, 444, `HIGH SCORE  ${high.toLocaleString()}`, 14, CSS.cream);

    const play = button(this, cx, 500, 'TAP TO PLAY', () => this.startGame());
    this.tweens.add({ targets: play, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    text(this, cx, 560, 'Drag anywhere to move · Auto-fire', 12, CSS.cream).setAlpha(0.8);
    text(this, cx, 580, 'Keyboard: ← → or A / D', 12, CSS.cream).setAlpha(0.6);
    text(this, cx, GAME_HEIGHT - 20, '3 lives · Clear waves · Beat the high score', 11, CSS.red);

    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
    this.input.keyboard?.once('keydown-ENTER', () => this.startGame());
  }

  update(_time: number, delta: number): void {
    this.stars.update(delta);
  }

  private startGame(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start(SCENES.game);
  }
}
