/**
 * Zapis — schemat aneksu 11.4 z `version: 2`, klucz `strzala2.save`
 * (PRD 2.0 §11). Uszkodzony JSON → kopia do `strzala2.save.bak` + defaulty;
 * NIGDY wyjątek na zewnątrz (tryb prywatny Safari może rzucać na setItem).
 */
import { ARROWS_START, CharacterId, DifficultyId } from './balance';

export const SAVE_KEY = 'strzala2.save';
export const SAVE_BAK_KEY = 'strzala2.save.bak';
export const SAVE_VERSION = 2;

export interface LevelRecord {
  completed: boolean;
  best_score: number;
  best_time: number;
  stars: number;
}

export interface HighscoreEntry {
  name: string;
  score: number;
  stars: number;
  /** wpis dotarł już do wspólnej tabeli online (playtest 3); brak = do wysyłki */
  synced?: boolean;
}

/** schemat aneksu 11.4 (version 2) + pola v1 (seen_tutorials, interludes)
 *  + mute (PRD 2.0 §6: mute zapisywany w save) */
export interface SaveData {
  version: typeof SAVE_VERSION;
  character: CharacterId;
  difficulty: DifficultyId;
  skrzat: boolean;
  muted: boolean;
  unlocked: string[];
  levels: Record<string, LevelRecord>;
  dragons_defeated: string[];
  echo_lina: boolean;
  total_diamonds: number;
  arrows: number;
  has_cake: boolean;
  campaign_score: number;
  highscores: HighscoreEntry[];
  seen_tutorials: string[];
  interludes_seen: string[];
}

/** abstrakcja Storage — testowalna bez DOM */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    character: 'TOSIA',
    difficulty: 'NORMALNY',
    skrzat: false,
    muted: false,
    unlocked: ['1-1'],
    levels: {},
    dragons_defeated: [],
    echo_lina: false,
    total_diamonds: 0,
    arrows: ARROWS_START,
    has_cake: true,
    campaign_score: 0,
    highscores: [],
    seen_tutorials: [],
    interludes_seen: [],
  };
}

/**
 * Wczytanie stanu. Brak zapisu → defaulty. Uszkodzony/obcy JSON →
 * backup surowej zawartości do `strzala2.save.bak` + defaulty.
 * Nigdy nie rzuca.
 */
export function loadSave(storage: StorageLike): SaveData {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return defaultSave();
  }
  if (raw === null) return defaultSave();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
        || (parsed as { version?: unknown }).version !== SAVE_VERSION) {
      throw new Error('zły format');
    }
    // jak v1: defaulty + nadpisanie zapisanymi polami (odporność na braki)
    return { ...defaultSave(), ...(parsed as Partial<SaveData>), version: SAVE_VERSION };
  } catch {
    try {
      storage.setItem(SAVE_BAK_KEY, raw);
    } catch {
      // backup best-effort — defaulty i tak wracają
    }
    return defaultSave();
  }
}

/**
 * NOWA GRA (menu): kampania od zera, ale dorobek rodziny zostaje —
 * tabela wyników, tryb Skrzat i wyciszenie przeżywają reset.
 */
export function resetCampaign(save: SaveData): SaveData {
  return {
    ...defaultSave(),
    highscores: save.highscores,   // ze znacznikami synced — bez ponownej wysyłki
    skrzat: save.skrzat,
    muted: save.muted,
  };
}

/** zapis; false gdy storage odmówił (np. tryb prywatny) — bez wyjątku */
export function writeSave(storage: StorageLike, data: SaveData): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** adapter przeglądarkowego localStorage (null poza przeglądarką) */
export function localStorageAdapter(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return {
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
    };
  } catch {
    return null;
  }
}
