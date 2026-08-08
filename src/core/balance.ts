/**
 * STRZA/ŁA 2.0 — stałe balansu.
 *
 * Wszystkie liczby pochodzą z v1 (levels.py / PRD-1.0-mechanika.md) i są
 * przeliczone przelicznikiem 1 kratka = 16 px (PRD 2.0 sekcja 2).
 * Czasy (sekundy) bez zmian. Żadna wartość nie jest "ulepszona" względem v1
 * poza JUMP_V0 (kalibracja Eulera — patrz niżej).
 */

/** Przelicznik jednostek: 1 kratka (kolumna/wiersz v1) = 16 px. PRD 2.0 §2. */
export const TILE = 16;

/** Krok symulacji logiki w testach (Phaser: 60 FPS). PRD 2.0 §3 (delta). */
export const DT60 = 1 / 60;

// ── Fizyka platformówki (aneks 8.2) ────────────────────────────────────────
/** aneks 8.2: GRAVITY 40 w/s² × 16 */
export const GRAVITY = 640;
/** aneks 8.2: MAX_FALL 25 w/s × 16 */
export const MAX_FALL = 400;
/** aneks 8.2 (obowiązkowe) */
export const COYOTE_TIME = 0.10;
/** aneks 8.2 (obowiązkowe) */
export const JUMP_BUFFER = 0.15;

/** aneks 10: mapa ma dokładnie 20 wierszy */
export const MAP_H_TILES = 20;
export const MAP_H_PX = MAP_H_TILES * TILE; // 320

// ── Gracz (aneks 5 + 8.2) ──────────────────────────────────────────────────
/** sprite 1 kratka × 2 kratki */
export const PLAYER_W = TILE;          // 16
export const PLAYER_H = 2 * TILE;      // 32
export const PLAYER_H_CROUCH = TILE;   // 16 (kucanie/ślizg: 1 kratka)
/** aneks 8.2: hojny hitbox 0,6 × 1,6 kratki na korzyść gracza */
export const PLAYER_HITBOX_W = 0.6 * TILE;   // 9.6
export const PLAYER_HITBOX_H = 1.6 * TILE;   // 25.6
/** aneks 8.2: pickupy zbierane przy dystansie środków ≤ 1,2 kratki */
export const PICKUP_RADIUS = 1.2 * TILE;     // 19.2
/** aneks 8.4.4: odrzut 2 kolumny przy trafieniu */
export const HURT_KNOCKBACK = 2 * TILE;      // 32

export interface CharacterStats {
  name: string;
  /** px/s (aneks 5: Tosia 16 kol/s, Vega 13 kol/s) */
  speed: number;
  /**
   * px/s w górę. Skalibrowane testem tests/jump.test.ts (semi-implicit Euler,
   * dt = 1/60, GRAVITY 640): apex Tosia 64 ± 3,2 px, Vega 51,2 ± 3,2 px.
   * (v1 analitycznie: 18 w/s → 288 px/s, 16 w/s → 256 px/s — Euler wymaga korekty.)
   */
  jumpV0: number;
  /** s (aneks 5) */
  shootCd: number;
  /** obrażenia: zwykła / magiczna (aneks 5) */
  dmg: number;
  dmgMagic: number;
  /** aneks 5: Vega — złodziej ukradnie najwyżej 1 strzałę, nigdy placka ani diamentu */
  protectedBackpack: boolean;
}

export type CharacterId = 'TOSIA' | 'VEGA';

export const CHARACTERS: Record<CharacterId, CharacterStats> = {
  TOSIA: {
    name: 'TOSIA', speed: 256, jumpV0: 292, shootCd: 0.4,
    dmg: 1, dmgMagic: 3, protectedBackpack: false,
  },
  VEGA: {
    name: 'VEGA', speed: 208, jumpV0: 261, shootCd: 0.8,
    dmg: 2, dmgMagic: 4, protectedBackpack: true,
  },
};

