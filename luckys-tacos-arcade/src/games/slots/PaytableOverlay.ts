import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/gameConfig';
import { COLORS, CSS } from '../../config/theme';
import { button, text } from '../../scenes/ui';
import { PAYLINES, SYMBOLS, SYMBOL_INFO, THEORETICAL_RTP, WILD } from './slotsMath';
import { symbolTexture } from './textures';

const PANEL_W = 336;
const PANEL_TOP = 56;
const PANEL_BOTTOM = 632;
const ROW_TOP = 136;
const ROW_STEP = 39;

/** Colour of each payline (index = line id - 1); shared with the reel display. */
export const LINE_COLORS = [COLORS.red, COLORS.yellow, COLORS.lime, 0xf77f00, COLORS.cream] as const;

export interface PaytableHandle {
  /** Removes the overlay and runs the onClose callback (once). */
  close(): void;
}

/**
 * Modal paytable: symbol pays, the 5 payline shapes and the play-money notice.
 * Blocks input to the machine underneath until closed.
 */
export function openPaytable(scene: Phaser.Scene, onClose: () => void): PaytableHandle {
  const cx = GAME_WIDTH / 2;
  const parts: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
    parts.push(obj);
    return obj;
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.destroy();
    onClose();
  };

  // Backdrop swallows taps; a full tap (down + up) outside the panel closes.
  const backdrop = add(scene.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.dark, 0.86).setInteractive());
  let armed = false;
  backdrop.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => (armed = true));
  backdrop.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => armed && close());

  const panelH = PANEL_BOTTOM - PANEL_TOP;
  const panelY = PANEL_TOP + panelH / 2;
  add(scene.add.rectangle(cx, panelY + 5, PANEL_W, panelH, COLORS.redDark));
  add(scene.add.rectangle(cx, panelY, PANEL_W, panelH, COLORS.darkMid).setStrokeStyle(3, COLORS.yellow).setInteractive());

  add(text(scene, cx, 80, 'PAYTABLE', 22, CSS.yellow).setStroke(CSS.red, 5));
  add(text(scene, cx, 104, 'Three of a kind on a line wins  ·  pays × line bet', 11, CSS.cream).setAlpha(0.85));

  SYMBOLS.forEach((symbol, i) => {
    const y = ROW_TOP + i * ROW_STEP;
    const isWild = symbol === WILD;
    add(scene.add.rectangle(cx, y, PANEL_W - 24, ROW_STEP - 4, i % 2 === 0 ? COLORS.dark : COLORS.darkMid, 0.9));
    [0, 1, 2].forEach((n) => add(scene.add.image(44 + n * 27, y, symbolTexture(symbol)).setScale(0.42)));
    add(text(scene, 128, y - (isWild ? 6 : 0), SYMBOL_INFO[symbol].name.toUpperCase(), 14, CSS.cream).setOrigin(0, 0.5));
    if (isWild) add(text(scene, 128, y + 10, 'WILD · JACKPOT', 10, CSS.yellow).setOrigin(0, 0.5));
    add(text(scene, cx + PANEL_W / 2 - 22, y, `${SYMBOL_INFO[symbol].pay}`, 19, CSS.yellow).setOrigin(1, 0.5));
  });

  const noteY = ROW_TOP + SYMBOLS.length * ROW_STEP + 8;
  add(
    text(
      scene,
      cx,
      noteY,
      'The LUCKY TACO is wild: it stands in for any symbol.\nThree Lucky Tacos on a line hit the jackpot.',
      11,
      CSS.cream,
    ).setLineSpacing(3),
  );

  const linesY = noteY + 38;
  add(text(scene, cx, linesY, '5 PAYLINES', 13, CSS.yellow));
  PAYLINES.forEach((line, i) => drawLineIcon(scene, add, 64 + i * 58, linesY + 34, line.rows, LINE_COLORS[i], line.id));

  const infoY = linesY + 88;
  add(text(scene, cx, infoY, 'Wins on different lines add up. Each spin plays all 5 lines.', 10, CSS.cream).setAlpha(0.8));
  add(
    text(scene, cx, infoY + 17, `Average long-run return: ${(THEORETICAL_RTP * 100).toFixed(1)}% of credits bet`, 10, CSS.cream).setAlpha(0.8),
  );
  add(text(scene, cx, infoY + 38, 'For fun only - credits have no cash value', 12, CSS.yellow));

  add(button(scene, cx, PANEL_BOTTOM - 36, 'CLOSE', close, { variant: 'primary', width: 160, height: 44, fontSize: 18 }));

  const root = scene.add.container(0, 0, parts).setDepth(100);
  return { close };
}

/** Mini 3x3 grid with the payline drawn through it. */
function drawLineIcon(
  scene: Phaser.Scene,
  add: <T extends Phaser.GameObjects.GameObject>(obj: T) => T,
  x: number,
  y: number,
  rows: readonly number[],
  color: number,
  id: number,
): void {
  const cell = 12;
  const gap = 2;
  const step = cell + gap;
  const g = add(scene.add.graphics());
  for (let reel = 0; reel < 3; reel++) {
    for (let row = 0; row < 3; row++) {
      const on = rows[reel] === row;
      g.fillStyle(on ? color : COLORS.cream, on ? 1 : 0.18);
      g.fillRect(x + (reel - 1) * step - cell / 2, y + (row - 1) * step - cell / 2, cell, cell);
    }
  }
  g.lineStyle(3, color);
  g.beginPath();
  rows.forEach((row, reel) => {
    const px = x + (reel - 1) * step;
    const py = y + (row - 1) * step;
    if (reel === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.strokePath();
  add(text(scene, x, y + 31, `${id}`, 11, CSS.cream));
}
