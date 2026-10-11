import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/gameConfig';
import { COLORS, CSS } from '../../config/theme';
import { Starfield } from '../../entities/Starfield';
import { gameEvents } from '../../services/gameEvents';
import { getWallet } from '../../services/wallet';
import { SCENES } from '../../scenes/keys';
import { backButton, button, creditPill, text, type ArcadeButton } from '../../scenes/ui';
import type { CreditWallet } from '../../systems/CreditWallet';
import { LINE_COLORS, openPaytable, type PaytableHandle } from './PaytableOverlay';
import { CELL_H, ReelView } from './ReelView';
import {
  LINE_BETS,
  MIN_TOTAL_BET,
  PAYLINES,
  REEL_STRIPS,
  SYMBOL_INFO,
  WILD,
  idleStops,
  spin,
  totalBet,
  type LineWin,
  type Payline,
  type Rng,
  type SpinOutcome,
} from './slotsMath';
import { SLOTS_TEXTURES, ensureSlotsTextures } from './textures';

const CX = GAME_WIDTH / 2;

// Machine layout (logical px).
const REEL_W = 88;
const REEL_GAP = 8;
const REEL_X = [CX - REEL_W - REEL_GAP, CX, CX + REEL_W + REEL_GAP];
const WINDOW_TOP = 138;
const WINDOW_H = CELL_H * 3;
const MID_Y = WINDOW_TOP + WINDOW_H / 2;
const ROW_Y = [MID_Y - CELL_H, MID_Y, MID_Y + CELL_H];
const WINDOW_LEFT = REEL_X[0] - REEL_W / 2 - 4;
const WINDOW_W = REEL_W * 3 + REEL_GAP * 2 + 8;
const TAB_X = [22, GAME_WIDTH - 22];
const TAB_NUDGE = 13;
const TAB_IDLE_ALPHA = 0.7;
const MARQUEE_TOP = 56;
const MARQUEE_H = 56;
const CABINET_TOP = 118;
const CABINET_BOTTOM = 448;
const PANEL_Y = 410;
const BET_ROW_Y = 482;
const SPIN_Y = 556;

// Spin timing.
const START_STAGGER_MS = 70;
const FIRST_STOP_MS = 900;
const STOP_STAGGER_MS = 320;
const LINE_CYCLE_MS = 1400;
/**
 * After a refill or closing the paytable, the machine ignores input briefly, so
 * the second tap of a double tap can't land on SPIN (which sits under REFILL and
 * the paytable's CLOSE) and spend credits, or hit GAMES under the backdrop.
 */
const INPUT_LOCK_MS = 450;

interface Round {
  outcome: SpinOutcome;
  /** True once the payout has been deposited and the round reported. */
  settled: boolean;
}

/**
 * Taco Slots: 3 reels, 5 lines, play credits only.
 * The outcome is decided by slotsMath at spin start; the reels just act it out.
 * The stake is taken when the spin starts and the payout is paid when the reels
 * land, or immediately if the scene shuts down or the page is hidden mid-spin.
 */
export class SlotsScene extends Phaser.Scene {
  private wallet!: CreditWallet;
  private stars!: Starfield;
  private reels: ReelView[] = [];
  private bulbs: Phaser.GameObjects.Image[] = [];
  /** Payline markers, [line index][left, right]. */
  private tabs: Phaser.GameObjects.Container[][] = [];
  private winGlow!: Phaser.GameObjects.Graphics;
  private winFrames!: Phaser.GameObjects.Graphics;
  private winLines!: Phaser.GameObjects.Graphics;
  private reelFlashes: Phaser.GameObjects.Rectangle[] = [];
  private mainMsg!: Phaser.GameObjects.Text;
  private subMsg!: Phaser.GameObjects.Text;
  private betValue!: Phaser.GameObjects.Text;
  private betSub!: Phaser.GameObjects.Text;
  private betBox!: Phaser.GameObjects.Rectangle;
  private spinBtn!: ArcadeButton;
  private refillBtn!: ArcadeButton;
  private minusBtn!: ArcadeButton;
  private plusBtn!: ArcadeButton;
  private coins!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;

