import { describe, expect, it } from 'vitest';
import {
  BET_CHIPS,
  BlackjackGame,
  MAX_ROUND_WAGER,
  RULES,
  Shoe,
  buildDecks,
  describeHand,
  describeRound,
  handValue,
  shuffle,
  type Card,
  type Rank,
  type Settlement,
  type Suit,
} from '../src/games/blackjack/blackjackEngine';
import { OPEN_ROUND_KEY, OpenRoundLog, recoverOpenRound } from '../src/games/blackjack/openRound';
import { CreditWallet } from '../src/systems/CreditWallet';
import type { KeyValueStore } from '../src/systems/ScoreManager';

/** Small deterministic PRNG (mulberry32) for seeded runs. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "AS" -> Ace of spades, "10H" -> ten of hearts. */
function c(code: string): Card {
  return { rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit };
}
const cards = (codes: string) => codes.split(' ').map(c);

/**
 * Game whose next cards are exactly `order`, in deal order:
 * player, dealer up, player, dealer hole, then any hits/dealer draws.
 */
function table(order: string, balance = 1000) {
  const wallet = new CreditWallet(null, 'test', balance);
  const shoe = new Shoe(seeded(7));
  shoe.stack(cards(order));
  const rounds: Settlement[] = [];
  const game = new BlackjackGame(wallet, { shoe, onRound: (s) => rounds.push(s) });
  return { wallet, game, shoe, rounds };
}

describe('hand values', () => {
  it('counts one Ace as 11 when it fits (soft) and as 1 otherwise (hard)', () => {
    expect(handValue(cards('AS 6H'))).toEqual({ total: 17, soft: true });
    expect(handValue(cards('AS 6H 10D'))).toEqual({ total: 17, soft: false });
    expect(handValue(cards('AS AH'))).toEqual({ total: 12, soft: true });
    expect(handValue(cards('AS AH AD AC'))).toEqual({ total: 14, soft: true });
    expect(handValue(cards('AS AH 9D'))).toEqual({ total: 21, soft: true });
    expect(handValue(cards('AS AH 9D KC'))).toEqual({ total: 21, soft: false });
    expect(handValue(cards('KS QH'))).toEqual({ total: 20, soft: false });
    expect(handValue([])).toEqual({ total: 0, soft: false });
  });

  it('detects busts and labels hands', () => {
    expect(handValue(cards('KS QH 2D')).total).toBe(22);
    expect(describeHand(cards('KS QH 2D'))).toBe('Bust 22');
    expect(describeHand(cards('AS 6H'))).toBe('Soft 17');
    expect(describeHand(cards('AS 6H 10D'))).toBe('17');
    expect(describeHand(cards('AS KH'))).toBe('Blackjack');
    expect(describeHand(cards('AS KH'), false)).toBe('21');
    expect(describeHand(cards('5S 6H KD'))).toBe('21');
  });
});

