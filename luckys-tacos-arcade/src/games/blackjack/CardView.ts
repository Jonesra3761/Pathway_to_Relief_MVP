import Phaser from 'phaser';
import { CSS, FONT_FAMILY } from '../../config/theme';
import type { Card } from './blackjackEngine';
import { BJ_TEXTURES, CARD_H, CARD_W, isRedSuit } from './textures';

const COURT = new Set(['J', 'Q', 'K']);

/**
 * One playing card: cream face with corner ranks and a big centre suit, or the
 * Lucky's Tacos back. Origin is the card centre.
 */
export class CardView extends Phaser.GameObjects.Container {
  private readonly faceParts: Phaser.GameObjects.GameObject[];
  private readonly back: Phaser.GameObjects.Image;
  private _faceUp: boolean;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly card: Card,
    faceUp: boolean,
  ) {
    super(scene, x, y);
    const color = isRedSuit(card.suit) ? CSS.red : CSS.dark;
    const face = scene.add.image(1, 1.5, COURT.has(card.rank) ? BJ_TEXTURES.courtFace : BJ_TEXTURES.face);
    const hw = CARD_W / 2;
    const hh = CARD_H / 2;
    const rankStyle = { fontFamily: FONT_FAMILY, fontSize: '16px', color, fontStyle: 'bold' };
    // '10' is wider; nudge it so it never touches the edge.
    const rankX = card.rank === '10' ? -hw + 11 : -hw + 9;
    const tl = scene.add.text(rankX, -hh + 11, card.rank, rankStyle).setOrigin(0.5).setResolution(2);
    const tlSuit = scene.add.image(-hw + 9, -hh + 25, BJ_TEXTURES.suit(card.suit, false));
    // Bottom index stays upright: a rotated 9 reads as a 6 on a small screen.
    const br = scene.add.text(-rankX, hh - 11, card.rank, rankStyle).setOrigin(0.5).setResolution(2);
    const brSuit = scene.add.image(hw - 9, hh - 25, BJ_TEXTURES.suit(card.suit, false));
    const centre = scene.add.image(0, 0, BJ_TEXTURES.suit(card.suit, true));
    if (COURT.has(card.rank)) centre.setScale(0.85);
    this.faceParts = [face, tl, tlSuit, br, brSuit, centre];
    this.back = scene.add.image(1, 1.5, BJ_TEXTURES.back);
    this.add([...this.faceParts, this.back]);
    this.setSize(CARD_W, CARD_H);
    this._faceUp = faceUp;
    this.applyFace();
    scene.add.existing(this);
  }

  get faceUp(): boolean {
    return this._faceUp;
  }

  setFaceUp(faceUp: boolean): this {
    this._faceUp = faceUp;
    this.applyFace();
    return this;
  }

  /** Greys the card down (used for the hand that is waiting its turn after a split). */
  setDim(dim: boolean): this {
    for (const p of this.list) {
      if (p instanceof Phaser.GameObjects.Image) p.setTint(dim ? 0x9a8c80 : 0xffffff);
      else if (p instanceof Phaser.GameObjects.Text) p.setAlpha(dim ? 0.6 : 1);
    }
    return this;
  }

  /** Turns the card over with a quick squash-and-stretch. */
  flip(faceUp: boolean, duration = 180): void {
    if (faceUp === this._faceUp || !this.scene) return;
    const half = duration / 2;
    this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      duration: half,
      ease: 'Sine.in',
      onComplete: () => {
        // The card may have been swept off the table mid-flip.
        if (!this.scene) return;
        this.setFaceUp(faceUp);
        this.scene.tweens.add({ targets: this, scaleX: 1, duration: half, ease: 'Sine.out' });
      },
    });
  }

  private applyFace(): void {
    for (const p of this.faceParts) (p as Phaser.GameObjects.Image).setVisible(this._faceUp);
    this.back.setVisible(!this._faceUp);
  }
}
