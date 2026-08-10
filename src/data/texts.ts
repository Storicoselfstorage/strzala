// Teksty gry — Załącznik A z PRD-1.0-mechanika.md po redakcji całościowej
// (2026-08: feedback zamawiającego — spójna logika przyczynowo-skutkowa
// + lekki wątek edukacyjny; ton bez zmian: komedia akcji, zero zdrobnień).
// Kanon spięcia fabuły: serca rozprysły się w kryształy (dziurawy worek),
// kryształ ładuje strzałę, celna strzała ODDAJE smokowi serce. Skarbiec
// Vabanka kryje łupy — nie „wszystkie serca" (to przeczyło uwalnianiu
// smoków po drodze). Każda linia ma odpowiednik w data/voiceLines.ts (TTS).

export const INTRO_LINES = [
  'Smocza Wyspa. Każdy smok nosił kryształowe serce.',
  'Jednej nocy Szop Vabank, Król Złodziei, ukradł WSZYSTKIE.',
  'Worek był dziurawy. Serca rozprysły się w kryształy.',
  'Smoki bez serc wpadły w zły czar. Cierpią i słuchają Vabanka.',
  'Kryształ ładuje strzałę. Celny strzał oddaje serce.',
  'Zasada łowczyń: łowimy czar, nie smoki. Do roboty.',
];

export const WORLD_TRANSITIONS: Record<string, string[]> = {
  // po ukończeniu 1-3 (narratorka: Echo — stąd „mój dom")
  'after-1-3': [
    'Samum wolny! Z wdzięczności podrzucił nas na grzbiecie pod dżunglę.',
    'Dżungla Ech: krzyknij, a las odda ci głos. To echo — jak ja! Mój dom.',
    'Vega: „Dom złodziei też. Pilnuj plecaka."',
  ],
  // po ukończeniu 2-3
  'after-2-3': [
    'Monsun wolny. Zabrał ulewę — niebo znów czyste.',
    'Zdradził nam tajne wejście do skarbca w wulkanie — górze z ogniem w brzuchu.',
    'Tosia: „To idziemy po wszystko."',
  ],
};

export const FINALE_LINES = [
  'Obsydian otwiera oczy. Vabank zjeżdża z jego łba.',
  'Wszystkie serca wróciły. Smocza Eskadra w komplecie.',
  'Vega poznaje go: łowca, którego nikt nie przyjął.',
  'Dostał placek i drugą szansę: etat skarbnika wyspy.',
  'Pod okiem sześciu smoków. Licz uczciwie, Vabank.',
  'Vega: „Masz ksywę, Tosia: STRZAŁA. Wyspa jest wasza."',
];

export const LEVEL_INTROS: Record<string, string> = {
  '1-1': 'Trening łowczyń: zbieraj kryształy, omijaj kaktusy.',
  '1-2': 'Rozgrzane powietrze oszukuje wzrok. W kanionie czeka smok Miraż.',
  '1-3': 'Zaklęty Samum boi się walki — pędzi jak burza piaskowa i sieje kaktusy!',
  '2-1': 'Mosty z lian się zapadają — nie stój, biegnij! Echo zna drogę.',
  '2-2': 'Złodzieje mają placek, więc Echo zniknęła. Odbij go!',
  '2-3': 'Monsun niesie ulewę i gniew. Biegnij, potem walcz!',
  '3-1': 'Kryształowe Jaskinie. Gejzer bucha w rytmie — policz i biegnij!',
  '3-2': 'Skarbiec Vabanka: pełno złodziei, a w klatce smoczyca Pira. Uwolnij ją!',
  '3-3': 'Lawa za plecami! Zbieraj kryształy — brama na szczycie chce 10.',
  BOSS: 'Obsydian — smok z czarnego szkła zastygłej lawy. Zdejmij czar!',
};

// Losowane przy utracie życia — nigdy słowo „przegrana".
export const LOSS_MESSAGES: Array<{ header: string; line: string }> = [
  { header: 'WSTAWAJ.', line: 'Łowczynie nie odpuszczają.' },
  { header: 'WYSPA: 1, TY: 0', line: 'Wyrównaj.' },
  { header: 'ZNASZ JUŻ TRASĘ.', line: 'Teraz ją przebiegnij.' },
];

// [0] zarezerwowane: nakładka po pokonaniu smoka (Level.ts). Summary losuje z [1..].
export const WIN_MESSAGES = [
  'Czar zdjęty. Serce wróciło na miejsce.',
  'Poziom zaliczony. Ekipa gra, ekipa wygrywa.',
  'Czysta robota, łowczyni.',
];

