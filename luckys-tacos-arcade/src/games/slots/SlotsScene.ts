import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/gameConfig';
import { COLORS, CSS } from '../../config/theme';
import { SCENES } from '../../scenes/keys';
import { backButton, creditPill, text } from '../../scenes/ui';

/** Placeholder: replaced by the full game implementation. */
export class SlotsScene extends Phaser.Scene {
  constructor() {
    super(SCENES.slots);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.dark);
    backButton(this, () => this.scene.start(SCENES.lobby));
    creditPill(this, GAME_WIDTH - 72, 30);
    text(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Taco Slots', 28, CSS.yellow);
  }
}
