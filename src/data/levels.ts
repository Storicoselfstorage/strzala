/**
 * STRZA/ŁA 2.0 — dane poziomów, przeniesione 1:1 z v1 (~/strzala/levels.py).
 *
 * MAPY: te same stringi znak w znak (wygenerowane mechanicznie z levels.py
 * i zweryfikowane roundtripem). Legenda znaków — aneks PRD-1.0 sekcja 10.
 * Współrzędne w danych są KRATKOWE (1 kratka = 16 px, patrz core/balance.ts).
 */

export type LevelKind = 'PLATFORM' | 'ARENA' | 'RUNNER' | 'BOSS';
export type EchoMode = 'join' | 'start' | 'absent' | null;
export type DragonId = 'MIRAZ' | 'SAMUM' | 'CIERN' | 'MONSUN' | 'PIRA' | 'OBSYDIAN';
export type DragonPattern = 'single' | 'double' | 'pira' | 'boss';

export interface LevelDef {
  world: 1 | 2 | 3;
  name: string;
  kind: LevelKind;
  dragon: DragonId | null;
  /** par time w sekundach (aneks 8.6) */
  par: number;
  echo: EchoMode;
  /** kolumna ściany areny (kratki) — poziomy typu B i BOSS */
  wallCol?: number;
  /** kolumna startu areny (kratki); arena = 80 kratek */
  arenaX?: number;
  /** nazwa patternu runnera (typ C) */
  pattern?: string;
  /** mapa areny po runnerze (1-3, 2-3) */
  arenaMap?: string;
  /** 3-3: brama bossa (10 kryształów) zamiast areny */
  gate?: boolean;
  /** nadpisanie cooldownu złodzieja (3-2: 20 s) */
  thiefCd?: number;
}

export const LEVEL_ORDER = [
  '1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', 'BOSS',
] as const;

export const LEVEL_DEF: Record<string, LevelDef> = {
  '1-1': { world: 1, name: 'Plaża Rozbitków',       kind: 'PLATFORM', dragon: null,       par: 75,  echo: 'join' },
  '1-2': { world: 1, name: 'Kaktusowy Kanion',      kind: 'ARENA',    dragon: 'MIRAZ',    par: 150, echo: 'start', wallCol: 137, arenaX: 140 },
  '1-3': { world: 1, name: 'Pościg za Samumem',     kind: 'RUNNER',   dragon: 'SAMUM',    par: 60,  echo: null,    pattern: 'RUNNER_1_3', arenaMap: 'ARENA_1_3' },
  '2-1': { world: 2, name: 'Mosty z Lian',          kind: 'PLATFORM', dragon: null,       par: 90,  echo: 'start' },
  '2-2': { world: 2, name: 'Wielki Skok na Plecak', kind: 'ARENA',    dragon: 'CIERN',    par: 170, echo: 'absent', wallCol: 157, arenaX: 160 },
  '2-3': { world: 2, name: 'Gniew Monsuna',         kind: 'RUNNER',   dragon: 'MONSUN',   par: 70,  echo: null,    pattern: 'RUNNER_2_3', arenaMap: 'ARENA_2_3' },
  '3-1': { world: 3, name: 'Kryształowe Jaskinie',  kind: 'PLATFORM', dragon: null,       par: 100, echo: 'start' },
  '3-2': { world: 3, name: 'Skarbiec Vabanka',      kind: 'ARENA',    dragon: 'PIRA',     par: 190, echo: 'start', wallCol: 177, arenaX: 180, thiefCd: 20.0 },
  '3-3': { world: 3, name: 'Sprint po Zboczu',      kind: 'RUNNER',   dragon: null,       par: 75,  echo: null,    pattern: 'RUNNER_3_3', gate: true },
  'BOSS': { world: 3, name: 'Szczyt: Obsydian',     kind: 'BOSS',     dragon: 'OBSYDIAN', par: 0,   echo: null,    wallCol: 59, arenaX: 60 },
};

/** limit złodziei per poziom (aneks 8.6, kolumna "Złodziej maks.") */
export const THIEF_MAX: Record<string, number> = {
  '1-1': 1, '1-2': 1, '2-1': 2, '2-2': 3, '3-1': 2, '3-2': 2,
};

export interface DragonDef {
  name: string;
  hp: { LATWY: number; NORMALNY: number; TRUDNY: number };
  shield: boolean;
  pattern: DragonPattern;
}

