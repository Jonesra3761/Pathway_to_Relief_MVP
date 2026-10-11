import type { CreditWallet } from '../../systems/CreditWallet';

/**
 * Taco 21 rules engine. Pure TypeScript (no Phaser) so every rule and every
 * credit movement can be unit tested.
 *
 * House rules: 6-deck shoe reshuffled below 52 cards, dealer peeks on an Ace
 * or ten, dealer stands on soft 17, blackjack pays 3:2, double on any first
 * two cards (also after a split, except split aces), one split per round,
 * split aces get one card each. No insurance, surrender or re-split.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const RULES = {
  decks: 6,
  /** A fresh shoe is shuffled before a round when fewer cards than this remain. */
  reshuffleBelow: 52,
  /** Dealer draws below this total and stands on it, soft or hard. */
  dealerStandsOn: 17,
  /** Credits returned per staked credit (stake included). */
  blackjackReturn: 2.5,
  winReturn: 2,
} as const;

/** Allowed stakes. All even so a 3:2 blackjack always pays whole credits. */
export const BET_CHIPS = [2, 4, 10, 20] as const;
export const MIN_BET = BET_CHIPS[0];
/** Most a single round can stake: the top chip, split, with both hands doubled. */
export const MAX_ROUND_WAGER = BET_CHIPS[BET_CHIPS.length - 1] * 4;

/** Random source returning a number in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

/** The subset of the credit wallet the engine needs. */
export type Bank = Pick<CreditWallet, 'canAfford' | 'spend' | 'deposit'>;

// ---------------------------------------------------------------------------
// Cards and hand values
// ---------------------------------------------------------------------------