// ── Strzały i plecak (aneks 7) ─────────────────────────────────────────────
/** 30 kol/s × 16 */
export const ARROW_SPEED = 480;
/** zasięg 40 kolumn × 16 */
export const ARROW_RANGE = 640;
export const ARROWS_START = 10;
export const ARROWS_MAX = 20;
export const MAGIC_MAX = 3;
/** 5 kryształów części poziomu = +1 strzała magiczna (Skrzat: 3) */
export const MAGIC_PER_CRYSTALS = 5;
export const MAGIC_PER_CRYSTALS_SKRZAT = 3;
/** co 5 diamentów łącznie = +1 życie */
export const DIAMONDS_PER_LIFE = 5;
/** brama przed BOSSEM (Skrzat: połowa) */
export const BOSS_GATE_CRYSTALS = 10;

// ── Power-upy (aneks 7) ────────────────────────────────────────────────────
export const POWERUP_SHIELD_TIME = 8.0;
export const POWERUP_MAGNET_TIME = 12.0;
/** promień 5 kolumn × 16 */
export const POWERUP_MAGNET_R = 80;

// ── Złodziejaszek (aneks 6.2) ──────────────────────────────────────────────
/** 10 kol/s × 16 (wolniej niż obie bohaterki) */
export const THIEF_RUN_SPEED = 160;
/** ucieczka 14 kol/s × 16 */
export const THIEF_FLEE_SPEED = 224;
/** maks. 6 s ucieczki, potem znika z łupem */
export const THIEF_FLEE_MAX = 6.0;
/** upuszczony łup leży 10 s */
export const THIEF_LOOT_TTL = 10.0;
/** spawn gdy gracz < 25 kolumn × 16 */
export const THIEF_SPAWN_DIST = 400;
/** ...lub po 20 s poziomu */
export const THIEF_SPAWN_TIME = 20.0;
/** game.py: vy = −13 w/s (przeskakuje przeszkody ≤ 2 wierszy) × 16 */
export const THIEF_JUMP_V = 208;
/** sygnalizacja nadejścia: 1,5 s (z Echo: 3 s) — aneks 6.2 pkt 2 */
export const THIEF_WARN_TIME = 1.5;
export const THIEF_WARN_TIME_ECHO = 3.0;

// ── Echo (aneks 6.1) ───────────────────────────────────────────────────────
/** podąża 3 kolumny za bohaterką × 16 */
export const ECHO_FOLLOW_DIST = 48;
/** teleport, gdy dystans > 20 kolumn × 16 */
export const ECHO_TELEPORT_DIST = 320;
/** magnes: promień 3 kratek × 16 */
export const ECHO_MAGNET_R = 48;
/** gwizd przed pułapką < 6 kolumn × 16 */
export const ECHO_WHISTLE_DIST = 96;
/** powrót za placek: promień 5 kolumn × 16 */
export const ECHO_RETURN_CAKE_R = 80;
/** game.py Monkey: bieg do kryjówki / pościg za graczem 14 kol/s × 16 */
export const ECHO_RUN_SPEED = 224;
/** powrót bez placka: stanie 1 s przy kryjówce */
export const ECHO_HIDEOUT_RETURN_TIME = 1.0;
/** ucieczka Echo aktywuje 2 najbliższe punkty `!` */
export const ECHO_FLEE_TRAPS = 2;
/** ucieka, gdy gracz straci 2 życia w ciągu 20 s */
export const ECHO_FLEE_LIFE_WINDOW = 20.0;
export const ECHO_FLEE_LIFE_COUNT = 2;

// ── Tarcza smoka (aneks 8.4.2, levels.py) ──────────────────────────────────
/** tarcza pada na 8 s po zebraniu 3 kryształów */
export const SHIELD_DOWN_TIME = 8.0;
/** pierwsze 2 s smok STUNNED */
export const SHIELD_STUN_TIME = 2.0;
/** zwykłe smoki: nowa fala 1 s po powrocie tarczy */
export const SHIELD_RESPAWN_DELAY = 1.0;
/** boss: fala co 5 s (faza 3: co 3 s) */
export const BOSS_SHIELD_RESPAWN = 5.0;
export const BOSS_SHIELD_RESPAWN_P3 = 3.0;

