import Phaser from 'phaser';
import { COLORS, CSS, FONT_FAMILY } from '../config/theme';

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

/** Chunky arcade button with a pressed state. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  variant: 'primary' | 'secondary' = 'primary',
): Phaser.GameObjects.Container {
  const w = 220;
  const h = 52;
  const fill = variant === 'primary' ? COLORS.red : COLORS.darkMid;
  const edge = variant === 'primary' ? COLORS.redDark : COLORS.red;
  const shadow = scene.add.rectangle(0, 5, w, h, edge).setOrigin(0.5);
  const face = scene.add.rectangle(0, 0, w, h, fill).setOrigin(0.5).setStrokeStyle(3, COLORS.yellow);
  const t = text(scene, 0, 0, label, 20, variant === 'primary' ? CSS.cream : CSS.yellow);
  const c = scene.add.container(x, y, [shadow, face, t]).setSize(w, h + 6);
  c.setInteractive({ useHandCursor: true });
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
    face.y = 3;
    t.y = 3;
  });
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    face.y = 0;
    t.y = 0;
  });
  c.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    face.y = 0;
    t.y = 0;
    onClick();
  });
  return c;
}
