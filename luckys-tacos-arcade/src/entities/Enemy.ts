import Phaser from 'phaser';
import { ENEMY_KINDS, type EnemyKind, type Slot } from '../systems/waves';

export type EnemyState = 'entering' | 'formation' | 'diving' | 'returning';

export class Enemy extends Phaser.Physics.Arcade.Image {
  readonly kind: EnemyKind;
  readonly slot: Slot;
  hp: number;
  state: EnemyState = 'entering';

  // Path state shared by entering/returning (quadratic bezier toward the slot).
  pathStart = new Phaser.Math.Vector2();
  pathControl = new Phaser.Math.Vector2();
  pathStartTime = 0;
  pathDuration = 0;

  // Dive state.
  diveOriginX = 0;
  diveTargetX = 0;
  diveStartTime = 0;
  diveSpeed = 0;
  diveShotsLeft = 0;
  nextDiveShotAt = 0;

  constructor(scene: Phaser.Scene, slot: Slot) {
    super(scene, 0, -40, ENEMY_KINDS[slot.kind].texture);
    this.kind = slot.kind;
    this.slot = slot;
    this.hp = ENEMY_KINDS[slot.kind].hitPoints;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.moves = false; // Positions are driven by EnemyFormation.
    body.setCircle(Math.min(this.width, this.height) / 2 - 2, 2, 2);
    this.setDepth(4);
  }

  /** Returns true if this hit destroyed the enemy. */
  takeHit(): boolean {
    this.hp -= 1;
    if (this.hp > 0) {
      this.setTintFill(0xffffff);
      this.scene.time.delayedCall(70, () => {
        if (this.active) this.clearTint().setTint(0xffb3b3);
      });
      return false;
    }
    return true;
  }
}