// ── Smok — FSM (aneks 8.4.1, levels.py) ────────────────────────────────────
export const DRAGON_IDLE = 1.5;
export const DRAGON_COOLDOWN = 2.0;
export const DRAGON_STUN = 2.0;
export const DRAGON_FLEE_ANIM = 1.5;
/** patrol 8 kol/s × 16 */
export const DRAGON_PATROL_SPEED = 128;
/** ostrzeżenie 30 s przed ucieczką */
export const DRAGON_FLEE_WARN = 30.0;
/** sprite smoka 6 × 3 kratki (aneks 6.5) × 16 */
export const DRAGON_W = 96;
export const DRAGON_H = 48;
/** arena ma 80 kratek szerokości (aneks 8.4) × 16 */
export const ARENA_W = 80 * TILE; // 1280

// ── Pułapki (aneks 6.4) ────────────────────────────────────────────────────
/** głaz: telegraf 0,8 s; spada 20 w/s × 16; leży 2 s; respawn po 4 s */
export const BOULDER_TELEGRAPH = 0.8;
export const BOULDER_FALL_SPEED = 320;
export const BOULDER_LIE_TIME = 2.0;
export const BOULDER_HIDDEN_TIME = 2.0;
/** gejzer: cykl stały 4 s = spoczynek 2 s → bulgot 1 s → erupcja 1 s */
export const GEYSER_CYCLE = 4.0;
export const GEYSER_REST = 2.0;
export const GEYSER_WARN = 1.0;
/** znikająca platforma: miga 3× przez 1,2 s → znika na 2 s → wraca */
export const VANISH_BLINK_TIME = 1.2;
export const VANISH_GONE_TIME = 2.0;
/** ukryty punkt `!`: telegraf 1,5 s migania, potem kolce ranią */
export const TRAP_TELEGRAPH = 1.5;

// ── Zwykli przeciwnicy (aneks 6.3) — dla warstwy entities ──────────────────
/** Toczek: patrol 4 kol/s × 16, 8 kolumn tam-i-z-powrotem (±4,5 od spawnu) */
export const TOCZEK_SPEED = 64;
export const TOCZEK_PATROL_HALF = 4.5 * TILE; // 72
/** Machacz: 8 kol/s × 16; sinusoida amplituda 2 wiersze × 16, okres 2 s */
export const MACHACZ_SPEED = 128;
export const MACHACZ_AMP = 32;
export const MACHACZ_PERIOD = 2.0;
/** Skoczka: skok co 2 s, telegraf przysiad 0,5 s; game.py: vy −15,5 w/s, vx 6,5 kol/s × 16 */
export const SKOCZKA_SIT_TIME = 2.0;
export const SKOCZKA_TELEGRAPH = 0.5;
export const SKOCZKA_JUMP_V = 248;
export const SKOCZKA_JUMP_VX = 104;
/** dropy (game.py Enemy.die): machacz 20% diament, toczek/skoczka 30% kryształ */
export const ENEMY_DROP_CHANCE = { toczek: 0.3, machacz: 0.2, skoczka: 0.3 } as const;

// ── Runner (aneks 8.3, levels.py) ──────────────────────────────────────────
/** gracz na stałej kolumnie ekranu 10 × 16 */
export const RUNNER_PLAYER_X = 160;
/** kolumny wybiegu na końcu × 16 */
export const RUNNER_TAIL_PX = 40 * TILE; // 640
/** przyspieszenie: +1 kol/s co runner_acc_every sekund × 16 */
export const RUNNER_ACC_STEP = 16;
/** game.py RunnerState: wytracanie 9 kol/s² × 16 (scroll do 0 w ~2 s) */
export const RUNNER_DECEL = 144;
/** próg zatrzymania: game.py v ≤ 0,01 kol/s × 16 */
export const RUNNER_STOP_EPS = 0.16;
/** ślizg pod Machaczem: hitbox 1 wiersz (aneks 8.3) */
export const RUNNER_GROUND_ROW = 19; // stopy gracza na wierszu 19 (game.py)
export const RUNNER_GROUND_Y = RUNNER_GROUND_ROW * TILE; // 304

