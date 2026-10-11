import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/gameConfig';
import { COLORS } from './config/theme';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { SlotsScene } from './games/slots/SlotsScene';
import { BlackjackScene } from './games/blackjack/BlackjackScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.dark,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  input: { activePointers: 2 },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, LobbyScene, MenuScene, GameScene, GameOverScene, SlotsScene, BlackjackScene],
});

// Exposed only with ?debug so automated smoke tests can inspect state.
if (new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __LUCKY_GAME__: Phaser.Game }).__LUCKY_GAME__ = game;
}
