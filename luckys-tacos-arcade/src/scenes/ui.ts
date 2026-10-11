import Phaser from 'phaser';
import { COLORS, CSS, FONT_FAMILY } from '../config/theme';
import { getWallet } from '../services/wallet';

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string = CSS.cream,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, value, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, fontStyle: 'bold', align: 'center' })
    .setResolution(2)
    .setOrigin(0.5);
}

export interface ButtonOptions {
  variant?: 'primary' | 'secondary';
  width?: number;
  height?: number;
  fontSize?: number;
}

export type ArcadeButton = Phaser.GameObjects.Container & {
  /** Greys the button out and ignores taps while disabled. */
  setEnabled(enabled: boolean): ArcadeButton;
  setLabel(label: string): ArcadeButton;
};

/** Chunky arcade button with a pressed state. Minimum touch height is 44px. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  variantOrOptions: 'primary' | 'secondary' | ButtonOptions = 'primary',
): ArcadeButton {
  const opts: ButtonOptions = typeof variantOrOptions === 'string' ? { variant: variantOrOptions } : variantOrOptions;
  const variant = opts.variant ?? 'primary';
  const w = opts.width ?? 220;
  const h = Math.max(44, opts.height ?? 52);
  const fill = variant === 'primary' ? COLORS.red : COLORS.darkMid;
  const edge = variant === 'primary' ? COLORS.redDark : COLORS.red;
  const shadow = scene.add.rectangle(0, 5, w, h, edge).setOrigin(0.5);
  const face = scene.add.rectangle(0, 0, w, h, fill).setOrigin(0.5).setStrokeStyle(3, COLORS.yellow);
  const t = text(scene, 0, 0, label, opts.fontSize ?? 20, variant === 'primary' ? CSS.cream : CSS.yellow);
  const c = scene.add.container(x, y, [shadow, face, t]).setSize(w, h + 6) as ArcadeButton;
  let enabled = true;
  const press = (down: boolean) => {
    face.y = down ? 3 : 0;
    t.y = down ? 3 : 0;
  };
  c.setInteractive({ useHandCursor: true });
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => enabled && press(true));
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => press(false));
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    press(false);
    if (enabled) onClick();
  });
  c.setEnabled = (value: boolean) => {
    enabled = value;
    c.setAlpha(value ? 1 : 0.4);
    return c;
  };
  c.setLabel = (value: string) => {
    t.setText(value);
    return c;
  };
  return c;
}

/** Small "◀ GAMES" button pinned top-left; returns to the lobby by default. */
export function backButton(scene: Phaser.Scene, onClick: () => void, label = '◀ GAMES'): Phaser.GameObjects.Container {
  const w = 92;
  const h = 44;
  const bg = scene.add.rectangle(0, 0, w, 32, COLORS.darkMid).setStrokeStyle(2, COLORS.red);
  const t = text(scene, 0, 0, label, 13, CSS.yellow);
  const c = scene.add.container(8 + w / 2, 8 + h / 2, [bg, t]).setSize(w, h).setDepth(50);
  c.setInteractive({ useHandCursor: true });
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onClick);
  return c;
}

/**
 * Live play-credit balance pill. Updates on every wallet change and
 * unsubscribes automatically when the scene shuts down.
 */
export function creditPill(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const wallet = getWallet();
  const bg = scene.add.rectangle(0, 0, 124, 32, COLORS.dark).setStrokeStyle(2, COLORS.yellow);
  const coin = scene.add.circle(-46, 0, 9, COLORS.yellow).setStrokeStyle(2, COLORS.yellowDark);
  const coinMark = text(scene, -46, 0, '¢', 11, CSS.dark);
  const value = text(scene, 10, 0, wallet.balance.toLocaleString(), 16, CSS.cream);
  const c = scene.add.container(x, y, [bg, coin, coinMark, value]).setDepth(50);
  const off = wallet.onChange(({ balance, delta }) => {
    value.setText(balance.toLocaleString());
    if (delta > 0) scene.tweens.add({ targets: c, scale: { from: 1.12, to: 1 }, duration: 220 });
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  return c;
}
