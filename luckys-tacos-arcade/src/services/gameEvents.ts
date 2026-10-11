/**
 * Typed game-level events. Gameplay emits these; future modules (QR tickets,
 * loyalty rewards, analytics, merchant config) subscribe without the game
 * scenes needing to know they exist.
 */
export interface GameEventMap {
  'run:start': { startedAt: number };
  'wave:start': { wave: number };
  'wave:cleared': { wave: number; score: number };
  'enemy:destroyed': { kind: string; points: number; diving: boolean };
  'player:hit': { livesRemaining: number };
  'run:end': RunSummary;
  /** One settled round of a credit game (slots spin, blackjack hand). */
  'casino:round': CasinoRound;
}

export interface CasinoRound {
  game: 'slots' | 'blackjack';
  /** Total credits wagered this round (including doubles/splits). */
  wagered: number;
  /** Total credits returned to the player (0 on a loss; includes the stake on a win/push). */
  returned: number;
}

export interface RunSummary {
  score: number;
  highScore: number;
  newHighScore: boolean;
  wave: number;
  enemiesDestroyed: number;
  durationMs: number;
  endedAt: number;
}

type Handler<T> = (payload: T) => void;

export class GameEventBus {
  private handlers = new Map<keyof GameEventMap, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => {
      set.delete(handler as Handler<never>);
    };
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(event) as Set<Handler<GameEventMap[K]>> | undefined;
    set?.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        // A failing integration must never crash gameplay.
        console.error(`[gameEvents] handler for ${event} failed`, err);
      }
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** App-wide singleton bus. */
export const gameEvents = new GameEventBus();