export const EVENT_MESSAGES = {
  theftPlacek: 'Złodziej z twoim plackiem! Za nim!',
  echoGone: 'Echo zniknęła! Zwab ją plackiem albo znajdź jej kryjówkę.',
  dragonFlees: 'Smok uciekł i uzbroił pułapki. Wrócisz tu po niego!',
  placekPiece: 'Legendarny Placek zjedzony: +1 serce.',
  arrowsCharged: 'Strzała magiczna naładowana. Neon w górę.',
  dragonEscaping: 'SMOK ZARAZ UCIEKNIE!',
  gateNeedsCrystals: 'Brama wymaga 10 kryształów w plecaku.',
} as const;

// Łuk Vabanka: bezczelny (p2) → niepewny (p3) → wyznanie (after);
// wręczenie placka i etat domyka FINALE_LINES (druga szansa).
export const VABANK_TAUNTS = {
  phase2: 'Vabank: „Serio? Łuk? Ja mam SMOKA."',
  phase3: 'Vabank: „Ups. Teraz się zdenerwował. Nie moja wina!"',
  afterFight: 'Vabank: „...nikt mi nigdy nic nie dał."',
} as const;

// Złodziej 2.0 (spec playtest2) — komunikaty pościgu; bez glifów (lektor TTS).
export const THIEF_MESSAGES = {
  stoleAll: 'Złodziej zwiał z całym plecakiem! Łap go!',
  stoleVega: 'Złodziej wyrwał strzałę! Łap go!',
  edge: 'Nie ucieknie — mapa się kończy!',
  buried: 'Zakopał łup! Znajdź kopczyk.',
  dugUp: 'Odzyskane!',
  caught: 'Plecak odzyskany!',
  lootLost: 'Łup przepadł… ale kryształy są twoje!',
} as const;

// Komunikaty scen (redakcja scenarzysty 2026-08-10; czytane przez lektora).
export const SCENE_MESSAGES = {
  placekRecovered: 'Placek odbity! Echo wraca do drużyny!',
  echoReturn: 'Umowa to umowa: placek za powrót. Echo wraca!',
  placekLater: 'Pełne serca — placek zostaw na później.',
  gateOpen: 'Brama otwarta! Na szczyt, do Obsydiana!',
} as const;

export const GAME_OVER = {
  header: 'ALE AKCJA!',
  line: 'Złap oddech. Wyspa czeka na rewanż.',
  button: '↺ JESZCZE RAZ',
} as const;

// ── Autorzy (ekran AUTORZY) — przepisane z CREDITS.md ─────────────────────
export interface CreditEntry {
  name: string;
  author: string;
  license: string;
}

export interface CreditSection {
  header: string;
  entries: CreditEntry[];
}

export const CREDITS_DATA: CreditSection[] = [
  {
    header: 'GRAFIKA',
    entries: [
      { name: 'Pixel Adventure 1 i 2', author: 'PixelFrog', license: 'CC0' },
      { name: 'Treasure Hunters', author: 'PixelFrog', license: 'CC0' },
      { name: 'Huntress (Vega)', author: 'LuizMelo', license: 'CC0' },
      { name: 'Ranger Girl (Tosia)', author: 't3chdev', license: 'darmowa' },
      { name: 'Free Pixel Art Dragons (smoki)', author: 'Magicae Games', license: 'darmowa' },
      { name: 'Jungle Monkey Platformer (Echo)', author: 'PixelSym', license: 'darmowa' },
      { name: 'UI Pack Pixel Adventure', author: 'Kenney', license: 'CC0' },
      { name: 'Particle Pack', author: 'Kenney', license: 'CC0' },
    ],
  },
  {
    header: 'DŹWIĘK',
    entries: [
      { name: '512 Sound Effects (8-bit)', author: 'Juhani Junkala', license: 'CC0' },
      { name: '5 Chiptunes: Action', author: 'Juhani Junkala', license: 'CC0' },
      { name: '4 Chiptunes: Adventure', author: 'Juhani Junkala', license: 'CC0' },
    ],
  },
  {
    header: 'FONTY',
    entries: [
      { name: 'Pixelify Sans', author: 'Google Fonts', license: 'SIL OFL 1.1' },
      { name: 'Press Start 2P', author: 'Google Fonts', license: 'SIL OFL 1.1' },
    ],
  },
  {
    header: 'KOD I SILNIK',
    entries: [
      { name: 'Phaser 4', author: 'Phaser Studio', license: 'MIT' },
      { name: 'STRZA/ŁA: Łowczynie Smoków', author: 'projekt rodzinny', license: '♥' },
    ],
  },
];

export const CREDITS_THANKS = 'Dziękujemy autorom darmowych paczek!';