// ── Trudność (aneks 8.7, levels.py DIFFICULTY) ─────────────────────────────
export type DifficultyId = 'LATWY' | 'NORMALNY' | 'TRUDNY';

export interface DifficultySettings {
  label: string;
  /** życia na poziom per bohaterka */
  lives: Record<CharacterId, number>;
  /** model trafień poza areną: Łatwy 3 serca, Normalny/Trudny one-touch (0) */
  outHearts: number;
  /** serca w arenie per bohaterka */
  arenaHearts: Record<CharacterId, number>;
  /** i-frames s */
  iframes: number;
  /** telegraf smoka s */
  telegraph: number;
  /** px/s (14 / 18 / 22 kol/s × 16) */
  fireballSpeed: number;
  /** smok ucieka po … s */
  dragonFlee: number;
  /** złodziej: cooldown s */
  thiefCd: number;
  /** runner: v0 → vmax px/s (kol/s × 16) */
  runnerV0: number;
  runnerVmax: number;
  /** runner: +16 px/s co … s */
  runnerAccEvery: number;
}

export const DIFFICULTY: Record<DifficultyId, DifficultySettings> = {
  LATWY: {
    label: 'ŁATWY',
    lives: { TOSIA: 6, VEGA: 8 }, outHearts: 3,
    arenaHearts: { TOSIA: 4, VEGA: 5 },
    iframes: 2.0, telegraph: 1.4, fireballSpeed: 224, dragonFlee: 150.0,
    thiefCd: 45.0, runnerV0: 160, runnerVmax: 224, runnerAccEvery: 10.0,
  },
  NORMALNY: {
    label: 'NORMALNY',
    lives: { TOSIA: 4, VEGA: 6 }, outHearts: 0,
    arenaHearts: { TOSIA: 3, VEGA: 4 },
    iframes: 1.5, telegraph: 1.0, fireballSpeed: 288, dragonFlee: 120.0,
    thiefCd: 30.0, runnerV0: 192, runnerVmax: 288, runnerAccEvery: 8.0,
  },
  TRUDNY: {
    label: 'TRUDNY',
    lives: { TOSIA: 3, VEGA: 4 }, outHearts: 0,
    arenaHearts: { TOSIA: 2, VEGA: 3 },
    iframes: 1.0, telegraph: 0.7, fireballSpeed: 352, dragonFlee: 90.0,
    thiefCd: 20.0, runnerV0: 224, runnerVmax: 352, runnerAccEvery: 6.0,
  },
};

/** Tryb Skrzat (aneks 8.7): baza Łatwy + prędkość −30%, kryształy −50% */
export const SKRZAT_SPEED_SCALE = 0.7;
/** dynamiczne ułatwienie: −20% prędkości, +2 życia (aneks 8.7) */
export const EASE_SPEED_SCALE = 0.8;
export const EASE_EXTRA_LIVES = 2;
export const EASE_AFTER_DEATHS = 3;

// ── Scoring (aneks 8.6, levels.py SCORE) ───────────────────────────────────
export const SCORE = {
  crystal: 10, diamond: 100, arrowPack: 5, thief: 50, dragon: 500,
  boss: 1000, level: 100, timeBonusMult: 5,
} as const;
// UWAGA: aneks 6.3 podaje dla Machacza „+30 pkt", ale v1 (levels.py:231
// ENEMY_SCORE) ma 20 — obowiązują dane v1 (jak przy ECONOMY_* poniżej).
export const ENEMY_SCORE = { toczek: 20, machacz: 20, skoczka: 30 } as const;