/** bestiariusz smoków (aneks 6.5, levels.py DRAGONS) */
export const DRAGONS: Record<DragonId, DragonDef> = {
  MIRAZ:    { name: 'MIRAŻ',    hp: { LATWY: 4,  NORMALNY: 6,  TRUDNY: 9 },  shield: false, pattern: 'single' },
  SAMUM:    { name: 'SAMUM',    hp: { LATWY: 4,  NORMALNY: 6,  TRUDNY: 9 },  shield: false, pattern: 'single' },
  CIERN:    { name: 'CIERŃ',    hp: { LATWY: 6,  NORMALNY: 9,  TRUDNY: 13 }, shield: true,  pattern: 'double' },
  MONSUN:   { name: 'MONSUN',   hp: { LATWY: 6,  NORMALNY: 9,  TRUDNY: 13 }, shield: true,  pattern: 'double' },
  PIRA:     { name: 'PIRA',     hp: { LATWY: 9,  NORMALNY: 12, TRUDNY: 18 }, shield: true,  pattern: 'pira' },
  OBSYDIAN: { name: 'OBSYDIAN', hp: { LATWY: 12, NORMALNY: 18, TRUDNY: 26 }, shield: true,  pattern: 'boss' },
};

// ── Runner (aneks 8.3): liczba = puste kolumny, K kaktus, KK podwójny,
//    n Machacz (ślizg), G4/G5 dziura, C3 linia 3 kryształów, A strzały +3.
export const RUNNER_1_3 =
  '40 K 30 C3 25 K 28 A 24 G4 30 K 26 C3 24 KK 30 G4 28 K 24 C3 ' +
  '26 K 30 A 24 KK 28 G5 30 C3 20';
export const RUNNER_2_3 =
  '40 K 28 n 26 C3 24 KK 26 G4 28 n 24 K 26 A 24 n 26 KK 28 G5 ' +
  '26 C3 24 K 24 n 26 G4 28 KK 24 C3 26 n 24 K 28 G5 26 A 24 n ' +
  '26 C3 20';
export const RUNNER_3_3_FULL =
  '36 K 24 n 24 G4 24 KK 24 C3 24 n 24 G5 26 K 24 n 24 KK ' +
  '24 C3 24 G4 24 n 24 K 24 A 24 KK 24 G5 24 n 24 C3 24 K ' +
  '24 n 24 G4 24 KK 24 C3 24 A 24 C3 20';
/** wariant LINA („Echo przerzuca linę"): wycinek [14:24] listy tokenów usunięty */
export const RUNNER_3_3_LINA_CUT: [number, number] = [14, 24];

/** rozwiązanie nazwy patternu z LEVEL_DEF (v1: getattr + "_FULL" dla 3-3) */
export const RUNNER_PATTERNS: Record<string, string> = {
  RUNNER_1_3, RUNNER_2_3, RUNNER_3_3: RUNNER_3_3_FULL,
};

/** Znikające platformy fazy 2 bossa: (wiersz, kolumna startu, długość) —
 *  kolumny względem oryginalnej mapy BOSS; game.py przesuwa o arena_x0 − 60. */
export const BOSS_P2_PLATFORMS: ReadonlyArray<readonly [number, number, number]> = [
  [13, 64, 5], [11, 100, 5], [13, 82, 5],
];

/** Tutoriale 9.6: [id, poziom, tekst, ostrzegawczy] */
export const TUTORIALS: ReadonlyArray<readonly [string, string, string, boolean]> = [
  ['go',      '1-1', '► Idź! [→]', false],
  ['jump',    '1-1', '▲ Skacz! [SPACJA]', false],
  ['crystal', '1-1', '◊ Zbieraj okruchy smoczych serc!', false],
  ['cactus',  '1-1', 'Ψ Kaktus: beczka wody i kolców. Przeskocz!', true],
  ['shoot',   '1-1', '» Strzał: [X]', false],
  ['thief',   '1-1', '$ Złodziej! Goń go albo strzelaj!', false],
  ['echo',    '1-1', 'ω Echo z tobą. Gwiżdże przed pułapkami.', false],
  ['arena',   '1-2', 'Uważaj na ogień [← →], strzelaj [X]!', false],
  ['runner',  '1-3', '► ► ►  PĘDZIMY!   [SPACJA]=skok  [↓]=ślizg', false],
  ['magic',   '2-2', '»M Magiczna strzała: [Z]. Przebija tarczę.', false],
];

