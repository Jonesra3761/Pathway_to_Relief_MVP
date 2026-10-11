import Phaser from 'phaser';
import { GAME_WIDTH, PLAYER } from '../config/gameConfig';
import { TEXTURES } from '../scenes/keys';

export class Player extends Phaser.Physics.Arcade.Image {
  private invulnerableUntil = 0;
  private blinkTween?: Phaser.Tweens.Tween;
  alive = true;

  constructor(scene: Phaser.Scene) {
    super(scene, GAME_WIDTH / 2, PLAYER.y, TEXTURES.player);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Forgiving hitbox: smaller than the art.
    body.setSize(28, 20).setOffset(8, 12);
    body.setAllowGravity(false);
    this.setDepth(5);
  }

  isInvulnerable(now: number): boolean {
    return now < this.invulnerableUntil;
  }

  /** Moves toward a target x, capped by max speed. */
  moveToward(targetX: number, deltaMs: number, maxSpeed: number = PLAYER.touchFollowSpeed): void {
    const maxStep = (maxSpeed * deltaMs) / 1000;
    const dx = Phaser.Math.Clamp(targetX - this.x, -maxStep, maxStep);
    this.setX(this.clampX(this.x + dx));
  }

  /** Moves by keyboard axis (-1..1). */
  moveByAxis(axis: number, deltaMs: number): void {
    this.setX(this.clampX(this.x + (axis * PLAYER.speed * deltaMs) / 1000));
  }

  clampX(x: number): number {
    return Phaser.Math.Clamp(x, PLAYER.margin, GAME_WIDTH - PLAYER.margin);
  }

  kill(): void {
    this.alive = false;
    this.blinkTween?.stop();
    this.setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  respawn(now: number): void {
    this.alive = true;
    this.setPosition(GAME_WIDTH / 2, PLAYER.y).setVisible(true).setAlpha(1);
    (this.body as Phaser.Physics.Arcade.Body).enable = true;
    this.invulnerableUntil = now + PLAYER.invulnerableMs;
    this.blinkTween?.stop();
    this.blinkTween = this.scene.tweens.add({
      targets: this,
      alpha: 0.25,
      duration: 120,
      yoyo: true,
      repeat: Math.floor(PLAYER.invulnerableMs / 240) - 1,
      onComplete: () => this.setAlpha(1),
    });
  }
}