// ── Ekonomia — tabela 8.6 (Normalny) ───────────────────────────────────────
// Wartości zweryfikowane względem danych v1 (levels.py MAPS / RUNNER_*).
// UWAGA: dla runnerów tabela 8.6 aneksu rozjeżdża się z patternami levels.py
// (1-3: kryształy 9 vs 12, pęki 1 vs 2; 2-3: pęki 1 vs 2, Machacze 8 vs 6;
// 3-3: Machacze 9 vs 6). Obowiązuje game.py/levels.py — tu liczby z danych v1.
export interface MapEconomyExpectation {
  crystals: number; diamonds: number; arrowPacks: number; cakes: number;
  /** znaki K (kaktusy) */
  cacti: number;
  /** komórki `^` (kolce aktywne od startu) */
  spikeCells: number;
  traps: number;        // punkty `!`
  thiefPoints: number;  // punkty `T`
  hearts: number;       // serca `V`
  oPoints: number;      // punkty kryształów tarczowych
}

export const ECONOMY_MAPS: Record<string, MapEconomyExpectation> = {
  '1-1':       { crystals: 10, diamonds: 2, arrowPacks: 1, cakes: 1, cacti: 3, spikeCells: 0,  traps: 2, thiefPoints: 1, hearts: 1, oPoints: 0 },
  '1-2':       { crystals: 15, diamonds: 2, arrowPacks: 2, cakes: 1, cacti: 4, spikeCells: 0,  traps: 3, thiefPoints: 1, hearts: 1, oPoints: 0 },
  'ARENA_1_3': { crystals: 0,  diamonds: 0, arrowPacks: 0, cakes: 0, cacti: 0, spikeCells: 0,  traps: 0, thiefPoints: 0, hearts: 0, oPoints: 0 },
  '2-1':       { crystals: 14, diamonds: 3, arrowPacks: 2, cakes: 1, cacti: 4, spikeCells: 6,  traps: 3, thiefPoints: 2, hearts: 1, oPoints: 0 },
  '2-2':       { crystals: 18, diamonds: 3, arrowPacks: 2, cakes: 1, cacti: 5, spikeCells: 6,  traps: 4, thiefPoints: 3, hearts: 1, oPoints: 3 },
  'ARENA_2_3': { crystals: 0,  diamonds: 0, arrowPacks: 0, cakes: 0, cacti: 0, spikeCells: 0,  traps: 0, thiefPoints: 0, hearts: 0, oPoints: 3 },
  '3-1':       { crystals: 16, diamonds: 3, arrowPacks: 2, cakes: 1, cacti: 5, spikeCells: 12, traps: 4, thiefPoints: 2, hearts: 1, oPoints: 0 },
  '3-2':       { crystals: 20, diamonds: 3, arrowPacks: 3, cakes: 1, cacti: 6, spikeCells: 12, traps: 5, thiefPoints: 2, hearts: 1, oPoints: 3 },
  'BOSS':      { crystals: 15, diamonds: 0, arrowPacks: 3, cakes: 0, cacti: 0, spikeCells: 6,  traps: 2, thiefPoints: 0, hearts: 0, oPoints: 3 },
};

export interface RunnerEconomyExpectation {
  crystals: number; arrowPacks: number;
  /** tokeny K + KK (jak "kaktusy" w tabeli 8.6: KK = podwójny = 1 przeszkoda) */
  cactusTokens: number;
  /** pojedyncze kaktusy (KK = 2) */
  cactusEntities: number;
  machacze: number; gaps: number;
}

export const ECONOMY_RUNNERS: Record<string, RunnerEconomyExpectation> = {
  '1-3': { crystals: 12, arrowPacks: 2, cactusTokens: 7,  cactusEntities: 9,  machacze: 0, gaps: 3 },
  '2-3': { crystals: 12, arrowPacks: 2, cactusTokens: 7,  cactusEntities: 10, machacze: 6, gaps: 4 },
  '3-3': { crystals: 15, arrowPacks: 2, cactusTokens: 8,  cactusEntities: 12, machacze: 6, gaps: 5 },
};
