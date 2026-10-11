import Phaser from 'phaser';
import { ENEMY, GAME_HEIGHT, GAME_WIDTH, PLAYER, STORAGE_KEYS } from '../config/gameConfig';
import { COLORS } from '../config/theme';
import { Enemy } from '../entities/Enemy';
import { EnemyFormation } from '../entities/EnemyFormation';
import { Hud } from '../entities/Hud';
import { Player } from '../entities/Player';
import { Starfield } from '../entities/Starfield';
import { gameEvents, type RunSummary } from '../services/gameEvents';
import { InputController } from '../systems/InputController';
import { ScoreManager, browserStore } from '../systems/ScoreManager';
import { getWaveConfig, pointsFor } from '../systems/waves';
import { SCENES, TEXTURES } from './keys';

type Bullet = Phaser.Physics.Arcade.Image;

const WAVE_BREAK_MS = 1600;

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private formation!: EnemyFormation;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hud!: Hud;
  private stars!: Starfield;
  private controls!: InputController;
  private scores!: ScoreManager;

  private wave = 0;
  private nextShotAt = 0;
  private waveTransitioning = false;
  private ending = false;
  private enemiesDestroyed = 0;
  private runStartedAt = 0;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.wave = 0;
    this.nextShotAt = 0;
    this.waveTransitioning = false;
    this.ending = false;
    this.enemiesDestroyed = 0;
    this.runStartedAt = this.time.now;

    this.cameras.main.setBackgroundColor(COLORS.dark);
    this.stars = new Starfield(this);
    this.scores = new ScoreManager(browserStore(), STORAGE_KEYS.highScore);
    this.hud = new Hud(this);
    this.player = new Player(this);
    this.controls = new InputController(this, () => this.player.x);

    this.playerBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, defaultKey: TEXTURES.playerBullet, maxSize: 24 });
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, defaultKey: TEXTURES.enemyBullet, maxSize: 40 });
    this.formation = new EnemyFormation(
      this,
      (x, y, aimX) => this.fireEnemyBullet(x, y, aimX),
      () => this.player.x,
    );

    this.sparks = this.add.particles(0, 0, TEXTURES.spark, {
      speed: { min: 40, max: 180 },
      lifespan: { min: 250, max: 600 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [COLORS.red, COLORS.yellow, COLORS.cream],
      emitting: false,
    });
    this.sparks.setDepth(10);

    this.physics.add.overlap(this.playerBullets, this.formation.group, (b, e) =>
      this.onBulletHitsEnemy(b as Bullet, e as Enemy),
    );
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => this.onPlayerHit(b as Bullet));
    this.physics.add.overlap(this.player, this.formation.group, (_p, e) => this.onPlayerHit(undefined, e as Enemy));

    this.hud.setScore(0, this.scores.highScore);
    this.hud.setLives(this.scores.lives);
    this.player.respawn(this.time.now);

    gameEvents.emit('run:start', { startedAt: Date.now() });
    this.startNextWave();
  }

  update(time: number, delta: number): void {
    // Clamp huge frame gaps (tab switches) so nothing tunnels.
    const dt = Math.min(delta, 50);
    this.stars.update(dt);
    this.formation.update(time, dt);

    if (this.player.alive) {
      const intent = this.controls.read();
      if (intent.axis !== 0) this.player.moveByAxis(intent.axis, dt);
      else if (intent.targetX !== null) this.player.moveToward(intent.targetX, dt);

      if (time >= this.nextShotAt && !this.waveTransitioning) {
        this.firePlayerBullet();
        this.nextShotAt = time + PLAYER.fireIntervalMs;
      }
    }

    this.recycleOffscreen(this.playerBullets);
    this.recycleOffscreen(this.enemyBullets);

    if (!this.waveTransitioning && !this.ending && this.formation.aliveCount === 0) {
      this.onWaveCleared();
    }
  }

  private recycleOffscreen(group: Phaser.Physics.Arcade.Group): void {
    group.getChildren().forEach((obj) => {
      const b = obj as Bullet;
      if (b.active && (b.y < -20 || b.y > GAME_HEIGHT + 20 || b.x < -20 || b.x > GAME_WIDTH + 20)) {
        b.disableBody(true, true);
      }
    });
  }

  private firePlayerBullet(): void {
    const b = this.playerBullets.get(this.player.x, this.player.y - 22) as Bullet | null;
    if (!b) return;
    b.enableBody(true, this.player.x, this.player.y - 22, true, true);
    b.setDepth(3);
    (b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false).setSize(6, 12);
    b.setVelocity(0, -PLAYER.bulletSpeed);
  }

  private fireEnemyBullet(x: number, y: number, aimX?: number): void {
    if (this.ending || !this.player.alive) return;
    const b = this.enemyBullets.get(x, y) as Bullet | null;
    if (!b) return;
    b.enableBody(true, x, y, true, true);
    b.setDepth(3);
    (b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false).setSize(6, 10);
    const speed = ENEMY.bulletSpeed * (1 + (this.wave - 1) * 0.05);
    if (aimX === undefined) {
      b.setVelocity(0, speed);
    } else {
      const angle = Phaser.Math.Clamp(Math.atan2(PLAYER.y - y, aimX - x), Math.PI * 0.3, Math.PI * 0.7);
      b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
  }

  private onBulletHitsEnemy(bullet: Bullet, enemy: Enemy): void {
    if (!bullet.active || !enemy.active) return;
    bullet.disableBody(true, true);
    if (!enemy.takeHit()) {
      this.sparks.explode(4, enemy.x, enemy.y);
      return;
    }
    const diving = enemy.state === 'diving';
    const points = pointsFor(enemy.kind, diving);
    this.scores.addPoints(points);
    this.enemiesDestroyed += 1;
    this.sparks.explode(diving ? 22 : 14, enemy.x, enemy.y);
    this.hud.popup(enemy.x, enemy.y, points);
    this.hud.setScore(this.scores.score, this.scores.highScore);
    gameEvents.emit('enemy:destroyed', { kind: enemy.kind, points, diving });
    enemy.destroy();
  }

  private onPlayerHit(bullet?: Bullet, enemy?: Enemy): void {
    if (!this.player.alive || this.ending || this.player.isInvulnerable(this.time.now)) return;
    if (bullet && !bullet.active) return;
    if (enemy && (!enemy.active || !enemy.visible)) return;
    bullet?.disableBody(true, true);
    if (enemy) {
      // Ramming costs the enemy too.
      this.sparks.explode(14, enemy.x, enemy.y);
      this.enemiesDestroyed += 1;
      enemy.destroy();
    }

    this.player.kill();
    this.sparks.explode(40, this.player.x, this.player.y);
    this.cameras.main.shake(250, 0.012);
    this.cameras.main.flash(150, 214, 40, 40);
    try {
      navigator.vibrate?.(120);
    } catch {
      // Vibration is optional.
    }
    this.clearEnemyBullets();

    const lives = this.scores.loseLife();
    this.hud.setLives(Math.max(lives, 1));
    gameEvents.emit('player:hit', { livesRemaining: lives });

    if (lives <= 0) {
      this.hud.setLives(0);
      this.endRun();
      return;
    }
    this.time.delayedCall(PLAYER.respawnDelayMs, () => {
      if (this.ending) return;
      this.player.respawn(this.time.now);
      this.controls.reanchor();
    });
  }

  private clearEnemyBullets(): void {
    this.enemyBullets.getChildren().forEach((b) => (b as Bullet).disableBody(true, true));
  }

  private startNextWave(): void {
    this.wave += 1;
    const config = getWaveConfig(this.wave);
    this.hud.setWave(this.wave);
    this.hud.banner(`WAVE ${this.wave}`, this.wave === 1 ? 'Defend the taco stand!' : 'Here comes more heat!');
    this.formation.spawnWave(config, this.time.now);
    gameEvents.emit('wave:start', { wave: this.wave });
  }

  private onWaveCleared(): void {
    this.waveTransitioning = true;
    gameEvents.emit('wave:cleared', { wave: this.wave, score: this.scores.score });
    this.hud.banner('¡DELICIOSO!', `Wave ${this.wave} cleared`, WAVE_BREAK_MS);
    this.clearEnemyBullets();
    this.time.delayedCall(WAVE_BREAK_MS, () => {
      if (this.ending) return;
      this.waveTransitioning = false;
      this.startNextWave();
    });
  }

  private endRun(): void {
    this.ending = true;
    const newHighScore = this.scores.commitHighScore();
    const summary: RunSummary = {
      score: this.scores.score,
      highScore: this.scores.highScore,
      newHighScore,
      wave: this.wave,
      enemiesDestroyed: this.enemiesDestroyed,
      durationMs: Math.round(this.time.now - this.runStartedAt),
      endedAt: Date.now(),
    };
    gameEvents.emit('run:end', summary);
    this.time.delayedCall(1300, () => this.scene.start(SCENES.gameOver, summary));
  }
}