/** Blackjack points with Aces counted as 1 (soft totals are handled by handValue). */
export function cardPoints(card: Card): number {
  if (card.rank === 'A') return 1;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export function isTenValue(card: Card): boolean {
  return cardPoints(card) === 10;
}

export interface HandValue {
  /** Best total: one Ace counts as 11 when that doesn't bust the hand. */
  total: number;
  /** True when an Ace is currently counted as 11. */
  soft: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  let hard = 0;
  let aces = 0;
  for (const c of cards) {
    hard += cardPoints(c);
    if (c.rank === 'A') aces++;
  }
  // Only one Ace can ever count as 11 (two would be 22).
  if (aces > 0 && hard + 10 <= 21) return { total: hard + 10, soft: true };
  return { total: hard, soft: false };
}

/** Any two cards totalling 21. Callers decide whether a split hand may count. */
export function isTwoCard21(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** Short label for a hand total, e.g. "Soft 17", "Blackjack", "Bust 24". */
export function describeHand(cards: readonly Card[], canBeBlackjack = true): string {
  if (cards.length === 0) return '';
  const v = handValue(cards);
  if (canBeBlackjack && isTwoCard21(cards)) return 'Blackjack';
  if (v.total > 21) return `Bust ${v.total}`;
  return v.soft && v.total < 21 ? `Soft ${v.total}` : `${v.total}`;
}

// ---------------------------------------------------------------------------
// Shoe
// ---------------------------------------------------------------------------

export function buildDecks(decks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  }
  return cards;
}

/** In-place Fisher-Yates shuffle. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    // Clamp guards against an rng that (incorrectly) returns exactly 1.
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Multi-deck shoe. Cards are drawn from the end of the array (the "top"). */
export class Shoe {
  private cards: Card[] = [];

  constructor(
    private readonly rng: Rng = Math.random,
    readonly decks: number = RULES.decks,
  ) {
    this.reset();
  }

  get remaining(): number {
    return this.cards.length;
  }

  /** Replaces the shoe with a full, freshly shuffled set of decks. */
  reset(): void {
    this.cards = shuffle(buildDecks(this.decks), this.rng);
  }

  draw(): Card {
    // Defensive: a round never comes close to emptying a 52+ card shoe.
    if (this.cards.length === 0) this.reset();
    return this.cards.pop() as Card;
  }

  /** Puts cards on top so they are drawn next, in the given order (tests and demos). */
  stack(cards: readonly Card[]): void {
    for (let i = cards.length - 1; i >= 0; i--) this.cards.push(cards[i]);
  }
}

// ---------------------------------------------------------------------------
// Round state machine
// ---------------------------------------------------------------------------

/**
 * betting -> player -> dealer -> settled -> (deal) player ...
 * A natural (either side's blackjack) jumps straight from the deal to settled.
 */
export type Phase = 'betting' | 'player' | 'dealer' | 'settled';
export type Action = 'hit' | 'stand' | 'double' | 'split';
export type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
export type RejectReason = 'wrong-phase' | 'illegal' | 'invalid-bet' | 'unaffordable';

export interface PlayerHand {
  cards: Card[];
  /** Credits riding on this hand (doubled hands carry twice the bet). */
  stake: number;
  doubled: boolean;
  /** Both hands of a split. A two-card 21 here is not a blackjack. */
  fromSplit: boolean;
  /** No more actions: stood, doubled, busted, reached 21, or a split Ace. */
  done: boolean;
  result: HandResult | null;
  /** Credits returned at settlement (stake included). */
  returned: number;
}

export interface HandSettlement {
  result: HandResult;
  stake: number;
  returned: number;
}

export interface Settlement {
  hands: HandSettlement[];
  /** Total credits staked this round, including doubles and splits. */
  wagered: number;
  /** Total credits paid back (0 on a loss; stake included on a win or push). */
  returned: number;
  dealerTotal: number;
  dealerBlackjack: boolean;
  dealerBust: boolean;
}

/** What happened, in order, so the scene can animate it. */
export type TableEvent =
  | { type: 'shuffle' }
  | { type: 'card'; to: number | 'dealer'; card: Card; faceDown: boolean }
  /** Hand `hand` was split: its second card became the new hand `hand + 1`. */
  | { type: 'split'; hand: number }
  /** Dealer checked the hole card for blackjack (up card was an Ace or ten). */
  | { type: 'peek'; blackjack: boolean }
  | { type: 'reveal'; card: Card }
  | { type: 'settled'; settlement: Settlement };

export interface Outcome {
  ok: boolean;
  reason?: RejectReason;
  events: TableEvent[];
}

export interface BlackjackOptions {
  rng?: Rng;
  /** Supply a shoe (e.g. a stacked one in tests); defaults to a fresh 6-deck shoe. */
  shoe?: Shoe;
  /** Called exactly once per round, when its credits are paid out. */
  onRound?: (settlement: Settlement) => void;
}

const rejected = (reason: RejectReason): Outcome => ({ ok: false, reason, events: [] });

export class BlackjackGame {
  readonly shoe: Shoe;
  private _phase: Phase = 'betting';
  private _hands: PlayerHand[] = [];
  private _dealer: Card[] = [];
  private _active = 0;
  private _holeRevealed = false;
  private _settlement: Settlement | null = null;
  private _wagered = 0;
  private paid = true;
  private readonly onRound?: (settlement: Settlement) => void;

  constructor(
    private readonly bank: Bank,
    options: BlackjackOptions = {},
  ) {
    this.shoe = options.shoe ?? new Shoe(options.rng ?? Math.random);
    this.onRound = options.onRound;
  }

  get phase(): Phase {
    return this._phase;
  }
  get hands(): readonly PlayerHand[] {
    return this._hands;
  }
  get dealer(): readonly Card[] {
    return this._dealer;
  }
  /** Index of the hand currently being played (meaningful in the player phase). */
  get active(): number {
    return this._active;
  }
  get holeRevealed(): boolean {
    return this._holeRevealed;
  }
  get settlement(): Settlement | null {
    return this._settlement;
  }
  /** Credits staked on the current (or last) round, including doubles and splits. */
  get wagered(): number {
    return this._wagered;
  }
  /** True from the deal until the round's credits are paid out. */
  get inRound(): boolean {
    return this._phase === 'player' || this._phase === 'dealer' || (this._phase === 'settled' && !this.paid);
  }

  /** Cards the player can see in the dealer's hand. */
  dealerVisible(): Card[] {
    return this._holeRevealed ? [...this._dealer] : this._dealer.slice(0, 1);
  }

  /** Bets the player can place right now. */
  canDeal(bet: number): RejectReason | null {
    if (this._phase === 'player' || this._phase === 'dealer') return 'wrong-phase';
    if (!(BET_CHIPS as readonly number[]).includes(bet)) return 'invalid-bet';
    if (!this.bank.canAfford(bet)) return 'unaffordable';
    return null;
  }

  /** Takes the stake and deals: player, dealer up, player, dealer hole. */
  deal(bet: number): Outcome {
    if (this._phase === 'player' || this._phase === 'dealer') return rejected('wrong-phase');
    // A settled round is always paid before the next stake is taken.
    this.payout();
    const why = this.canDeal(bet);
    if (why) return rejected(why);
    if (!this.bank.spend(bet, 'bet')) return rejected('unaffordable');

    const events: TableEvent[] = [];
    if (this.shoe.remaining < RULES.reshuffleBelow) {
      this.shoe.reset();
      events.push({ type: 'shuffle' });
    }
    this._hands = [{ cards: [], stake: bet, doubled: false, fromSplit: false, done: false, result: null, returned: 0 }];
    this._dealer = [];
    this._active = 0;
    this._holeRevealed = false;
    this._settlement = null;
    this._wagered = bet;
    this.paid = false;
    this._phase = 'player';

    this.drawTo(0, events);
    this.drawToDealer(events, false);
    this.drawTo(0, events);
    this.drawToDealer(events, true);

    const up = this._dealer[0];
    const dealerBj = isTwoCard21(this._dealer);
    if (up.rank === 'A' || isTenValue(up)) {
      events.push({ type: 'peek', blackjack: dealerBj });
    }
    if (dealerBj || isTwoCard21(this._hands[0].cards)) {
      // Naturals end the round immediately; no extra stakes are possible yet.
      this._hands[0].done = true;
      this.reveal(events);
      this.settle(events);
    }
    return { ok: true, events };
  }

  /** Legal actions for the active hand that the bank can also cover. */
  availableActions(): Action[] {
    return (['hit', 'stand', 'double', 'split'] as const).filter((a) => this.check(a) === null);
  }

  act(action: Action): Outcome {
    switch (action) {
      case 'hit':
        return this.hit();
      case 'stand':
        return this.stand();
      case 'double':
        return this.double();
      case 'split':
        return this.split();
    }
  }

  hit(): Outcome {
    const why = this.check('hit');
    if (why) return rejected(why);
    const events: TableEvent[] = [];
    const hand = this._hands[this._active];
    this.drawTo(this._active, events);
    // Bust ends the hand; so does 21 (hitting 21 is never useful).
    if (handValue(hand.cards).total >= 21) hand.done = true;
    this.advance();
    return { ok: true, events };
  }

  stand(): Outcome {
    const why = this.check('stand');
    if (why) return rejected(why);
    this._hands[this._active].done = true;
    this.advance();
    return { ok: true, events: [] };
  }

  /** Doubles the stake and takes exactly one more card. */
  double(): Outcome {
    const why = this.check('double');
    if (why) return rejected(why);
    const hand = this._hands[this._active];
    if (!this.bank.spend(hand.stake, 'bet')) return rejected('unaffordable');
    this._wagered += hand.stake;
    hand.stake *= 2;
    hand.doubled = true;
    const events: TableEvent[] = [];
    this.drawTo(this._active, events);
    hand.done = true;
    this.advance();
    return { ok: true, events };
  }

  /** Splits a pair into two hands with equal stakes and deals each a second card. */
  split(): Outcome {
    const why = this.check('split');
    if (why) return rejected(why);
    const original = this._hands[0];
    if (!this.bank.spend(original.stake, 'bet')) return rejected('unaffordable');
    this._wagered += original.stake;
    const [first, second] = original.cards;
    const make = (card: Card): PlayerHand => ({
      cards: [card],
      stake: original.stake,
      doubled: false,
      fromSplit: true,
      done: false,
      result: null,
      returned: 0,
    });
    this._hands = [make(first), make(second)];
    const events: TableEvent[] = [{ type: 'split', hand: 0 }];
    this.drawTo(0, events);
    this.drawTo(1, events);
    const aces = first.rank === 'A';
    for (const hand of this._hands) {
      // Split Aces get one card each and stand; any 21 stands automatically.
      if (aces || handValue(hand.cards).total === 21) hand.done = true;
    }
    this._active = 0;
    this.advance();
    return { ok: true, events };
  }

  /** Reveals the hole card and draws to 17 (standing on soft 17), then settles. */
  playDealer(): Outcome {
    if (this._phase !== 'dealer') return rejected('wrong-phase');
    const events: TableEvent[] = [];
    this.reveal(events);
    const anyLive = this._hands.some((h) => handValue(h.cards).total <= 21);
    if (anyLive) {
      while (handValue(this._dealer).total < RULES.dealerStandsOn) this.drawToDealer(events, false);
    }
    this.settle(events);
    return { ok: true, events };
  }

  /**
   * Finishes an unfinished round without player input: remaining hands stand
   * and the dealer plays. Used when the player leaves mid-hand so their stake
   * is resolved fairly instead of vanishing. Does not pay out; call payout().
   */
  finishRound(): TableEvent[] {
    if (this._phase === 'player') {
      this._hands.forEach((h) => (h.done = true));
      this._phase = 'dealer';
    }
    return this._phase === 'dealer' ? this.playDealer().events : [];
  }

  /**
   * Pays a settled round into the bank exactly once (wins as 'payout', pushes
   * as 'refund') and reports it. Returns null when nothing is owed.
   */
  payout(): Settlement | null {
    const s = this._settlement;
    if (this._phase !== 'settled' || this.paid || !s) return null;
    this.paid = true;
    let winnings = 0;
    let refunds = 0;
    for (const h of s.hands) {
      if (h.result === 'push') refunds += h.returned;
      else winnings += h.returned;
    }
    if (winnings > 0) this.bank.deposit(winnings, 'payout');
    if (refunds > 0) this.bank.deposit(refunds, 'refund');
    this.onRound?.(s);
    return s;
  }

  // -------------------------------------------------------------------------

  /** Why an action is not allowed right now, or null when it is. */
  private check(action: Action): RejectReason | null {
    if (this._phase !== 'player') return 'wrong-phase';
    const hand = this._hands[this._active];
    if (!hand || hand.done) return 'illegal';
    const twoCards = hand.cards.length === 2;
    switch (action) {
      case 'hit':
      case 'stand':
        return null;
      case 'double':
        if (!twoCards || (hand.fromSplit && hand.cards[0].rank === 'A')) return 'illegal';
        return this.bank.canAfford(hand.stake) ? null : 'unaffordable';
      case 'split':
        if (this._hands.length !== 1 || !twoCards || hand.cards[0].rank !== hand.cards[1].rank) return 'illegal';
        return this.bank.canAfford(hand.stake) ? null : 'unaffordable';
    }
  }

  /** Moves to the next unfinished hand, or hands over to the dealer. */
  private advance(): void {
    const next = this._hands.findIndex((h) => !h.done);
    if (next >= 0) {
      this._active = next;
    } else {
      this._phase = 'dealer';
    }
  }

  private drawTo(hand: number, events: TableEvent[]): void {
    const card = this.shoe.draw();
    this._hands[hand].cards.push(card);
    events.push({ type: 'card', to: hand, card, faceDown: false });
  }

  private drawToDealer(events: TableEvent[], faceDown: boolean): void {
    const card = this.shoe.draw();
    this._dealer.push(card);
    events.push({ type: 'card', to: 'dealer', card, faceDown });
  }

  private reveal(events: TableEvent[]): void {
    if (this._holeRevealed) return;
    this._holeRevealed = true;
    events.push({ type: 'reveal', card: this._dealer[1] });
  }

  private settle(events: TableEvent[]): void {
    const dealer = handValue(this._dealer);
    const dealerBlackjack = isTwoCard21(this._dealer);
    const dealerBust = dealer.total > 21;
    for (const hand of this._hands) {
      const v = handValue(hand.cards);
      const natural = !hand.fromSplit && isTwoCard21(hand.cards);
      let result: HandResult;
      if (v.total > 21) result = 'bust';
      else if (dealerBlackjack) result = natural ? 'push' : 'lose';
      else if (natural) result = 'blackjack';
      else if (dealerBust || v.total > dealer.total) result = 'win';
      else if (v.total === dealer.total) result = 'push';
      else result = 'lose';
      hand.result = result;
      hand.returned = returnFor(result, hand.stake);
      hand.done = true;
    }
    this._settlement = {
      hands: this._hands.map((h) => ({ result: h.result as HandResult, stake: h.stake, returned: h.returned })),
      wagered: this._wagered,
      returned: this._hands.reduce((sum, h) => sum + h.returned, 0),
      dealerTotal: dealer.total,
      dealerBlackjack,
      dealerBust,
    };
    this._phase = 'settled';
    events.push({ type: 'settled', settlement: this._settlement });
  }
}

/** Credits returned for a hand result, stake included. */
export function returnFor(result: HandResult, stake: number): number {
  switch (result) {
    case 'blackjack':
      return stake * RULES.blackjackReturn;
    case 'win':
      return stake * RULES.winReturn;
    case 'push':
      return stake;
    case 'lose':
    case 'bust':
      return 0;
  }
}

export interface RoundSummary {
  text: string;
  tone: 'win' | 'even' | 'lose';
}

const SUMMARY_WORDS: [HandResult, string][] = [
  ['win', 'WIN'],
  ['push', 'PUSH'],
  ['lose', 'LOSS'],
  ['bust', 'BUST'],
];

/**
 * One-line headline for a settled round. "PUSH" is kept for rounds where
 * every hand pushed; a split that breaks even on a win and a loss says so.
 */
export function describeRound(s: Settlement): RoundSummary {
  const net = s.returned - s.wagered;
  if (s.hands.some((h) => h.result === 'blackjack')) return { text: `BLACKJACK!  +${net}`, tone: 'win' };
  if (net > 0) return { text: `YOU WIN  +${net}`, tone: 'win' };
  if (net === 0) {
    if (s.hands.every((h) => h.result === 'push')) return { text: 'PUSH: BET RETURNED', tone: 'even' };
    const parts = SUMMARY_WORDS.map(([result, word]) => [s.hands.filter((h) => h.result === result).length, word] as const)
      .filter(([n]) => n > 0)
      .map(([n, word]) => `${n} ${word}`);
    return { text: `EVEN: ${parts.join(', ')}`, tone: 'even' };
  }
  if (s.dealerBlackjack) return { text: 'DEALER BLACKJACK', tone: 'lose' };
  return { text: `DEALER WINS  ${net}`, tone: 'lose' };
}
