// Teksty gry — port Załącznika A z PRD-1.0-mechanika.md (wiążące, nie redagować).

export const INTRO_LINES = [
  'Smocza Wyspa. Każdy smok miał kryształowe serce.',
  'Jednej nocy Szop Vabank ukradł WSZYSTKIE.',
  'Ale niósł je w dziurawym worku...',
  'Smoki bez serc wpadły w zły czar.',
  'Kryształy ładują twoje neonowe strzały.',
  'Zasada łowczyń: łowimy czar, nie smoki. Do roboty.',
];

export const WORLD_TRANSITIONS: Record<string, string[]> = {
  // po ukończeniu 1-3
  'after-1-3': [
    'Samum kołuje nad wydmami. Eskadra rośnie.',
    'Przed wami Dżungla Ech — teren Echo. I złodziei.',
    'Vega: „Pilnuj plecaka. Mówię poważnie."',
  ],
  // po ukończeniu 2-3
  'after-2-3': [
    'Monsun pokazał tajne wejście do wulkanu.',
    'Wszystkie smocze serca leżą w skarbcu Vabanka.',
    'Tosia: „To idziemy po wszystkie."',
  ],
};

export const FINALE_LINES = [
  'Obsydian otwiera oczy. Czar pękł.',
  'Wszystkie serca wróciły. Smocza Eskadra w komplecie.',
  'Vabank? Dostał placek i etat: skarbnik wyspy.',
  'Pod okiem sześciu smoków. Powodzenia, Vabank.',
  'Vega: „Masz swoją ksywę, mała. STRZAŁA."',
  'Misja wykonana. Wyspa jest wasza.',
];

export const LEVEL_INTROS: Record<string, string> = {
  '1-1': 'Trening łowczyń: zbierz kryształy i nie dotknij kaktusa.',
  '1-2': 'Złodzieje idą po twój placek — a na końcu kanionu czeka smok Miraż.',
  '1-3': 'Samum ucieka i sieje pułapki — doganiaj!',
  '2-1': 'Mosty z lian się zapadają — Echo zna skróty.',
  '2-2': 'Ukradli placek i Echo zniknęła — odbij łup i ściągnij ją z powrotem.',
  '2-3': 'Monsun rusza w pogoń — biegnij, potem walcz!',
  '3-1': 'Jaskinie pełne kryształów — gejzery parzą, kaktusy lawowe kłują.',
  '3-2': 'Skarbiec Vabanka: odbij skarby i uwolnij Pirę.',
  '3-3': 'Lawa idzie w górę — sprint na sam szczyt!',
  BOSS: 'Obsydian, Król Smoków — zdejmij czar i zakończ misję.',
};

// Losowane przy utracie życia — nigdy słowo „przegrana".
export const LOSS_MESSAGES: Array<{ header: string; line: string }> = [
  { header: 'WSTAWAJ.', line: 'Łowczynie nie odpuszczają.' },
  { header: 'KAKTUS: 1, TY: 0', line: 'Wyrównaj.' },
  { header: 'ZNASZ JUŻ TRASĘ.', line: 'Teraz ją przebiegnij.' },
];

export const WIN_MESSAGES = [
  'Czar zdjęty. Smok dołącza do Eskadry.',
  'Poziom zaliczony. Plecak pełny.',
  'Czysta robota, łowczyni.',
];

export const EVENT_MESSAGES = {
  theftPlacek: 'Złodziej z twoim plackiem! Za nim!',
  echoGone: 'Echo zniknęła. Ściągnie ją tylko placek.',
  dragonFlees: 'Smok ucieka i sieje pułapki — pościg!',
  placekPiece: 'Kawałek Legendarnego Placka: +1 życie.',
  arrowsCharged: 'Strzały naładowane. Neon w górę.',
  dragonEscaping: 'SMOK ZARAZ UCIEKNIE!',
  gateNeedsCrystals: 'Brama wymaga 10 kryształów.',
} as const;

export const VABANK_TAUNTS = {
  phase2: 'Vabank: „Serio? Łuk? Ja mam SMOKA."',
  phase3: 'Vabank: „Dobra, teraz się zdenerwował."',
  afterFight: 'Vabank: „...nikt mi nigdy nic nie dał. — To masz placek."',
} as const;

export const GAME_OVER = {
  header: 'ALE AKCJA!',
  line: 'Smok już wie, że po niego idziesz.',
  button: '↺ JESZCZE RAZ',
} as const;
