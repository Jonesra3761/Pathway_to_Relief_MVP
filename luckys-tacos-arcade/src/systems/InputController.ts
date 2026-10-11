import Phaser from 'phaser';

export interface MoveIntent {
  /** Keyboard axis in -1..1, or 0. */
  axis: number;
  /** Absolute target x from a touch drag, if a finger is down. */
  targetX: number | null;
}

/**
 * Unifies keyboard and touch. Touch uses relative dragging: put a finger
 * anywhere and slide, and the ship moves by the same amount, so the finger
 * never covers the ship on small screens.
 */
export class InputController {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private dragPointerId: number | null = null;
  private dragStartPointerX = 0;
  private dragStartShipX = 0;
  private targetX: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly getShipX: () => number,
  ) {
    const kb = scene.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    }
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.dragPointerId !== null) return;
    this.dragPointerId = p.id;
    this.dragStartPointerX = p.x;
    this.dragStartShipX = this.getShipX();
    this.targetX = this.dragStartShipX;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragPointerId || !p.isDown) return;
    this.targetX = this.dragStartShipX + (p.x - this.dragStartPointerX) * 1.2;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragPointerId) return;
    this.dragPointerId = null;
    this.targetX = null;
  }

  /** Re-anchors an active drag (e.g. after the ship respawns at center). */
  reanchor(): void {
    if (this.dragPointerId === null) return;
    const p = this.scene.input.manager.pointers.find((ptr) => ptr.id === this.dragPointerId);
    this.dragStartPointerX = p ? p.x : this.dragStartPointerX;
    this.dragStartShipX = this.getShipX();
    this.targetX = this.dragStartShipX;
  }

  read(): MoveIntent {
    let axis = 0;
    if (this.cursors?.left.isDown || this.keyA?.isDown) axis -= 1;
    if (this.cursors?.right.isDown || this.keyD?.isDown) axis += 1;
    return { axis, targetX: axis === 0 ? this.targetX : null };
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
  }
}