  // Per-visit state, reset in create().
  private rng: Rng = Math.random;
  private betIndex = 0;
  private round: Round | null = null;
  private spinning = false;
  private reelsLanded = 0;
  private paytable: PaytableHandle | null = null;
  private leaving = false;
  private inputLockedUntil = 0;
  private celebrateUntil = 0;
  private winTweens: Phaser.Tweens.Tween[] = [];
  private winTimers: Phaser.Time.TimerEvent[] = [];
  private banner: Phaser.GameObjects.Container | null = null;
  private lastOutcome: SpinOutcome | null = null;

  constructor() {
    super(SCENES.slots);
  }

  create(): void {
    this.rng = Math.random;
    this.betIndex = 0;
    this.round = null;
    this.spinning = false;
    this.reelsLanded = 0;
    this.paytable = null;
    this.leaving = false;
    this.inputLockedUntil = 0;
    this.celebrateUntil = 0;
    this.winTweens = [];
    this.winTimers = [];
    this.banner = null;
    this.lastOutcome = null;
    this.reels = [];
    this.bulbs = [];
    this.tabs = [];
    this.reelFlashes = [];

    ensureSlotsTextures(this);
    this.wallet = getWallet();
    this.cameras.main.setBackgroundColor(COLORS.dark);
    this.stars = new Starfield(this, 40);

    backButton(this, () => this.leave());
    creditPill(this, GAME_WIDTH - 72, 30);

    this.buildMarquee();
    this.buildCabinet();
    this.buildReels();
    this.buildPaylineTabs();
    this.buildWinPanel();
    this.buildControls();
    this.buildEffects();

    this.fitBetToBalance();
    this.updateBetDisplay();
    this.showIdleMessage();
    this.refreshControls();

    const offWallet = this.wallet.onChange(() => this.refreshControls());
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onPageHidden, this);
    window.addEventListener('pagehide', this.onPageHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Leaving mid-spin: pay out now so credits are never lost.
      this.settleRound();
      this.round = null;
      this.spinning = false;
      offWallet();
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onPageHidden, this);
      window.removeEventListener('pagehide', this.onPageHidden);
    });

    const kb = this.input.keyboard;
    // Held keys auto-repeat; only a fresh press spins.
    const press = (e: KeyboardEvent) => !e.repeat && this.primaryAction();
    kb?.on('keydown-SPACE', press);
    kb?.on('keydown-ENTER', press);
    kb?.on('keydown-LEFT', () => this.changeBet(-1));
    kb?.on('keydown-DOWN', () => this.changeBet(-1));
    kb?.on('keydown-RIGHT', () => this.changeBet(1));
    kb?.on('keydown-UP', () => this.changeBet(1));
    kb?.on('keydown-P', () => (this.paytable ? this.closePaytable() : this.showPaytable()));
    kb?.on('keydown-ESC', () => this.closePaytable());
  }

  update(time: number, delta: number): void {
    this.stars.update(delta);
    this.reels.forEach((r) => r.update(Math.min(delta, 50)));
    // Marquee chaser lights; they race during a big win.
    const step = time < this.celebrateUntil ? 70 : 240;
    const phase = Math.floor(time / step) % 3;
    this.bulbs.forEach((b, i) => b.setAlpha(i % 3 === phase ? 1 : 0.28));
  }

  // ---------------------------------------------------------------- layout

  private buildMarquee(): void {
    const top = MARQUEE_TOP;
    const h = MARQUEE_H;
    const y = top + h / 2;
    this.add.rectangle(CX, y + 5, 316, h, COLORS.redDark);
    this.add.rectangle(CX, y, 316, h, COLORS.red).setStrokeStyle(4, COLORS.yellow);
    const count = 15;
    for (let i = 0; i < count; i++) {
      const x = CX - 144 + (i * 288) / (count - 1);
      [top + 7, top + h - 7].forEach((by, row) => {
        const tint = (i + row) % 2 === 0 ? COLORS.yellow : COLORS.cream;
        this.bulbs.push(this.add.image(x, by, SLOTS_TEXTURES.bulb).setTint(tint).setScale(0.8));
      });
    }
    text(this, CX, y + 1, 'TACO SLOTS', 30, CSS.yellow).setStroke(CSS.dark, 7);
  }

  private buildCabinet(): void {
    const g = this.add.graphics();
    const h = CABINET_BOTTOM - CABINET_TOP;
    g.fillStyle(COLORS.redDark);
    g.fillRoundedRect(8, CABINET_TOP + 6, GAME_WIDTH - 16, h, 18);
    g.fillStyle(COLORS.red);
    g.fillRoundedRect(8, CABINET_TOP, GAME_WIDTH - 16, h, 18);
    g.lineStyle(4, COLORS.yellow);
    g.strokeRoundedRect(8, CABINET_TOP, GAME_WIDTH - 16, h, 18);
    g.lineStyle(2, COLORS.cream, 0.3);
    g.strokeRoundedRect(15, CABINET_TOP + 7, GAME_WIDTH - 30, h - 14, 13);

    // Reel window bezel.
    g.fillStyle(COLORS.dark);
    g.fillRoundedRect(WINDOW_LEFT - 4, WINDOW_TOP - 9, WINDOW_W + 8, WINDOW_H + 18, 10);
    g.lineStyle(3, COLORS.yellow);
    g.strokeRoundedRect(WINDOW_LEFT - 4, WINDOW_TOP - 9, WINDOW_W + 8, WINDOW_H + 18, 10);

    // Reel faces.
    REEL_X.forEach((x) => {
      g.fillStyle(COLORS.cream);
      g.fillRect(x - REEL_W / 2, WINDOW_TOP, REEL_W, WINDOW_H);
      g.fillStyle(COLORS.creamDark, 0.6);
      g.fillRect(x - REEL_W / 2, WINDOW_TOP, 3, WINDOW_H);
      g.fillRect(x + REEL_W / 2 - 3, WINDOW_TOP, 3, WINDOW_H);
    });
  }

  private buildReels(): void {
    this.winGlow = this.add.graphics().setDepth(1);
    const maskShape = this.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(WINDOW_LEFT, WINDOW_TOP, WINDOW_W, WINDOW_H);
    const mask = maskShape.createGeometryMask();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      mask.destroy();
      maskShape.destroy();
    });

    // At rest the window shows no paying line, so nothing looks like an unpaid win.
    const restStops = idleStops(Math.random);
    REEL_STRIPS.forEach((strip, i) => {
      const reel = new ReelView(this, REEL_X[i], MID_Y, strip, restStops[i]);
      reel.container.setDepth(2).setMask(mask);
      this.reels.push(reel);
    });

    this.winFrames = this.add.graphics().setDepth(3);
    REEL_X.forEach((x) => {
      // Curved-glass shading at the top and bottom of each reel.
      this.add.image(x, WINDOW_TOP, SLOTS_TEXTURES.shade).setOrigin(0.5, 0).setDisplaySize(REEL_W, 34).setDepth(4);
      this.add
        .image(x, WINDOW_TOP + WINDOW_H, SLOTS_TEXTURES.shade)
        .setOrigin(0.5, 1)
        .setFlipY(true)
        .setDisplaySize(REEL_W, 34)
        .setDepth(4);
      this.reelFlashes.push(this.add.rectangle(x, MID_Y, REEL_W, WINDOW_H, 0xffffff, 1).setAlpha(0).setDepth(4));
    });
    this.winLines = this.add.graphics().setDepth(5);
  }

  /** Numbered markers on both sides of the window; they light up on a win. */
  private buildPaylineTabs(): void {
    PAYLINES.forEach((line, i) => {
      this.tabs.push(
        TAB_X.map((x, side) => {
          const back = this.add.circle(0, 0, 12, COLORS.dark);
          const face = this.add.circle(0, 0, 9.5, LINE_COLORS[i]);
          const label = text(this, 0, 0.5, `${line.id}`, 11, CSS.dark);
          return this.add.container(x, this.tabY(line, side), [back, face, label]).setDepth(6).setAlpha(TAB_IDLE_ALPHA);
        }),
      );
    });
  }

  private setTabs(alpha: (lineIndex: number) => number, scale: (lineIndex: number) => number): void {
    this.tabs.forEach((pair, i) => pair.forEach((t) => t.setAlpha(alpha(i)).setScale(scale(i))));
  }

  private buildWinPanel(): void {
    this.add.rectangle(CX, PANEL_Y, 280, 52, COLORS.dark).setStrokeStyle(2, COLORS.yellow);
    this.mainMsg = text(this, CX, PANEL_Y - 7, '', 22, CSS.yellow);
    this.subMsg = text(this, CX, PANEL_Y + 15, '', 11, CSS.cream);
  }

  private buildControls(): void {
    this.minusBtn = button(this, 44, BET_ROW_Y, '−', () => this.changeBet(-1), {
      variant: 'secondary',
      width: 48,
      height: 44,
      fontSize: 26,
    });
    this.betBox = this.add.rectangle(132, BET_ROW_Y, 112, 52, COLORS.darkMid).setStrokeStyle(2, COLORS.red);
    text(this, 132, BET_ROW_Y - 17, 'TOTAL BET', 10, CSS.yellow);
    this.betValue = text(this, 132, BET_ROW_Y + 1, '', 22, CSS.cream);
    this.betSub = text(this, 132, BET_ROW_Y + 18, '', 10, CSS.cream).setAlpha(0.75);
    this.plusBtn = button(this, 220, BET_ROW_Y, '+', () => this.changeBet(1), {
      variant: 'secondary',
      width: 48,
      height: 44,
      fontSize: 26,
    });
    button(this, 300, BET_ROW_Y, 'PAYS', () => this.showPaytable(), {
      variant: 'secondary',
      width: 88,
      height: 44,
      fontSize: 17,
    });

    this.spinBtn = button(this, CX, SPIN_Y, 'SPIN', () => this.startSpin(), { width: 236, height: 64, fontSize: 32 });
    this.refillBtn = button(this, CX, SPIN_Y, 'FREE REFILL', () => this.refill(), { width: 236, height: 64, fontSize: 24 });
    this.refillBtn.setVisible(false);

    // Phones have no Space key; only show the shortcut on keyboard-only devices.
    const notice = 'For fun only - credits have no cash value';
    const footer = this.sys.game.device.input.touch ? notice : `SPACE to spin  ·  ${notice}`;
    text(this, CX, GAME_HEIGHT - 22, footer, 10, CSS.cream).setAlpha(0.6);
  }

  private buildEffects(): void {
    // Coins pop up from the win panel and rain back down, behind the BIG WIN banner.
    this.coins = this.add.particles(0, 0, SLOTS_TEXTURES.coin, {
      x: { min: 70, max: GAME_WIDTH - 70 },
      y: PANEL_Y,
      speedX: { min: -80, max: 80 },
      speedY: { min: -540, max: -380 },
      gravityY: 820,
      lifespan: 1600,
      rotate: { start: 0, end: 540 },
      scale: { min: 0.6, max: 0.95 },
      quantity: 1,
      frequency: 60,
      emitting: false,
    });
    this.coins.setDepth(15);
    this.sparkles = this.add.particles(0, 0, SLOTS_TEXTURES.sparkle, {
      speed: { min: 60, max: 260 },
      lifespan: { min: 350, max: 800 },
      scale: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [COLORS.yellow, COLORS.cream, COLORS.red],
      emitting: false,
    });
    this.sparkles.setDepth(31);
  }

  // ---------------------------------------------------------------- rounds

  private primaryAction(): void {
    if (this.paytable) {
      this.closePaytable();
      return;
    }
    if (this.isBroke()) this.refill();
    else this.startSpin();
  }

  private startSpin(): void {
    if (this.spinning || this.round || this.paytable || this.leaving || this.inputLocked()) return;
    const lineBet = LINE_BETS[this.betIndex];
    const stake = totalBet(lineBet);
    // Lock first (blocks double taps), then take the stake; no credits, no spin.
    this.spinning = true;
    if (!this.wallet.spend(stake, 'bet')) {
      this.spinning = false;
      this.refreshControls();
      this.showIdleMessage();
      return;
    }
    const outcome = spin(lineBet, this.rng);
    this.round = { outcome, settled: false };
    this.reelsLanded = 0;
    this.clearWinDisplay();
    this.setMessage('GOOD LUCK!', `BET ${stake}  ·  ${lineBet} PER LINE`);
    this.refreshControls();

    this.reels.forEach((reel, i) => {
      reel.startSpin(i * START_STAGGER_MS);
      this.time.delayedCall(FIRST_STOP_MS + i * STOP_STAGGER_MS, () =>
        reel.stopAt(outcome.stops[i], () => this.onReelLanded(i)),
      );
    });
  }

  private onReelLanded(index: number): void {
    const flash = this.reelFlashes[index];
    flash.setAlpha(0.35);
    this.tweens.add({ targets: flash, alpha: 0, duration: 220 });
    this.reelsLanded += 1;
    if (this.reelsLanded === this.reels.length) this.finishSpin();
  }

  private finishSpin(): void {
    const round = this.round;
    if (!round) return;
    this.settleRound();
    this.round = null;
    this.spinning = false;
    this.lastOutcome = round.outcome;
    this.presentResult(round.outcome);
    this.fitBetToBalance();
    this.refreshControls();
  }

  /** Pays the current round exactly once and reports it. */
  private settleRound(): void {
    const round = this.round;
    if (!round || round.settled) return;
    round.settled = true;
    const { payout, totalBet: wagered } = round.outcome;
    if (payout > 0) this.wallet.deposit(payout, 'payout');
    gameEvents.emit('casino:round', { game: 'slots', wagered, returned: payout });
  }

  /** Tab hidden or page closing mid-spin: bank the result now; the reels finish later. */
  private readonly onPageHidden = (): void => {
    this.settleRound();
  };

  private refill(): void {
    if (this.spinning || this.round || this.paytable || this.leaving || this.inputLocked()) return;
    const granted = this.wallet.refillIfBroke(MIN_TOTAL_BET);
    if (granted > 0) {
      this.lockInput();
      this.clearWinDisplay();
      this.fitBetToBalance();
      this.updateBetDisplay();
      this.setMessage(`+${granted} CREDITS`, 'FREE PLAY CREDITS  ·  NO CASH VALUE');
    }
    this.refreshControls();
  }

  private changeBet(dir: -1 | 1): void {
    if (this.spinning || this.paytable || this.inputLocked()) return;
    const next = Phaser.Math.Clamp(this.betIndex + dir, 0, LINE_BETS.length - 1);
    if (next === this.betIndex) return;
    if (dir > 0 && !this.wallet.canAfford(totalBet(LINE_BETS[next]))) return;
    this.betIndex = next;
    this.updateBetDisplay();
    this.refreshControls();
    if (!this.lastOutcome) this.showIdleMessage();
  }

  /** Steps the bet down to the largest one the balance covers. */
  private fitBetToBalance(): void {
    if (this.wallet.canAfford(totalBet(LINE_BETS[this.betIndex]))) return;
    for (let i = this.betIndex - 1; i >= 0; i--) {
      if (this.wallet.canAfford(totalBet(LINE_BETS[i]))) {
        this.betIndex = i;
        this.updateBetDisplay();
        this.tweens.add({ targets: [this.betBox, this.betValue], scale: { from: 1.15, to: 1 }, duration: 260 });
        return;
      }
    }
  }

  private isBroke(): boolean {
    return !this.spinning && !this.round && this.wallet.balance < MIN_TOTAL_BET;
  }

  private refreshControls(): void {
    const busy = this.spinning || !!this.round;
    const broke = this.isBroke();
    const bet = totalBet(LINE_BETS[this.betIndex]);
    this.spinBtn.setVisible(!broke);
    this.spinBtn.setEnabled(!busy && this.wallet.canAfford(bet));
    this.refillBtn.setVisible(broke);
    this.refillBtn.setEnabled(broke);
    this.minusBtn.setEnabled(!busy && this.betIndex > 0);
    const next = LINE_BETS[this.betIndex + 1];
    this.plusBtn.setEnabled(!busy && next !== undefined && this.wallet.canAfford(totalBet(next)));
    if (broke && !this.lastOutcome) this.showIdleMessage();
  }

  private updateBetDisplay(): void {
    const lineBet = LINE_BETS[this.betIndex];
    this.betValue.setText(`${totalBet(lineBet)}`);
    this.betSub.setText(`${lineBet} × ${PAYLINES.length} LINES`);
  }

  private showIdleMessage(): void {
    if (this.isBroke()) this.setMessage('OUT OF CREDITS', 'TAP FREE REFILL FOR MORE PLAY CREDITS');
    else if (!this.wallet.canAfford(totalBet(LINE_BETS[this.betIndex]))) this.setMessage('BET TOO HIGH', 'LOWER YOUR BET');
    else this.setMessage('TAP SPIN!', 'LUCKY TACO IS WILD  ·  5 LINES');
  }

  private setMessage(main: string, sub: string, color: string = CSS.yellow): void {
    this.mainMsg.setText(main).setColor(color).setScale(1);
    this.subMsg.setText(sub);
  }

  // ---------------------------------------------------------------- results

  private presentResult(outcome: SpinOutcome): void {
    if (outcome.wins.length === 0) {
      if (this.isBroke()) this.showIdleMessage();
      else this.setMessage('NO WIN', 'SPIN AGAIN!', CSS.cream);
      return;
    }

    this.highlightCells(outcome.wins);
    this.drawLines(outcome.wins);
    outcome.wins.forEach((w) => {
      const [reel, row] = w.cells[1];
      this.sparkles.explode(outcome.isBigWin ? 4 : 10, REEL_X[reel], ROW_Y[row]);
    });

    const big = outcome.isBigWin;
    const countMs = big ? 1800 : 700;
    this.mainMsg.setColor(CSS.yellow);
    this.subMsg.setText(outcome.wins.length === 1 ? this.describe(outcome.wins[0]) : `${outcome.wins.length} WINNING LINES`);
    const counter = this.tweens.addCounter({
      from: 0,
      to: outcome.payout,
      duration: countMs,
      ease: big ? 'Sine.out' : 'Cubic.out',
      onUpdate: (tw) => this.mainMsg.setText(`WIN ${Math.round(tw.getValue() ?? 0).toLocaleString()}`),
      onComplete: () => {
        this.mainMsg.setText(`WIN ${outcome.payout.toLocaleString()}`);
        this.winTweens.push(this.tweens.add({ targets: this.mainMsg, scale: 1.12, duration: 160, yoyo: true }));
      },
    });
    this.winTweens.push(counter);

    if (big) this.celebrate(outcome);

    if (outcome.wins.length > 1) {
      // After the count-up, step through the winning lines one at a time.
      let i = 0;
      const showNext = () => {
        const w = outcome.wins[i % outcome.wins.length];
        this.drawLines([w]);
        this.subMsg.setText(this.describe(w));
        i += 1;
      };
      this.winTimers.push(
        this.time.delayedCall(countMs + 500, () => {
          showNext();
          this.winTimers.push(this.time.addEvent({ delay: LINE_CYCLE_MS, loop: true, callback: showNext }));
        }),
      );
    }
  }

  private describe(win: LineWin): string {
    const what = win.symbol === WILD ? 'JACKPOT' : `3 ${SYMBOL_INFO[win.symbol].name.toUpperCase()}`;
    return `LINE ${win.line.id}  ·  ${what}  ·  +${win.amount.toLocaleString()}`;
  }

  private highlightCells(wins: LineWin[]): void {
    const seen = new Set<string>();
    this.winGlow.clear();
    this.winFrames.clear();
    for (const win of wins) {
      for (const [reel, row] of win.cells) {
        const key = `${reel}:${row}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const x = REEL_X[reel] - REEL_W / 2 + 4;
        const y = ROW_Y[row] - CELL_H / 2 + 3;
        this.winGlow.fillStyle(COLORS.yellow, 0.5);
        this.winGlow.fillRoundedRect(x, y, REEL_W - 8, CELL_H - 6, 8);
        this.winFrames.lineStyle(3, COLORS.yellowDark);
        this.winFrames.strokeRoundedRect(x, y, REEL_W - 8, CELL_H - 6, 8);
        const img = this.reels[reel].imageForRow(row);
        this.winTweens.push(
          this.tweens.add({ targets: img, scale: img.scaleX * 1.12, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut' }),
        );
      }
    }
    const lit = new Set(wins.map((w) => PAYLINES.indexOf(w.line)));
    this.setTabs(
      (i) => (lit.has(i) ? 1 : 0.35),
      () => 1,
    );
  }

  private drawLines(wins: LineWin[]): void {
    const g = this.winLines;
    g.clear();
    const drawn = new Set(wins.map((w) => PAYLINES.indexOf(w.line)));
    this.tabs.forEach((pair, i) => pair.forEach((t) => t.setScale(drawn.has(i) ? 1.15 : 1)));
    for (const win of wins) {
      const i = PAYLINES.indexOf(win.line);
      const pts = [
        { x: TAB_X[0] + 11, y: this.tabY(win.line, 0) },
        ...win.line.rows.map((row, reel) => ({ x: REEL_X[reel], y: ROW_Y[row] })),
        { x: TAB_X[1] - 11, y: this.tabY(win.line, 1) },
      ];
      for (const [width, color] of [
        [9, COLORS.dark],
        [4, LINE_COLORS[i]],
      ] as const) {
        g.lineStyle(width, color, 0.95);
        g.beginPath();
        pts.forEach((p, n) => (n === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
        g.strokePath();
      }
    }
  }

  private celebrate(outcome: SpinOutcome): void {
    this.celebrateUntil = this.time.now + 3000;
    this.cameras.main.flash(260, 255, 195, 0);
    this.coins.start();
    this.winTimers.push(this.time.delayedCall(1300, () => this.coins.stop()));
    this.sparkles.explode(40, CX, MID_Y);
    try {
      navigator.vibrate?.([80, 60, 120]);
    } catch {
      // Vibration is optional.
    }

    // The banner takes over the marquee so the winning symbols stay in view.
    const label = outcome.isJackpot ? 'JACKPOT!' : 'BIG WIN!';
    const band = this.add.rectangle(0, 0, 326, MARQUEE_H + 10, COLORS.dark, 1).setStrokeStyle(3, COLORS.yellow);
    const title = text(this, 0, -7, label, 34, CSS.yellow).setStroke(CSS.red, 7);
    const mult = text(this, 0, 21, `${Math.floor(outcome.payout / outcome.totalBet)}× YOUR BET`, 12, CSS.cream);
    this.banner = this.add
      .container(CX, MARQUEE_TOP + MARQUEE_H / 2, [band, title, mult])
      .setDepth(20)
      .setScale(0);
    this.winTweens.push(
      this.tweens.add({ targets: this.banner, scale: 1, duration: 420, ease: 'Back.out' }),
      this.tweens.add({ targets: title, scale: 1.08, duration: 300, yoyo: true, repeat: -1, delay: 420 }),
    );
    const banner = this.banner;
    this.winTimers.push(
      this.time.delayedCall(3000, () => {
        this.winTweens.push(
          this.tweens.add({
            targets: banner,
            alpha: 0,
            duration: 300,
            onComplete: () => {
              banner.destroy();
              if (this.banner === banner) this.banner = null;
            },
          }),
        );
      }),
    );
  }

  private clearWinDisplay(): void {
    this.winTweens.forEach((t) => t.stop());
    this.winTimers.forEach((t) => t.remove(false));
    this.winTweens = [];
    this.winTimers = [];
    this.reels.forEach((r) => r.redraw());
    this.winGlow.clear();
    this.winFrames.clear();
    this.winLines.clear();
    this.setTabs(
      () => TAB_IDLE_ALPHA,
      () => 1,
    );
    this.banner?.destroy();
    this.banner = null;
    this.coins.stop();
    this.celebrateUntil = 0;
    this.mainMsg.setScale(1);
    this.lastOutcome = null;
  }

  // ---------------------------------------------------------------- paytable / navigation

  private showPaytable(): void {
    if (this.paytable || this.leaving || this.inputLocked()) return;
    this.paytable = openPaytable(this, () => {
      this.paytable = null;
      // CLOSE sits partly over SPIN and the backdrop over GAMES: swallow a follow-up tap.
      this.lockInput();
      this.refreshControls();
    });
  }

  private closePaytable(): void {
    this.paytable?.close();
  }

  private leave(): void {
    if (this.leaving || this.inputLocked()) return;
    this.leaving = true;
    this.scene.start(SCENES.lobby);
  }

  private lockInput(): void {
    this.inputLockedUntil = this.time.now + INPUT_LOCK_MS;
  }

  private inputLocked(): boolean {
    return this.time.now < this.inputLockedUntil;
  }

  /** Y of a payline's side marker (side 0 = left, 1 = right). */
  private tabY(line: Payline, side: number): number {
    const row = line.rows[side === 0 ? 0 : 2];
    if (row === 1) return ROW_Y[1];
    const straight = line.rows.every((r) => r === row);
    // Straight lines sit toward the outside edge, diagonals toward the middle.
    const outward = row === 0 ? -1 : 1;
    return ROW_Y[row] + (straight ? outward : -outward) * TAB_NUDGE;
  }
}
