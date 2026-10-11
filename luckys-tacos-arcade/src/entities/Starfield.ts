import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { COLORS } from '../config/theme';
import { TEXTURES } from '../scenes/keys';

interface Star {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/** Parallax background of drifting cream and yellow specks. */
export class Starfield {
  private stars: Star[] = [];

  constructor(scene: Phaser.Scene, count = 70) {
    const tints = [COLORS.cream, COLORS.cream, COLORS.yellow, COLORS.red];
    for (let i = 0; i < count; i++) {
      const layer = Phaser.Math.Between(1, 3);
      const img = scene.add
        .image(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), TEXTURES.star)
        .setTint(Phaser.Utils.Array.GetRandom(tints))
        .setAlpha(0.25 + layer * 0.2)
        .setScale(layer === 3 ? 1.5 : 1)
        .setDepth(-10);
      this.stars.push({ img, speed: 12 + layer * 22 });
    }
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const s of this.stars) {
      s.img.y += s.speed * dt;
      if (s.img.y > GAME_HEIGHT + 2) {
        s.img.y = -2;
        s.img.x = Phaser.Math.Between(0, GAME_WIDTH);
      }
    }
  }
}
