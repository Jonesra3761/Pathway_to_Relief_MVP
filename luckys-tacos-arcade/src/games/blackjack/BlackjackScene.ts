import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config/gameConfig';
import { COLORS, CSS, FONT_FAMILY } from '../../config/theme';
import { SCENES } from '../../scenes/keys';
import { backButton, button, creditPill, text, type ArcadeButton } from '../../scenes/ui';
import { gameEvents } from '../../services/gameEvents';
import { getWallet } from '../../services/wallet';
import type { CreditWallet } from '../../systems/CreditWallet';
import { browserStore } from '../../systems/ScoreManager';
import {
  BET_CHIPS,
  BlackjackGame,
  MIN_BET,
  describeHand,
  describeRound,
  handValue,
  type Action,
  type Card,
  type HandResult,
  type TableEvent,
} from './blackjackEngine';
import { CardView } from './CardView';
import { OpenRoundLog, recoverOpenRound } from './openRound';
import {
  BET_CIRCLE_Y,
  BJ_TEXTURES,
  CARD_H,
  CARD_W,
  CHIP_ORIGIN,
  CHIP_STYLES,
  ensureBlackjackTextures,
} from './textures';

const CX = GAME_WIDTH / 2;
const FELT_TOP = 56;
const SHOE = { x: 316, y: 102 };
const DEALER = { x: 166, y: 142, maxStep: 28, maxWidth: 232 };
const PLAYER_Y = 336;
/** Matches the betting circle printed on the felt texture. */
const STAKE_Y = FELT_TOP + BET_CIRCLE_Y;
const SPLIT_X = [94, 266];
/**
 * Each split hand fans inside its own half of the felt, so a long hand (and
 * its highlight) stays off the rail and never covers the other hand.
 */
const SPLIT_LANES = [
  { left: 34, right: CX - 2 },
  { left: CX + 2, right: 326 },
];
const CHIP_ROW_Y = 516;
const BOTTOM_BTN_Y = 584;
const ACTION_ROWS = [522, 584];

const FLY_MS = 210;
const FLIP_MS = 130;
const CARD_STEP_MS = 360;
const DEFAULT_BET = 10;
/**
 * Betting input (chips, DEAL, FREE REFILL) is ignored this long after a round
 * settles or a refill lands. Those controls appear under STAND/HIT and in
 * FREE REFILL's spot, so the second tap of a double tap would otherwise
 * pick a chip or deal a hand nobody asked for. DEAL shows as disabled meanwhile.
 */
const INPUT_LOCK_MS = 450;
const IDLE_PROMPT = 'PICK A CHIP, THEN DEAL';

const BADGES: Record<HandResult, { label: string; bg: string; fg: string }> = {
  blackjack: { label: 'BLACKJACK!', bg: CSS.yellow, fg: CSS.red },
  win: { label: 'WIN', bg: CSS.lime, fg: CSS.dark },
  push: { label: 'PUSH', bg: CSS.darkMid, fg: CSS.cream },
  lose: { label: 'LOSE', bg: CSS.dark, fg: '#ff7a7a' },
  bust: { label: 'BUST', bg: CSS.red, fg: CSS.cream },
};

interface ChipButton {
  value: number;
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
}

/**
 * Taco 21: single-seat blackjack against the house for play credits.
 * Rules and credits live in blackjackEngine; this scene animates the
 * engine's event log and keeps input locked while cards are moving.
 */
export class BlackjackScene extends Phaser.Scene {
  private wallet!: CreditWallet;
  private engine!: BlackjackGame;
  private openRound!: OpenRoundLog;
  /** The chip the player picked; kept while they can't afford it so it comes back after a refill. */
  private preferredBet = DEFAULT_BET;
  /** The bet DEAL will place: the preferred chip, or the largest one the balance still covers. */
  private bet = DEFAULT_BET;
  /** Base bet of the round on the table; its stakes stay on show until a different chip is picked. */
  private dealtBet = 0;
  /** True while the betting circle shows the round's stakes rather than a preview of the next bet. */
  private roundStakesShown = false;
  /** Betting input is briefly ignored after a settle or refill (see INPUT_LOCK_MS). */
  private betLocked = false;
  private betLockTimer?: Phaser.Time.TimerEvent;
  /** True while cards are animating; all round input is ignored. */
  private busy = false;
  private leaving = false;
  /** False once the scene has shut down (guards late window/wallet callbacks). */
  private alive = false;
  /** Bumped to cancel an in-flight animation chain. */
  private playToken = 0;
  /** Set when the round was force-settled while the page was hidden. */
  private stale = false;

