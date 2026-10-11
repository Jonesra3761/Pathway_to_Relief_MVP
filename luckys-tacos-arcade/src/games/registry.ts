import { SCENES, TEXTURES } from '../scenes/keys';

export type GameId = 'arcade-attack' | 'slots' | 'blackjack';

export interface GameEntry {
  id: GameId;
  title: string;
  tagline: string;
  /** Scene started when the card is tapped. */
  sceneKey: string;
  /** Texture shown on the lobby card. */
  icon: string;
  /** True for games that spend play credits. */
  usesCredits: boolean;
  /**
   * Lets a future merchant dashboard switch games on or off per location.
   * Phase 1 hard-codes everything on.
   */
  enabled: boolean;
}

export const GAMES: readonly GameEntry[] = [
  {
    id: 'arcade-attack',
    title: 'Arcade Attack',
    tagline: 'Blast the ingredient invaders',
    sceneKey: SCENES.menu,
    icon: TEXTURES.player,
    usesCredits: false,
    enabled: true,
  },
  {
    id: 'slots',
    title: 'Taco Slots',
    tagline: 'Spin for a Lucky Taco jackpot',
    sceneKey: SCENES.slots,
    icon: TEXTURES.iconSlots,
    usesCredits: true,
    enabled: true,
  },
  {
    id: 'blackjack',
    title: 'Taco 21',
    tagline: 'Blackjack against the house',
    sceneKey: SCENES.blackjack,
    icon: TEXTURES.iconBlackjack,
    usesCredits: true,
    enabled: true,
  },
];

export function enabledGames(): GameEntry[] {
  return GAMES.filter((g) => g.enabled);
}
