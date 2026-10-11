import { STORAGE_KEYS } from '../config/gameConfig';
import { CreditWallet } from '../systems/CreditWallet';
import { browserStore } from '../systems/ScoreManager';

let wallet: CreditWallet | null = null;

/** App-wide play-credit wallet, created on first use. */
export function getWallet(): CreditWallet {
  wallet ??= new CreditWallet(browserStore(), STORAGE_KEYS.credits);
  return wallet;
}