  private dealerCards: CardView[] = [];
  private handCards: CardView[][] = [];

  private back!: Phaser.GameObjects.Container;
  private shoe!: Phaser.GameObjects.Image;
  private banner!: Phaser.GameObjects.Text;
  private refillHint!: Phaser.GameObjects.Text;
  private dealerTotal!: Phaser.GameObjects.Text;
  private handTotals: Phaser.GameObjects.Text[] = [];
  private badges: Phaser.GameObjects.Text[] = [];
  private stakes: Phaser.GameObjects.Container[] = [];
  private glow!: Phaser.GameObjects.Graphics;
  private feltLogo!: Phaser.GameObjects.Container;
  private chips: ChipButton[] = [];
  private dealButton!: ArcadeButton;
  private refillButton!: ArcadeButton;
  private actionButtons = {} as Record<Action, ArcadeButton>;

  constructor() {
    super(SCENES.blackjack);
  }

  create(): void {
    // Scenes are reused: reset every bit of per-visit state.
    this.wallet = getWallet();
    this.alive = true;
    this.busy = false;
    this.leaving = false;
    this.stale = false;
    this.playToken = 0;
    this.dealerCards = [];
    this.handCards = [];
    this.handTotals = [];
    this.badges = [];
    this.stakes = [];
    this.chips = [];
    this.actionButtons = {} as Record<Action, ArcadeButton>;
    this.preferredBet = DEFAULT_BET;
    this.bet = DEFAULT_BET;
    this.dealtBet = 0;
    this.roundStakesShown = false;
    this.betLocked = false;
    this.betLockTimer = undefined;
    this.openRound = new OpenRoundLog(browserStore());
    // A tab the browser discarded mid-hand left its stake on the table: hand it back.
    const refunded = recoverOpenRound(this.openRound, this.wallet, (wagered) =>
      gameEvents.emit('casino:round', { game: 'blackjack', wagered, returned: wagered }),
    );
    this.engine = new BlackjackGame(this.wallet, {
      onRound: (s) => {
        this.openRound.clear();
        gameEvents.emit('casino:round', { game: 'blackjack', wagered: s.wagered, returned: s.returned });
      },
    });

    ensureBlackjackTextures(this);
    this.cameras.main.setBackgroundColor(COLORS.dark);
    this.drawTable();
    this.buildControls();

    this.back = backButton(this, () => this.leave());
    creditPill(this, GAME_WIDTH - 72, 30);
    text(this, 163, 30, 'TACO 21', 18, CSS.yellow).setStroke(CSS.red, 4);

    const kb = this.input.keyboard;
    kb?.on('keydown-H', () => this.onAction('hit'));
    kb?.on('keydown-S', () => this.onAction('stand'));
    kb?.on('keydown-D', () => this.onAction('double'));
    kb?.on('keydown-P', () => this.onAction('split'));
    kb?.on('keydown-SPACE', () => this.onDeal());
    kb?.on('keydown-ENTER', () => this.onDeal());
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) => kb?.on(`keydown-${k}`, () => this.selectBet(BET_CHIPS[i])));

    const offWallet = this.wallet.onChange(() => this.refreshUi());
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      offWallet();
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener('pageshow', this.onPageShow);
      // Leaving mid-hand: remaining hands stand, the dealer plays, credits are paid.
      this.settleNow();
    });

    if (refunded > 0) this.setBanner(`UNFINISHED HAND REFUNDED  +${refunded}`, CSS.yellow);
    else this.setBanner(this.wallet.balance < MIN_BET ? '' : IDLE_PROMPT, CSS.cream);
    this.refreshUi();
  }

  // ---------------------------------------------------------------------------
  // Table drawing
  // ---------------------------------------------------------------------------

  private drawTable(): void {
    this.add.image(CX, FELT_TOP, BJ_TEXTURES.felt).setOrigin(0.5, 0);
    this.arcText('BLACKJACK PAYS 3 TO 2', 232, 330, 14, CSS.yellow);
    this.arcText('DEALER STANDS ON SOFT 17', 252, 350, 11, CSS.cream, 0.8);
    this.shoe = this.add.image(SHOE.x, SHOE.y, BJ_TEXTURES.shoe).setDepth(30);

    this.dealerTotal = this.pill(DEALER.x, DEALER.y + 52);
    this.banner = text(this, CX, 278, '', 15, CSS.cream).setStroke(CSS.dark, 5).setDepth(45);
    this.glow = this.add.graphics().setDepth(5).setVisible(false);
    // Faint house branding printed where the dealer's cards land; cleared on the first deal.
    this.feltLogo = this.add.container(DEALER.x, DEALER.y, [
      text(this, 0, -6, "LUCKY'S TACOS", 22, CSS.yellow).setAlpha(0.14),
      text(this, 0, 18, 'TACO 21', 13, CSS.cream).setAlpha(0.14),
    ]);
    text(this, CX, GAME_HEIGHT - 12, 'Play credits only. No cash value.', 10, CSS.cream).setAlpha(0.5);
  }

  /** Felt lettering that follows the curve of the rail. */
  private arcText(value: string, y: number, radius: number, size: number, color: string, alpha = 1): void {
    const letters = [...value].map((ch) =>
      this.add
        .text(0, 0, ch, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, fontStyle: 'bold' })
        .setResolution(2)
        .setOrigin(0.5)
        .setAlpha(alpha),
    );
    const spacing = size * 0.12;
    const total = letters.reduce((w, l) => w + l.width + spacing, -spacing);
    const cy = y - radius;
    let s = -total / 2;
    for (const l of letters) {
      const mid = s + l.width / 2;
      const a = Math.PI / 2 - mid / radius;
      l.setPosition(CX + Math.cos(a) * radius, cy + Math.sin(a) * radius).setRotation(a - Math.PI / 2);
      s += l.width + spacing;
    }
  }

  private pill(x: number, y: number): Phaser.GameObjects.Text {
    return text(this, x, y, '', 13, CSS.cream)
      .setBackgroundColor('rgba(26,14,10,0.78)')
      .setPadding(8, 3, 8, 3)
      .setDepth(35)
      .setVisible(false);
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  private buildControls(): void {
    BET_CHIPS.forEach((value, i) => {
      const x = CX + (i - 1.5) * 72;
      const ring = this.add.circle(0, 0, 28).setStrokeStyle(3, COLORS.yellow).setVisible(false);
      const img = this.add.image(0, 0, BJ_TEXTURES.chip(value)).setOrigin(CHIP_ORIGIN.x, CHIP_ORIGIN.y);
      const label = text(this, 0, 0, `${value}`, 15, CHIP_STYLES[value].label);
      const container = this.add.container(x, CHIP_ROW_Y, [ring, img, label]).setSize(64, 60).setDepth(20);
      container.setInteractive({ useHandCursor: true });
      container.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.selectBet(value));
      this.chips.push({ value, container, ring });
    });

    this.dealButton = button(this, CX, BOTTOM_BTN_Y, 'DEAL', () => this.onDeal(), { width: 220 });
    this.refillButton = button(this, CX, BOTTOM_BTN_Y, 'FREE REFILL', () => this.onRefill(), {
      width: 220,
      variant: 'secondary',
    });
    // Takes the chip row's place while broke, so the last round's result banner stays readable.
    this.refillHint = text(this, CX, CHIP_ROW_Y, 'OUT OF CREDITS: TAP FREE REFILL', 14, CSS.yellow)
      .setStroke(CSS.dark, 4)
      .setDepth(20)
      .setVisible(false);

    const opts = { width: 164, height: 50, fontSize: 19 };
    this.actionButtons = {
      hit: button(this, SPLIT_X[0], ACTION_ROWS[0], 'HIT', () => this.onAction('hit'), opts),
      stand: button(this, SPLIT_X[1], ACTION_ROWS[0], 'STAND', () => this.onAction('stand'), opts),
      double: button(this, SPLIT_X[0], ACTION_ROWS[1], 'DOUBLE', () => this.onAction('double'), {
        ...opts,
        variant: 'secondary',
      }),
      split: button(this, SPLIT_X[1], ACTION_ROWS[1], 'SPLIT', () => this.onAction('split'), {
        ...opts,
        variant: 'secondary',
      }),
    };
  }

  /** Shows the controls that fit the current phase and enables only what is allowed. */
  private refreshUi(): void {
    if (!this.alive) return;
    const midRound = this.busy || this.engine.inRound;
    const balance = this.wallet.balance;
    const broke = balance < MIN_BET;

    // Never let the player walk away from a live hand by accident.
    this.back.setVisible(!midRound);

    if (!midRound) {
      // Drop to a chip the balance covers, but go back up to the chosen one once it is affordable.
      const affordable = BET_CHIPS.filter((v) => v <= this.preferredBet && v <= balance);
      this.bet = affordable.length ? affordable[affordable.length - 1] : this.preferredBet;
    }
    for (const chip of this.chips) {
      const selected = chip.value === this.bet;
      chip.container.setVisible(!midRound && !broke);
      chip.container.setAlpha(this.wallet.canAfford(chip.value) ? 1 : 0.35);
      chip.container.y = CHIP_ROW_Y - (selected ? 5 : 0);
      chip.ring.setVisible(selected);
    }
    this.dealButton.setVisible(!midRound && !broke).setEnabled(!this.betLocked).setLabel(`DEAL  ${this.bet}`);
    this.refillButton.setVisible(!midRound && broke).setEnabled(!this.betLocked);
    this.refillHint.setVisible(!midRound && broke);
    // The hint says it all; only the idle prompt gives way, a round's result banner stays up.
    if (!midRound && broke && this.banner.text === IDLE_PROMPT) this.setBanner('', CSS.cream);
    // Between rounds the circle previews the next bet, unless it still shows last round's stakes for that bet.
    if (!midRound && !(this.roundStakesShown && this.bet === this.dealtBet)) this.renderPreview();

    const allowed = this.busy ? [] : this.engine.availableActions();
    (Object.keys(this.actionButtons) as Action[]).forEach((a) => {
      this.actionButtons[a].setVisible(midRound).setEnabled(allowed.includes(a));
    });

    this.updateGlow();
  }

  /** True while chips, DEAL and FREE REFILL should ignore input. */
  private bettingLocked(): boolean {
    return this.busy || this.engine.inRound || this.leaving || this.betLocked;
  }

  private lockBetting(): void {
    this.betLocked = true;
    this.betLockTimer?.remove();
    this.betLockTimer = this.time.delayedCall(INPUT_LOCK_MS, () => {
      this.betLocked = false;
      this.refreshUi();
    });
  }

  private selectBet(value: number): void {
    if (this.bettingLocked() || !this.wallet.canAfford(value)) return;
    this.preferredBet = value;
    this.refreshUi();
  }

  private onRefill(): void {
    if (this.bettingLocked()) return;
    if (this.wallet.refillIfBroke(MIN_BET) > 0) {
      // DEAL appears exactly where FREE REFILL was: don't let the second tap of a double tap deal.
      this.lockBetting();
      this.setBanner('FREE REFILL! GOOD LUCK', CSS.yellow);
    }
    this.refreshUi();
  }

  private leave(): void {
    if (this.leaving || this.busy || this.engine.inRound) return;
    this.leaving = true;
    this.scene.start(SCENES.lobby);
  }

  // ---------------------------------------------------------------------------
  // Round flow
  // ---------------------------------------------------------------------------

  private onDeal(): void {
    if (this.bettingLocked()) return;
    if (this.wallet.balance < MIN_BET) {
      // Broke (e.g. Space pressed): point at the refill instead of replacing the result banner.
      this.tweens.add({ targets: this.refillHint, scale: { from: 1.15, to: 1 }, duration: 220 });
      return;
    }
    if (this.engine.canDeal(this.bet)) {
      this.setBanner('NOT ENOUGH CREDITS', CSS.red);
      return;
    }
    // Lock first so a double tap can never deal twice.
    this.busy = true;
    const hadCards = this.clearTable();
    const res = this.engine.deal(this.bet);
    if (!res.ok) {
      this.busy = false;
      this.refreshUi();
      return;
    }
    this.openRound.save(this.engine.wagered);
    this.dealtBet = this.bet;
    this.setBanner('', CSS.cream);
    this.tweens.add({ targets: this.feltLogo, alpha: 0, duration: 200 });
    this.renderStakes();
    this.refreshUi();
    const token = ++this.playToken;
    this.time.delayedCall(hadCards ? 200 : 0, () => {
      if (token === this.playToken) this.play(res.events);
    });
  }

  private onAction(action: Action): void {
    if (this.busy || this.engine.phase !== 'player') return;
    this.busy = true;
    const res = this.engine.act(action);
    if (!res.ok) {
      this.busy = false;
      this.refreshUi();
      return;
    }
    // Double and split take another stake.
    this.openRound.save(this.engine.wagered);
    this.renderStakes();
    this.refreshUi();
    this.play(res.events);
  }

  /** Animates engine events one after another, then hands control back. */
  private play(events: TableEvent[]): void {
    const token = ++this.playToken;
    const step = (i: number) => {
      if (token !== this.playToken) return;
      if (i >= events.length) {
        this.afterEvents();
        return;
      }
      const wait = this.animate(events[i]);
      this.time.delayedCall(wait, () => step(i + 1));
    };
    step(0);
  }

  private afterEvents(): void {
    if (this.engine.phase === 'dealer') {
      this.play(this.engine.playDealer().events);
      return;
    }
    if (this.engine.phase === 'settled') {
      this.engine.payout();
      this.showResults();
      // The chip row and DEAL come back under the HIT/STAND/DOUBLE/SPLIT buttons just tapped.
      this.lockBetting();
    }
    if (this.engine.phase === 'player' && this.handCards.length === 1) this.setBanner('', CSS.cream);
    this.busy = false;
    this.updateLabels();
    this.refreshUi();
  }

  private animate(e: TableEvent): number {
    switch (e.type) {
      case 'shuffle':
        this.setBanner('SHUFFLING A FRESH SHOE', CSS.yellow);
        this.tweens.add({ targets: this.shoe, angle: { from: -8, to: 8 }, duration: 90, yoyo: true, repeat: 3 });
        return 800;
      case 'card':
        this.dealCard(e.to, e.card, !e.faceDown);
        return CARD_STEP_MS;
      case 'split': {
        const [first, second] = this.handCards[e.hand];
        this.handCards.splice(e.hand, 1, [first], [second]);
        this.renderStakes();
        this.layoutPlayer(260);
        this.updateLabels();
        return 320;
      }
      case 'peek': {
        const hole = this.dealerCards[1];
        if (hole) this.tweens.add({ targets: hole, y: hole.y - 8, duration: 140, yoyo: true, hold: 120 });
        this.setBanner('DEALER CHECKS FOR BLACKJACK', CSS.cream);
        return 560;
      }
      case 'reveal':
        this.dealerCards[1]?.flip(true, 220);
        this.time.delayedCall(230, () => this.updateLabels());
        return 360;
      case 'settled':
        return 0;
    }
  }

  /** Flies a card from the shoe to its slot and flips it if it is dealt face up. */
  private dealCard(to: number | 'dealer', card: Card, faceUp: boolean): void {
    const list = to === 'dealer' ? this.dealerCards : (this.handCards[to] ??= []);
    const view = new CardView(this, SHOE.x, SHOE.y + 4, card, false).setScale(0.85).setAngle(-25);
    view.setDepth(10 + list.length);
    list.push(view);
    if (to === 'dealer') this.layoutDealer(FLY_MS, view);
    else this.layoutPlayer(FLY_MS, view);
    this.tweens.add({
      targets: view,
      scale: 1,
      angle: 0,
      duration: FLY_MS,
      ease: 'Cubic.out',
      onComplete: () => {
        if (!faceUp || !view.active) return;
        view.flip(true, FLIP_MS);
        this.time.delayedCall(FLIP_MS / 2, () => this.updateLabels());
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Layout and labels
  // ---------------------------------------------------------------------------

  /** X positions for an overlapping fan that never exceeds maxWidth. */
  private fan(count: number, cx: number, maxStep: number, maxWidth: number): number[] {
    const step = count > 1 ? Math.min(maxStep, (maxWidth - CARD_W) / (count - 1)) : 0;
    const x0 = cx - (step * (count - 1)) / 2;
    return Array.from({ length: count }, (_, i) => x0 + i * step);
  }

  private handX(i: number, count = this.handCards.length): number {
    return count > 1 ? SPLIT_X[i] : CX;
  }

  private layoutDealer(duration: number, moving?: CardView): void {
    const xs = this.fan(this.dealerCards.length, DEALER.x, DEALER.maxStep, DEALER.maxWidth);
    this.dealerCards.forEach((v, i) => this.moveCard(v, xs[i], DEALER.y, duration, v === moving));
  }

  /** Card x positions for player hand h; a split hand slides (then tightens) to stay in its lane. */
  private playerFan(h: number, count: number): number[] {
    if (this.handCards.length <= 1) return this.fan(count, CX, 30, 300);
    const lane = SPLIT_LANES[h];
    const xs = this.fan(count, this.handX(h), 18, lane.right - lane.left);
    const half = CARD_W / 2;
    const shift = Math.max(0, lane.left - (xs[0] - half)) + Math.min(0, lane.right - (xs[xs.length - 1] + half));
    return xs.map((x) => x + shift);
  }

  private layoutPlayer(duration: number, moving?: CardView): void {
    this.handCards.forEach((cards, h) => {
      const xs = this.playerFan(h, cards.length);
      cards.forEach((v, i) => {
        v.setDepth(10 + i);
        this.moveCard(v, xs[i], PLAYER_Y, duration, v === moving);
      });
    });
  }

  private moveCard(v: CardView, x: number, y: number, duration: number, fromShoe: boolean): void {
    if (duration <= 0) {
      v.setPosition(x, y);
      return;
    }
    this.tweens.add({ targets: v, x, y, duration, ease: fromShoe ? 'Cubic.out' : 'Sine.inOut' });
  }

  /** Hand totals from the cards the player can actually see right now. */
  private updateLabels(): void {
    const dealerShown = this.dealerCards.filter((v) => v.faceUp).map((v) => v.card);
    this.dealerTotal.setVisible(dealerShown.length > 0).setText(`DEALER  ${describeHand(dealerShown)}`);

    const split = this.handCards.length > 1;
    this.handCards.forEach((cards, h) => {
      const shown = cards.filter((v) => v.faceUp).map((v) => v.card);
      const label = (this.handTotals[h] ??= this.pill(0, PLAYER_Y + 52));
      label.setPosition(this.handX(h), PLAYER_Y + 52);
      label.setVisible(shown.length > 0).setText(describeHand(shown, !split));
      if (handValue(shown).total > 21 && !this.badges[h]) this.showBadge(h, 'bust');
    });
    for (let h = this.handCards.length; h < this.handTotals.length; h++) this.handTotals[h].setVisible(false);
    this.updateGlow();
  }

  /** Highlights the hand being played after a split; the other hand dims. */
  private updateGlow(): void {
    const playing = this.engine.phase === 'player' && this.handCards.length > 1;
    this.glow.setVisible(playing);
    if (playing) {
      const h = this.engine.active;
      const xs = this.playerFan(h, this.handCards[h]?.length ?? 1);
      const left = Math.min(...xs) - CARD_W / 2 - 7;
      const width = Math.max(...xs) - Math.min(...xs) + CARD_W + 16;
      const top = PLAYER_Y - CARD_H / 2 - 7;
      this.glow.clear();
      this.glow.fillStyle(COLORS.yellow, 0.1);
      this.glow.fillRoundedRect(left, top, width, CARD_H + 16, 9);
      this.glow.lineStyle(2, COLORS.yellow, 0.95);
      this.glow.strokeRoundedRect(left, top, width, CARD_H + 16, 9);
    }
    this.handCards.forEach((cards, h) => {
      const dim = playing && h !== this.engine.active;
      cards.forEach((v) => v.setDim(dim));
    });
    if (playing) {
      this.setBanner(`PLAYING HAND ${this.engine.active + 1} OF 2`, CSS.yellow);
    }
  }

  /** Chip stacks showing what is riding on each hand of the round. */
  private renderStakes(): void {
    const hands = this.engine.hands;
    this.drawStakes(hands, this.handCards.length || hands.length);
    this.roundStakesShown = true;
  }

  /** A single chip in the circle for the bet DEAL will place (empty when it can't be covered). */
  private renderPreview(): void {
    this.drawStakes(this.wallet.canAfford(this.bet) ? [{ stake: this.bet, doubled: false }] : [], 1);
    this.roundStakesShown = false;
  }

  private drawStakes(hands: readonly { stake: number; doubled: boolean }[], count: number): void {
    this.stakes.forEach((s) => s.destroy());
    this.stakes = [];
    hands.forEach((hand, i) => {
      if (i >= count) return;
      const base = hand.doubled ? hand.stake / 2 : hand.stake;
      const parts: Phaser.GameObjects.GameObject[] = [];
      const layers = hand.doubled ? 2 : 1;
      for (let k = 0; k < layers; k++) {
        parts.push(
          this.add
            .image(k * 6, -k * 5, BJ_TEXTURES.chip(base))
            .setOrigin(CHIP_ORIGIN.x, CHIP_ORIGIN.y)
            .setScale(0.82),
        );
      }
      const top = (layers - 1) * 6;
      parts.push(text(this, top, -(layers - 1) * 5, `${base}`, 13, CHIP_STYLES[base].label));
      if (hand.doubled) parts.push(text(this, 34, 0, `${hand.stake}`, 13, CSS.yellow).setStroke(CSS.dark, 3));
      this.stakes.push(this.add.container(this.handX(i, count), STAKE_Y, parts).setDepth(8));
    });
  }

  private showBadge(h: number, result: HandResult): void {
    this.badges[h]?.destroy();
    const style = BADGES[result];
    // Sits over the lower half of the cards so the corner ranks stay readable.
    const badge = text(this, this.handX(h), PLAYER_Y + 14, style.label, 17, style.fg)
      .setBackgroundColor(style.bg)
      .setPadding(10, 4, 10, 4)
      .setAngle(-7)
      .setDepth(40);
    this.badges[h] = badge;
    this.tweens.add({ targets: badge, scale: { from: 0.3, to: 1 }, duration: 260, ease: 'Back.out' });
  }

  private showResults(): void {
    const s = this.engine.settlement;
    if (!s) return;
    s.hands.forEach((h, i) => {
      if (this.badges[i]?.text !== BADGES[h.result].label) this.showBadge(i, h.result);
    });
    const summary = describeRound(s);
    this.setBanner(summary.text, summary.tone === 'win' ? CSS.yellow : CSS.cream);
  }

  private setBanner(value: string, color: string): void {
    if (value === this.banner.text && color === this.banner.style.color) return;
    this.banner.setText(value).setColor(color);
    if (!value) return;
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: { from: 0.85, to: 1 }, duration: 180, ease: 'Back.out' });
  }

  /** Sweeps the last round's cards away. Returns true if there were any. */
  private clearTable(): boolean {
    const old = [...this.dealerCards, ...this.handCards.flat()];
    this.dealerCards = [];
    this.handCards = [];
    this.badges.forEach((b) => b?.destroy());
    this.badges = [];
    this.handTotals.forEach((t) => t.setVisible(false));
    this.dealerTotal.setVisible(false);
    this.stakes.forEach((s) => s.destroy());
    this.stakes = [];
    this.roundStakesShown = false;
    old.forEach((v) =>
      this.tweens.add({ targets: v, alpha: 0, y: v.y - 14, duration: 180, onComplete: () => v.destroy() }),
    );
    return old.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Leaving mid-round
  // ---------------------------------------------------------------------------

  /** Resolves and pays any unfinished round immediately. Safe to call repeatedly. */
  private settleNow(): boolean {
    if (!this.engine.inRound) return false;
    this.playToken++;
    this.engine.finishRound();
    this.engine.payout();
    return true;
  }

  /** Closing or reloading the tab mid-hand still resolves the stake. */
  private onPageHide = (): void => {
    if (this.settleNow()) this.stale = true;
  };

  /** Back from the browser's page cache: redraw the round that was settled on exit. */
  private onPageShow = (): void => {
    if (!this.stale || !this.alive) return;
    this.stale = false;
    this.rebuildFromState();
  };

  /** Redraws the table from engine state with no animation. */
  private rebuildFromState(): void {
    this.playToken++;
    this.clearTable();
    const e = this.engine;
    this.dealerCards = e.dealer.map((c, i) => new CardView(this, 0, 0, c, i !== 1 || e.holeRevealed));
    this.handCards = e.hands.map((h) => h.cards.map((c) => new CardView(this, 0, 0, c, true)));
    this.dealerCards.forEach((v, i) => v.setDepth(10 + i));
    this.layoutDealer(0);
    this.layoutPlayer(0);
    this.renderStakes();
    this.busy = false;
    if (e.phase === 'settled') this.showResults();
    this.updateLabels();
    this.refreshUi();
  }
}