describe('shoe', () => {
  it('holds six full decks and shuffles every card exactly once', () => {
    const shoe = new Shoe(seeded(1));
    expect(shoe.remaining).toBe(312);
    const drawn: string[] = [];
    while (shoe.remaining > 0) {
      const card = shoe.draw();
      drawn.push(card.rank + card.suit);
    }
    const expected = buildDecks(6).map((x) => x.rank + x.suit);
    expect([...drawn].sort()).toEqual([...expected].sort());
    expect(drawn).not.toEqual(expected);
  });

  it('is deterministic for a given seed', () => {
    const a = shuffle(buildDecks(1), seeded(42));
    const b = shuffle(buildDecks(1), seeded(42));
    const d = shuffle(buildDecks(1), seeded(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(d);
  });

  it('reshuffles a fresh shoe before a round only when fewer than 52 cards remain', () => {
    const wallet = new CreditWallet(null, 'test', 1000);
    const shoe = new Shoe(seeded(3));
    const game = new BlackjackGame(wallet, { shoe });
    while (shoe.remaining > RULES.reshuffleBelow) shoe.draw();
    expect(shoe.remaining).toBe(52);
    let res = game.deal(2);
    expect(res.events.some((e) => e.type === 'shuffle')).toBe(false);
    expect(shoe.remaining).toBe(48);
    game.finishRound();
    game.payout();

    // Below the threshold now (48 or fewer): the next round starts on a fresh shoe.
    expect(shoe.remaining).toBeLessThan(RULES.reshuffleBelow);
    res = game.deal(2);
    expect(res.events[0]).toEqual({ type: 'shuffle' });
    const dealt = res.events.filter((e) => e.type === 'card').length;
    expect(shoe.remaining).toBe(312 - dealt);
  });

  it('reshuffles at exactly 51 remaining', () => {
    const wallet = new CreditWallet(null, 'test', 1000);
    const shoe = new Shoe(seeded(4));
    const game = new BlackjackGame(wallet, { shoe });
    while (shoe.remaining > RULES.reshuffleBelow - 1) shoe.draw();
    expect(shoe.remaining).toBe(51);
    expect(game.deal(2).events[0]).toEqual({ type: 'shuffle' });
  });
});

describe('dealing and naturals', () => {
  it('deals player, dealer up, player, dealer hole (face down)', () => {
    const { game } = table('9S 7H 8D 10C');
    const res = game.deal(10);
    expect(res.ok).toBe(true);
    const deals = res.events.filter((e) => e.type === 'card');
    expect(deals.map((e) => (e.type === 'card' ? [e.to, e.card.rank, e.faceDown] : null))).toEqual([
      [0, '9', false],
      ['dealer', '7', false],
      [0, '8', false],
      ['dealer', '10', true],
    ]);
    expect(game.phase).toBe('player');
    expect(game.dealerVisible()).toEqual([c('7H')]);
    // No peek with a 7 showing.
    expect(res.events.some((e) => e.type === 'peek')).toBe(false);
  });

  it('pays a player blackjack 3:2 immediately', () => {
    const { game, wallet, rounds } = table('AS 9H KD 7C');
    game.deal(10);
    expect(game.phase).toBe('settled');
    expect(game.holeRevealed).toBe(true);
    expect(game.hands[0].result).toBe('blackjack');
    expect(wallet.balance).toBe(990);
    game.payout();
    expect(wallet.balance).toBe(1015);
    expect(rounds).toEqual([expect.objectContaining({ wagered: 10, returned: 25 })]);
  });

  it('peeks on an Ace or ten and ends the round on dealer blackjack', () => {
    const ace = table('9S AH 9D KC');
    let res = ace.game.deal(10);
    expect(res.events).toContainEqual({ type: 'peek', blackjack: true });
    expect(ace.game.phase).toBe('settled');
    expect(ace.game.hands[0].result).toBe('lose');
    expect(ace.game.availableActions()).toEqual([]);

    const ten = table('9S QH 9D AC');
    res = ten.game.deal(10);
    expect(res.events).toContainEqual({ type: 'peek', blackjack: true });
    expect(ten.game.hands[0].result).toBe('lose');
    ten.game.payout();
    expect(ten.wallet.balance).toBe(990);
  });

  it('peeks without ending the round when the dealer has no blackjack', () => {
    const { game } = table('9S AH 9D 7C');
    const res = game.deal(10);
    expect(res.events).toContainEqual({ type: 'peek', blackjack: false });
    expect(game.phase).toBe('player');
  });

  it('pushes blackjack against dealer blackjack', () => {
    const { game, wallet } = table('AS AH KD QC');
    game.deal(20);
    expect(game.hands[0].result).toBe('push');
    game.payout();
    expect(wallet.balance).toBe(1000);
  });
});

describe('player actions', () => {
  it('busts on a hit over 21 and the dealer does not draw', () => {
    const { game, wallet } = table('10S 6H 6D 10C KH 9S');
    game.deal(4);
    expect(game.availableActions()).toEqual(['hit', 'stand', 'double']);
    game.hit();
    expect(game.hands[0].done).toBe(true);
    expect(game.phase).toBe('dealer');
    const res = game.playDealer();
    expect(res.events.map((e) => e.type)).toEqual(['reveal', 'settled']);
    expect(game.dealer).toHaveLength(2);
    expect(game.hands[0].result).toBe('bust');
    game.payout();
    expect(wallet.balance).toBe(996);
  });

  it('auto-stands on 21 after a hit', () => {
    const { game } = table('5S 9H 6D 8C KH 10S');
    game.deal(2);
    game.hit();
    expect(handValue(game.hands[0].cards).total).toBe(21);
    expect(game.phase).toBe('dealer');
  });

  it('dealer stands on soft 17', () => {
    const { game } = table('10S AH 8D 6C');
    game.deal(10);
    game.stand();
    game.playDealer();
    expect(game.dealer).toHaveLength(2);
    expect(game.settlement?.dealerTotal).toBe(17);
    expect(game.hands[0].result).toBe('win');
  });

  it('dealer draws on 16 and on soft 16, stops at hard 17 or more', () => {
    const a = table('10S 10H 9D 6C AD');
    a.game.deal(10);
    a.game.stand();
    a.game.playDealer();
    // 10 + 6 + A = hard 17 -> stand.
    expect(a.game.dealer.map((x) => x.rank)).toEqual(['10', '6', 'A']);
    expect(a.game.hands[0].result).toBe('win');

    const b = table('10S AH 9D 5C 5D 9H');
    b.game.deal(10);
    b.game.stand();
    b.game.playDealer();
    // A + 5 = soft 16 -> draw; A + 5 + 5 = soft 21 -> stand.
    expect(b.game.dealer.map((x) => x.rank)).toEqual(['A', '5', '5']);
    expect(b.game.settlement?.dealerTotal).toBe(21);
    expect(b.game.hands[0].result).toBe('lose');
  });

  it('dealer busts and the player wins 1:1', () => {
    const { game, wallet } = table('10S 10H 8D 6C KD');
    game.deal(10);
    game.stand();
    game.playDealer();
    expect(game.settlement?.dealerBust).toBe(true);
    game.payout();
    expect(wallet.balance).toBe(1010);
  });

  it('equal totals push and return the stake as a refund', () => {
    const { game, wallet } = table('10S 10H 8D 8C');
    const reasons: string[] = [];
    wallet.onChange((ch) => reasons.push(ch.reason));
    game.deal(10);
    game.stand();
    game.playDealer();
    expect(game.hands[0].result).toBe('push');
    game.payout();
    expect(wallet.balance).toBe(1000);
    expect(reasons).toEqual(['bet', 'refund']);
  });

  it('doubles: one extra stake, exactly one card, then the hand ends', () => {
    const { game, wallet, rounds } = table('6S 9H 5D 7C 10H 10D');
    game.deal(10);
    expect(game.double().ok).toBe(true);
    expect(wallet.balance).toBe(980);
    expect(game.hands[0].stake).toBe(20);
    expect(game.hands[0].cards).toHaveLength(3);
    expect(game.phase).toBe('dealer');
    game.playDealer();
    // Player 21 vs dealer 9+7+10 = 26 bust.
    expect(game.hands[0].result).toBe('win');
    game.payout();
    expect(wallet.balance).toBe(1020);
    expect(rounds[0]).toMatchObject({ wagered: 20, returned: 40 });
  });

  it('splits a pair into two hands that play in order', () => {
    const { game, wallet, rounds } = table('8S 6H 8D 10C 3H 10D 10S 7C 9H');
    game.deal(10);
    expect(game.availableActions()).toContain('split');
    const res = game.split();
    expect(res.ok).toBe(true);
    expect(res.events[0]).toEqual({ type: 'split', hand: 0 });
    expect(wallet.balance).toBe(980);
    expect(game.hands.map((h) => h.cards.map((x) => x.rank))).toEqual([
      ['8', '3'],
      ['8', '10'],
    ]);
    expect(game.hands.every((h) => h.fromSplit && h.stake === 10)).toBe(true);
    // Double after split is allowed; re-split is not.
    expect(game.availableActions()).toEqual(['hit', 'stand', 'double']);
    expect(game.double().ok).toBe(true); // 8 + 3 + 10 = 21
    expect(game.active).toBe(1);
    expect(game.split().reason).toBe('illegal');
    game.hit(); // 8 + 10 + 7 = 25 bust
    expect(game.phase).toBe('dealer');
    game.playDealer(); // 6 + 10 + 9 = 25 bust
    expect(game.hands.map((h) => h.result)).toEqual(['win', 'bust']);
    game.payout();
    expect(rounds[0]).toMatchObject({ wagered: 30, returned: 40 });
    expect(wallet.balance).toBe(1010);
  });

  it('dealer does not draw when both split hands bust, but still reveals', () => {
    const { game } = table('9S 6H 9D 5C 5H 10D KS QC 4S');
    game.deal(2);
    game.split(); // 9+5, 9+10
    game.hit(); // 9+5+K = 24
    game.hit(); // 9+10+Q = 29
    expect(game.phase).toBe('dealer');
    const res = game.playDealer();
    expect(res.events.map((e) => e.type)).toEqual(['reveal', 'settled']);
    expect(game.dealer).toHaveLength(2);
    expect(game.hands.map((h) => h.result)).toEqual(['bust', 'bust']);
  });

  it('split Aces get one card each, stand automatically, and 21 pays 1:1 not 3:2', () => {
    const { game, wallet } = table('AS 9H AD 8C KH 5D');
    game.deal(10);
    game.split();
    expect(game.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(game.hands.every((h) => h.done)).toBe(true);
    expect(game.phase).toBe('dealer');
    expect(game.double().reason).toBe('wrong-phase');
    game.playDealer(); // dealer 17 stands
    expect(game.hands.map((h) => h.result)).toEqual(['win', 'lose']); // 21 (A+K) and 16 (A+5)
    expect(game.settlement?.hands[0].returned).toBe(20);
    game.payout();
    expect(wallet.balance).toBe(1000);
  });

  it('a split hand that draws to two-card 21 stands but is not blackjack', () => {
    const { game } = table('KS 7H KD 10C AH 2D');
    game.deal(10);
    game.split();
    expect(game.hands[0].done).toBe(true);
    expect(describeHand(game.hands[0].cards, false)).toBe('21');
    expect(game.active).toBe(1);
    game.stand();
    game.playDealer();
    expect(game.hands[0].result).toBe('win');
    expect(game.hands[0].returned).toBe(20);
  });
});

describe('illegal actions are rejected without side effects', () => {
  it('rejects play outside the player phase and bad bets', () => {
    const { game, wallet } = table('9S 7H 8D 10C');
    expect(game.hit().reason).toBe('wrong-phase');
    expect(game.playDealer().reason).toBe('wrong-phase');
    expect(game.deal(3).reason).toBe('invalid-bet');
    expect(game.deal(0).reason).toBe('invalid-bet');
    expect(game.deal(-2).reason).toBe('invalid-bet');
    expect(wallet.balance).toBe(1000);
    game.deal(10);
    expect(game.deal(10).reason).toBe('wrong-phase');
    expect(game.playDealer().reason).toBe('wrong-phase');
    expect(wallet.balance).toBe(990);
  });

  it('rejects splitting unequal ranks and doubling after a hit', () => {
    const a = table('KS 7H QD 10C');
    a.game.deal(10);
    expect(a.game.split().reason).toBe('illegal'); // K and Q are both 10 but not the same rank
    expect(a.game.hands).toHaveLength(1);

    const { game, wallet } = table('5S 7H 4D 10C 2H');
    game.deal(10);
    game.hit(); // 11 with three cards
    expect(game.phase).toBe('player');
    expect(game.double().reason).toBe('illegal');
    expect(game.split().reason).toBe('illegal');
    expect(game.availableActions()).toEqual(['hit', 'stand']);
    expect(game.hands[0].stake).toBe(10);
    expect(wallet.balance).toBe(990);
  });

  it('rejects unaffordable deals, doubles and splits', () => {
    const { game, wallet } = table('8S 6H 8D 10C', 15);
    expect(game.deal(20).reason).toBe('unaffordable');
    expect(game.phase).toBe('betting');
    expect(game.deal(10).ok).toBe(true);
    expect(wallet.balance).toBe(5);
    expect(game.availableActions()).toEqual(['hit', 'stand']);
    expect(game.double().reason).toBe('unaffordable');
    expect(game.split().reason).toBe('unaffordable');
    expect(wallet.balance).toBe(5);
    expect(game.hands).toHaveLength(1);
  });

  it('rejects actions once the round is settled and pays out only once', () => {
    const { game, wallet, rounds } = table('AS 9H KD 7C');
    game.deal(10);
    expect(game.stand().reason).toBe('wrong-phase');
    expect(game.payout()).not.toBeNull();
    expect(game.payout()).toBeNull();
    expect(rounds).toHaveLength(1);
    expect(wallet.balance).toBe(1015);
  });
});

describe('leaving mid-round', () => {
  it('finishRound stands the remaining hands and plays the dealer out', () => {
    const { game, wallet, rounds } = table('10S 10H 9D 7C');
    game.deal(10);
    expect(game.inRound).toBe(true);
    game.finishRound();
    expect(game.phase).toBe('settled');
    expect(game.inRound).toBe(true); // still owed until paid
    game.payout();
    expect(game.inRound).toBe(false);
    expect(game.hands[0].result).toBe('win'); // 19 vs 17
    expect(wallet.balance).toBe(1010);
    expect(rounds).toHaveLength(1);
  });

  it('deal() pays any unpaid settled round before taking a new stake', () => {
    const { game, wallet, rounds } = table('AS 9H KD 7C');
    game.deal(10);
    game.deal(2);
    expect(rounds).toHaveLength(1);
    expect(wallet.balance).toBe(1015 - 2);
  });
});

describe('credit conservation', () => {
  it('never creates or loses credits over many random seeded rounds', () => {
    for (const seed of [11, 22, 33]) {
      const rng = seeded(seed);
      const start = 100000;
      const wallet = new CreditWallet(null, 'test', start);
      let spent = 0;
      let deposited = 0;
      wallet.onChange((ch) => {
        if (ch.delta < 0) spent -= ch.delta;
        else deposited += ch.delta;
      });
      const rounds: Settlement[] = [];
      const game = new BlackjackGame(wallet, { rng, onRound: (s) => rounds.push(s) });
      const seen = new Set<string>();
      for (let i = 0; i < 3000; i++) {
        const before = wallet.balance;
        const bet = BET_CHIPS[Math.floor(rng() * BET_CHIPS.length)];
        expect(game.deal(bet).ok).toBe(true);
        while (game.phase === 'player') {
          const actions = game.availableActions();
          expect(actions.length).toBeGreaterThan(0);
          expect(game.act(actions[Math.floor(rng() * actions.length)]).ok).toBe(true);
        }
        if (game.phase === 'dealer') game.playDealer();
        const s = game.payout();
        expect(s).not.toBeNull();
        if (!s) continue;
        s.hands.forEach((h) => seen.add(h.result));
        expect(wallet.balance).toBe(before - s.wagered + s.returned);
        expect(s.wagered).toBe(s.hands.reduce((n, h) => n + h.stake, 0));
        expect(Number.isInteger(s.returned)).toBe(true);
        expect(s.returned).toBeLessThanOrEqual(s.wagered * RULES.blackjackReturn);
      }
      const wagered = rounds.reduce((n, s) => n + s.wagered, 0);
      const returned = rounds.reduce((n, s) => n + s.returned, 0);
      expect(rounds).toHaveLength(3000);
      expect(wallet.balance).toBe(start - wagered + returned);
      expect(spent).toBe(wagered);
      expect(deposited).toBe(returned);
      expect([...seen].sort()).toEqual(['blackjack', 'bust', 'lose', 'push', 'win']);
    }
  });

  it('keeps the house edge in a sane range under basic-ish play', () => {
    // Stand on 17+, hit below: not optimal, but the return must stay plausible.
    const rng = seeded(99);
    const wallet = new CreditWallet(null, 'test', 1_000_000);
    let wagered = 0;
    let returned = 0;
    const game = new BlackjackGame(wallet, {
      rng,
      onRound: (s) => {
        wagered += s.wagered;
        returned += s.returned;
      },
    });
    for (let i = 0; i < 20000; i++) {
      game.deal(10);
      while (game.phase === 'player') {
        const hand = game.hands[game.active];
        if (handValue(hand.cards).total < 17) game.hit();
        else game.stand();
      }
      if (game.phase === 'dealer') game.playDealer();
      game.payout();
    }
    const rtp = returned / wagered;
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeLessThan(1.0);
  });
});

describe('round headline', () => {
  /** Plays a stacked round to settlement with the given actions (one per decision). */
  function settle(order: string, bet: number, actions: ('hit' | 'stand' | 'double' | 'split')[] = []) {
    const { game } = table(order);
    game.deal(bet);
    for (const a of actions) expect(game.act(a).ok).toBe(true);
    if (game.phase === 'dealer') game.playDealer();
    return game.settlement as Settlement;
  }

  it('calls a split that nets zero on a win and a loss EVEN, not PUSH', () => {
    // 8,10 = 18 wins and 8,5 = 13 loses against dealer 6,10,A = 17.
    const s = settle('8S 6H 8D 10C 10D 5S AH', 10, ['split', 'stand', 'stand']);
    expect(s.hands.map((h) => h.result)).toEqual(['win', 'lose']);
    expect(s.returned - s.wagered).toBe(0);
    expect(describeRound(s)).toEqual({ text: 'EVEN: 1 WIN, 1 LOSS', tone: 'even' });

    // Same with a bust on the second hand.
    const b = settle('8S 6H 8D 10C 10D 5S KH AH', 10, ['split', 'stand', 'hit']);
    expect(b.hands.map((h) => h.result)).toEqual(['win', 'bust']);
    expect(describeRound(b).text).toBe('EVEN: 1 WIN, 1 BUST');
  });

  it('keeps PUSH for rounds where every hand pushed', () => {
    expect(describeRound(settle('10S 10H 8D 8C', 10, ['stand'])).text).toBe('PUSH: BET RETURNED');
    expect(describeRound(settle('AS AH KD QC', 10)).text).toBe('PUSH: BET RETURNED'); // BJ vs BJ
    // Split, both hands 18 against dealer 18.
    const both = settle('9S 10H 9D 8C 9H 9C', 10, ['split', 'stand', 'stand']);
    expect(both.hands.map((h) => h.result)).toEqual(['push', 'push']);
    expect(describeRound(both).text).toBe('PUSH: BET RETURNED');
  });

  it('reports wins, blackjacks and losses with the net amount', () => {
    expect(describeRound(settle('AS 9H KD 7C', 10))).toEqual({ text: 'BLACKJACK!  +15', tone: 'win' });
    expect(describeRound(settle('10S 10H 9D 7C', 10, ['stand']))).toEqual({ text: 'YOU WIN  +10', tone: 'win' });
    expect(describeRound(settle('10S 10H 6D 9C', 4, ['stand']))).toEqual({ text: 'DEALER WINS  -4', tone: 'lose' });
    expect(describeRound(settle('9S AH 9D KC', 10)).text).toBe('DEALER BLACKJACK');
    // Split win + push nets a profit.
    const wp = settle('9S 10H 9D 8C KH 9C', 10, ['split', 'stand', 'stand']);
    expect(wp.hands.map((h) => h.result)).toEqual(['win', 'push']);
    expect(describeRound(wp).text).toBe('YOU WIN  +10');
  });
});

/** In-memory stand-in for localStorage, shared by a wallet and the open-round log. */
function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('open round recovery (tab discarded mid-hand)', () => {
  it('tracks the stake through deal, split and doubles, and clears when paid', () => {
    const { game } = table('8S 6H 8D 10C 3H 2D 10S 9S');
    expect(game.wagered).toBe(0);
    game.deal(10);
    expect(game.wagered).toBe(10);
    game.split(); // 8,3 and 8,2
    expect(game.wagered).toBe(20);
    game.double();
    game.double();
    expect(game.wagered).toBe(40);
    expect(game.settlement).toBeNull();
    game.playDealer();
    expect(game.settlement?.wagered).toBe(40);
  });

  it('refunds a stake left by a page that never settled, exactly once', () => {
    const store = memoryStore();
    const key = 'credits';
    let wallet = new CreditWallet(store, key, 100);
    let log = new OpenRoundLog(store);
    const game = new BlackjackGame(wallet, { shoe: table('8S 6H 8D 10C 3H 2D').shoe, onRound: () => log.clear() });
    game.deal(10);
    log.save(game.wagered);
    game.split();
    log.save(game.wagered);
    expect(store.data.get(key)).toBe('80');
    expect(store.data.get(OPEN_ROUND_KEY)).toBe('20');

    // The tab dies here: no pagehide, no payout. Reopen from storage alone.
    wallet = new CreditWallet(store, key, 100);
    log = new OpenRoundLog(store);
    const reasons: string[] = [];
    wallet.onChange((ch) => reasons.push(`${ch.reason}:${ch.delta}`));
    const reported: number[] = [];
    expect(recoverOpenRound(log, wallet, (w) => reported.push(w))).toBe(20);
    expect(wallet.balance).toBe(100);
    expect(store.data.get(key)).toBe('100');
    expect(reasons).toEqual(['refund:20']);
    expect(reported).toEqual([20]);
    // A second visit owes nothing.
    expect(recoverOpenRound(log, wallet, (w) => reported.push(w))).toBe(0);
    expect(wallet.balance).toBe(100);
    expect(reported).toEqual([20]);
  });

  it('owes nothing once a round has been paid normally', () => {
    const store = memoryStore();
    const wallet = new CreditWallet(store, 'credits', 100);
    const log = new OpenRoundLog(store);
    const game = new BlackjackGame(wallet, { shoe: table('10S 10H 9D 7C').shoe, onRound: () => log.clear() });
    game.deal(10);
    log.save(game.wagered);
    expect(log.pending()).toBe(10);
    game.finishRound(); // what pagehide / scene shutdown do
    game.payout();
    expect(log.pending()).toBe(0);
    expect(recoverOpenRound(log, wallet, () => {})).toBe(0);
    expect(wallet.balance).toBe(110);
  });

  it('ignores garbage, caps at one round, and survives missing or broken storage', () => {
    const store = memoryStore();
    const log = new OpenRoundLog(store);
    for (const bad of ['', 'abc', '-5', '0', 'NaN']) {
      store.data.set(OPEN_ROUND_KEY, bad);
      expect(log.pending()).toBe(0);
    }
    store.data.set(OPEN_ROUND_KEY, '99999');
    expect(log.pending()).toBe(MAX_ROUND_WAGER);
    expect(MAX_ROUND_WAGER).toBe(80);

    const none = new OpenRoundLog(null);
    none.save(10);
    expect(none.pending()).toBe(0);

    const broken = new OpenRoundLog({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => broken.save(10)).not.toThrow();
    expect(() => broken.clear()).not.toThrow();
    expect(broken.pending()).toBe(0);
  });
});
