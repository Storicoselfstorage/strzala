/**
 * Walidator ekonomii map — port funkcji zliczających z v1 mapgen.py.
 * Używany przez testy (PRD 2.0 §9/§14: liczby C/D/A/L/K/`!`/T/V per mapa
 * muszą zgadzać się z tabelą 8.6) i dostępny dla narzędzi.
 */

export interface MapCounts {
  crystals: number;      // C
  diamonds: number;      // D
  arrowPacks: number;    // A
  cakes: number;         // L
  cacti: number;         // K
  spikeCells: number;    // ^ (komórki)
  spikeGroups: number;   // ^ (ciągi — tak liczy tabela 8.6 "kolce")
  traps: number;         // !
  thiefPoints: number;   // T
  hearts: number;        // V
  oPoints: number;       // o
  toczki: number;        // 1
  machaczTriggers: number; // 2
  skoczki: number;       // 3
  geysers: number;       // g
  boulders: number;      // G
  powerShield: number;   // t
  powerMagnet: number;   // u
  playerStarts: number;  // P
  exits: number;         // E
}

export function countMapEconomy(rows: readonly string[]): MapCounts {
  const flat = rows.join('');
  const count = (ch: string) => flat.split(ch).length - 1;
  // grupy kolców: ciągi `^` w obrębie wiersza
  let spikeGroups = 0;
  for (const row of rows) {
    spikeGroups += (row.match(/\^+/g) ?? []).length;
  }
  return {
    crystals: count('C'),
    diamonds: count('D'),
    arrowPacks: count('A'),
    cakes: count('L'),
    cacti: count('K'),
    spikeCells: count('^'),
    spikeGroups,
    traps: count('!'),
    thiefPoints: count('T'),
    hearts: count('V'),
    oPoints: count('o'),
    toczki: count('1'),
    machaczTriggers: count('2'),
    skoczki: count('3'),
    geysers: count('g'),
    boulders: count('G'),
    powerShield: count('t'),
    powerMagnet: count('u'),
    playerStarts: count('P'),
    exits: count('E'),
  };
}

export interface RunnerCounts {
  crystals: number;        // C3 × 3
  arrowPacks: number;      // A
  cactusTokens: number;    // K + KK (przeszkody; KK = "podwójny")
  cactusEntities: number;  // K + 2·KK (pojedyncze kaktusy)
  machacze: number;        // n
  gaps: number;            // G4/G5
  gapColumns: number;      // suma szerokości dziur
  trackColumns: number;    // długość toru bez wybiegu (kolumny)
}

export function countRunnerEconomy(pattern: string): RunnerCounts {
  const toks = pattern.trim().split(/\s+/);
  const counts: RunnerCounts = {
    crystals: 0, arrowPacks: 0, cactusTokens: 0, cactusEntities: 0,
    machacze: 0, gaps: 0, gapColumns: 0, trackColumns: 0,
  };
  let x = 0;
  for (const t of toks) {
    if (/^\d+$/.test(t)) {
      x += parseInt(t, 10);
    } else if (t === 'K') {
      counts.cactusTokens++; counts.cactusEntities++; x += 2;
    } else if (t === 'KK') {
      counts.cactusTokens++; counts.cactusEntities += 2; x += 3;
    } else if (t === 'n') {
      counts.machacze++; x += 2;
    } else if (t.startsWith('G')) {
      const w = parseInt(t[1], 10);
      counts.gaps++; counts.gapColumns += w; x += w;
    } else if (t === 'C3') {
      counts.crystals += 3; x += 4;
    } else if (t === 'A') {
      counts.arrowPacks++; x += 2;
    } else {
      throw new Error(`nieznany token patternu: ${t}`);
    }
  }
  counts.trackColumns = x;
  return counts;
}