// ── MAPY — przeniesione znak w znak z levels.py (MAPS_START..MAPS_END) ─────
export const MAPS: Record<string, string[]> = {
  '1-1': [
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                                                                    ',
    '                                                       D                                            ',
    '                                 D                    ###                                           ',
    '                                                                                                    ',
    '            C                  C C C          V                          M            C C           ',
    '          #####               #######             ###                 #######        #####          ',
    '                                                                                                    ',
    '  P  mCCC         K            1        A    K !          C T       L         ! K               E   ',
    '====================    ===============================    =========================================',
  ],
  '1-2': [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                                                                                                                                                                                                    S',
    '',
    '                                             D                                                                     D                     |',
    '                                            ###                                                                   ###                    |',
    '                                                                                                                                         |',
    '                      CC L                CC                                                     CCC                                 V   |',
    '                    #######             #######                                                 #####           #######            ##### |            #######                   #######',
    '',
    '  P   CCC   K     1     CC            A           K       CC  T   m !           3     K     !         1   K           ! C     A              >                                                                        E',
    '==============================    ====================================     =================================================================================================================================================',
  ],
  'ARENA_1_3': [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                                                            S',
    '',
    '',
    '',
    '',
    '',
    '                  #######                     #######',
    '',
    '    P                                                                     E',
    '================================================================================',
  ],
  '2-1': [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                    V                                                                                     D',
    '                   ###                                                                                   ###',
    '                                                                           D',
    '                    CC                                            CC      ###',
    '                  #######                                       #######                                 #####',
    '                                        zzzzzz                                          zzzzzz                          zzzzzz',
    '  P   CC    K           1   A   CC  !           K m CC  T   ^^^         t       ! 1 CC2          L 3^^^       CC    K             T A   3   D     K     !   E',
    '========================================      ==========================================      ==========================      ==================================',
  ],
  '2-2': [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                                                                                                                                                                                                                        S',
    '',
    '                            D                                                                                                          V                     |                          o',
    '                           ###                                                                                                        ###                    |                        #######',
    '                                                                                                                                                             |',
    '                           CC                                                                              D                          CC                     |                                            o',
    '                         #######                                                                        #######                     #######                  |            #######                       #######',
    '',
    '  P   CC    K     !   CC                A u CC    K   ^^^ 1 CC  !   K   3       T   L m   T     T   CC!     ^^^ 3       K   A 1 CC          CC  K   D   !        >    o                                                                   E',
    '================================     =====================================     ===================================     =========================================================================================================================',
  ],
  'ARENA_2_3': [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                                                              S',
    '',
    '                                o',
    '                              #####',
    '',
    '                                              o',
    '                #######                     #######',
    '',
    '    P     o                                                                E',
    '================================================================================',
  ],
  '3-1': [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                                                                                       D',
    '                                                                                      ###                                        G',
    '                                                   D                                                                            ###',
    '                                                  ###                                 CC                                                                            V',
    '                                                                                    #######                                                                       #####',
    '',
    '  P   CC    K   ^^^ CC1 !         g A   CC !  K       m   ^^^ T         K   CC  2         !   L g t ^^^ CC3         T   K   CC      ! ^^^ 3 A  g            K   CC      1   D   E',
    '============================     ===============================     =========================================     ===============================     =============================',
  ],
  '3-2': [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                                                                                                                                                                                                                                                S',
    '',
    '                                                     D                                                                                              V                            |                            o',
    '                               G                    ###                                                                                            ###                           |                          #####',
    '                              ###                                                                                                                                                |',
    '                                                    CC                                                CC                                            D                            |                                              o',
    '                                                  #######                                           #######                                       #######                        |            #######                         #######',
    '',
    '  P   CC    K   ! CC  ^^^ A     K 1         ! CC          K T CC3 g   m   ^^^         K   A u CC  !       1   g T 3 ^^^ CC  K           A   CCL !         K   CC  ^^^ D !             >   o                                                                   E',
    '====================================     =======================================     ===========================================     ===============================================================================================================================',
  ],
  'BOSS': [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '                                                                                                                            S',
    '',
    '',
    '',
    '                                                           |                                   o',
    '                                                           |                                #######',
    '                                                           |',
    '                             CCC                           |                                                          o',
    '                            #######                        |            #######                                     #######',
    '',
    '  P   CCC   A  ^^^  CCC  !      CCC   A  ^^^ !  CCC   A        >  o                                                                     E',
    '============================================================================================================================================',
  ],
};
