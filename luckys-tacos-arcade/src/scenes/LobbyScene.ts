import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { COLORS, CSS } from '../config/theme';
import { Starfield } from '../entities/Starfield';
import { enabledGames, type GameEntry } from '../games/registry';
import { SCENES } from './keys';
import { creditPill, text } from './ui';

const CARD_W = 316;
const CARD_H = 112;
const CARD_GAP = 18;

/** Front door: pick a game. Cards are built from the game registry. */
export class LobbyScene extends Phaser.Scene {
  private stars!: Starfield;
  private leaving = false;

  constructor() {
    super(SCENES.lobby);
  }

  create(): void {
    this.leaving = false;
    this.cameras.main.setBackgroundColor(COLORS.dark);
    this.stars = new Starfield(this);
    const cx = GAME_WIDTH / 2;

    this.add.rectangle(cx, 62, 300, 80, COLORS.red).setStrokeStyle(4, COLORS.yellow);
    text(this, cx, 48, "LUCKY'S TACOS", 30, CSS.yellow).setStroke(CSS.dark, 6);
    text(this, cx, 80, 'ARCADE', 18, CSS.cream).setStroke(CSS.dark, 4);

    text(this, 20, 130, 'PICK A GAME', 13, CSS.red).setOrigin(0, 0.5);
    creditPill(this, GAME_WIDTH - 72, 130);

    enabledGames().forEach((game, i) => this.card(game, cx, 154 + CARD_H / 2 + i * (CARD_H + CARD_GAP)));

    text(this, cx, GAME_HEIGHT - 26, 'Credits are for fun only and have no cash value.', 10, CSS.cream).setAlpha(0.55);
  }

  update(_time: number, delta: number): void {
    this.stars.update(delta);
  }

  private card(game: GameEntry, x: number, y: number): void {
    const shadow = this.add.rectangle(0, 5, CARD_W, CARD_H, COLORS.redDark);
    const face = this.add.rectangle(0, 0, CARD_W, CARD_H, COLORS.darkMid).setStrokeStyle(3, COLORS.yellow);
    const iconBg = this.add.circle(-CARD_W / 2 + 54, 0, 38, COLORS.dark).setStrokeStyle(2, COLORS.red);
    const icon = this.add.image(-CARD_W / 2 + 54, 0, game.icon);
    icon.setScale(Math.min(56 / icon.width, 56 / icon.height));
    const title = text(this, -CARD_W / 2 + 104, -18, game.title.toUpperCase(), 19, CSS.yellow).setOrigin(0, 0.5);
    const tagline = text(this, -CARD_W / 2 + 104, 8, game.tagline, 12, CSS.cream).setOrigin(0, 0.5);
    const tag = text(this, -CARD_W / 2 + 104, 32, game.usesCredits ? 'USES PLAY CREDITS' : 'FREE PLAY', 10, CSS.red).setOrigin(0, 0.5);
    const arrow = text(this, CARD_W / 2 - 20, 0, '▶', 18, CSS.yellow);
    const parts = [face, iconBg, icon, title, tagline, tag, arrow];
    const c = this.add.container(x, y, [shadow, ...parts]).setSize(CARD_W, CARD_H);
    c.setInteractive({ useHandCursor: true });
    c.setData('gameId', game.id);
    const press = (down: boolean) => parts.forEach((p) => (p.y += down ? 3 : -3));
    let pressed = false;
    c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!pressed) press((pressed = true));
    });
    c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (pressed) press((pressed = false));
    });
    c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (pressed) press((pressed = false));
      this.open(game);
    });
  }

  private open(game: GameEntry): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(game.sceneKey);
  }
}
