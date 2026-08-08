/**
 * Parser map ASCII → dane dla sceny Phasera i logiki core.
 * Port 1:1 z game.py Level.__init__ / solid_at / stand_row.
 *
 * Konwencje współrzędnych:
 *  - (r, c) — kratki (wiersz 0 na górze, jak w v1),
 *  - (x, y) — piksele lewego-górnego rogu kratki (x = c·16, y = r·16).
 */
import { MAP_H_TILES, TILE } from './balance';

export interface TilePoint {
  r: number; c: number;
  x: number; y: number;
}

export type SolidKind = 'ground' | 'platform' | 'wall';
export type PickupKind = 'crystal' | 'diamond' | 'arrow' | 'cake' | 'heart'
  | 'pw_shield' | 'pw_magnet';
export type EnemyKind = 'toczek' | 'skoczka';

export interface VanishSegment {
  r: number; c0: number; c1: number;
  x: number; y: number; widthPx: number;
}

export interface ParsedMap {
  widthTiles: number;
  heightTiles: number;
  widthPx: number;
  heightPx: number;
  /** wiersze dopełnione spacjami do pełnej szerokości */
  rows: string[];
  /** kafle kolizyjne ( `=`, `#`, `|` ) do zbudowania tilemapy */
  solidTiles: Array<TilePoint & { kind: SolidKind }>;
  /** szybki lookup kolizji — klucze cellKey(r, c) */
  solidSet: Set<number>;
  /** start gracza: `P` w danych oznacza wiersz stóp; głowa o kratkę wyżej (v1: r−1) */
  playerStart: TilePoint;
  exit: TilePoint;
  /** trigger areny `>` (checkpoint) */
  trigger: TilePoint | null;
  dragonSpawn: TilePoint | null;
  pickups: Array<TilePoint & { kind: PickupKind }>;
  /** kaktusy: znak K zajmuje kratki (r, c) i (r−1, c) */
  cacti: TilePoint[];
  cactusCells: Set<number>;
  /** kolce `^` aktywne od startu */
  spikes: TilePoint[];
  spikeCells: Set<number>;
  /** ukryte punkty pułapek `!` (kolce wysuwają się na wierszu 18) */
  traps: TilePoint[];
  /** spawny złodzieja `T` */
  thiefPoints: TilePoint[];
  /** Echo w 1-1 (`M`) — dołącza po podejściu */
  echoMarker: TilePoint | null;
  /** kryjówka Echo (`m`) */
  hideout: TilePoint | null;
  /** punkty spawnu kryształów tarczowych w arenie (`o`) */
  oPoints: TilePoint[];
  geysers: TilePoint[];
  boulders: TilePoint[];
  vanish: VanishSegment[];
  /** Toczki (`1`) i Skoczki (`3`) */
  enemies: Array<TilePoint & { kind: EnemyKind }>;
  /** wyzwalacze Machacza (`2`) */
  machaczTriggers: TilePoint[];
  crystalTotal: number;
}

/** klucz komórki do setów (szerokość map < 1024 kratek) */
export function cellKey(r: number, c: number): number {
  return r * 1024 + c;
}

const PICKUP_CHARS: Record<string, PickupKind> = {
  C: 'crystal', D: 'diamond', A: 'arrow', L: 'cake',
  V: 'heart', t: 'pw_shield', u: 'pw_magnet',
};

const SOLID_CHARS: Record<string, SolidKind> = {
  '=': 'ground', '#': 'platform', '|': 'wall',
};

function tp(r: number, c: number): TilePoint {
  return { r, c, x: c * TILE, y: r * TILE };
}

export function parseMap(rawRows: readonly string[], mapId = '?'): ParsedMap {
  if (rawRows.length !== MAP_H_TILES) {
    throw new Error(`mapa ${mapId}: wysokość ${rawRows.length} != ${MAP_H_TILES}`);
  }
  const width = Math.max(...rawRows.map((r) => r.length));
  const rows = rawRows.map((r) => r.padEnd(width, ' '));
  const flat = rows.join('');
  const countP = flat.split('P').length - 1;
  const countE = flat.split('E').length - 1;
  if (countP !== 1 || countE !== 1) {
    throw new Error(`mapa ${mapId}: P/E != 1 (P=${countP}, E=${countE})`);
  }

  const m: ParsedMap = {
    widthTiles: width,
    heightTiles: MAP_H_TILES,
    widthPx: width * TILE,
    heightPx: MAP_H_TILES * TILE,
    rows,
    solidTiles: [],
    solidSet: new Set(),
    playerStart: tp(16, 2),
    exit: tp(0, 0),
    trigger: null,
    dragonSpawn: null,
    pickups: [],
    cacti: [],
    cactusCells: new Set(),
    spikes: [],
    spikeCells: new Set(),
    traps: [],
    thiefPoints: [],
    echoMarker: null,
    hideout: null,
    oPoints: [],
    geysers: [],
    boulders: [],
    vanish: [],
    enemies: [],
    machaczTriggers: [],
    crystalTotal: 0,
  };

  for (let r = 0; r < rows.length; r++) {
    const line = rows[r];
    let c = 0;
    while (c < line.length) {
      const ch = line[c];
      if (ch in SOLID_CHARS) {
        m.solidTiles.push({ ...tp(r, c), kind: SOLID_CHARS[ch] });
        m.solidSet.add(cellKey(r, c));
      } else if (ch === 'z') {
        const c0 = c;
        while (c < line.length && line[c] === 'z') c++;
        m.vanish.push({
          r, c0, c1: c - 1, x: c0 * TILE, y: r * TILE, widthPx: (c - c0) * TILE,
        });
        continue;
      } else if (ch === 'K') {
        m.cacti.push(tp(r, c));
        m.cactusCells.add(cellKey(r, c));
        m.cactusCells.add(cellKey(r - 1, c));
      } else if (ch === '^') {
        m.spikes.push(tp(r, c));
        m.spikeCells.add(cellKey(r, c));
      } else if (ch in PICKUP_CHARS) {
        m.pickups.push({ ...tp(r, c), kind: PICKUP_CHARS[ch] });
      } else if (ch === 'P') {
        m.playerStart = tp(r - 1, c);   // v1: self.start = (r - 1, c)
      } else if (ch === 'E') {
        m.exit = tp(r, c);
      } else if (ch === '>') {
        m.trigger = tp(r, c);
      } else if (ch === '!') {
        m.traps.push(tp(18, c));        // kolce wysuwają się na wierszu 18 (v1)
      } else if (ch === 'T') {
        m.thiefPoints.push(tp(r, c));
      } else if (ch === 'M') {
        m.echoMarker = tp(r, c);
      } else if (ch === 'm') {
        m.hideout = tp(r, c);
      } else if (ch === 'S') {
        m.dragonSpawn = tp(r, c);
      } else if (ch === 'o') {
        m.oPoints.push(tp(r, c));
      } else if (ch === 'g') {
        m.geysers.push(tp(r, c));
      } else if (ch === 'G') {
        m.boulders.push(tp(r, c));
      } else if (ch === '1') {
        m.enemies.push({ ...tp(r, c), kind: 'toczek' });
      } else if (ch === '2') {
        m.machaczTriggers.push(tp(r, c));
      } else if (ch === '3') {
        m.enemies.push({ ...tp(r, c), kind: 'skoczka' });
      }
      c++;
    }
  }
  m.crystalTotal = flat.split('C').length - 1;
  return m;
}

/**
 * Kolizja statycznych kafli — semantyka v1 (Level.solid_at):
 * poza lewą/prawą krawędzią = ściana; nad/pod mapą = puste.
 * Znikające platformy i ściana areny są stanem runtime — scena dokłada je
 * przez parametr `extra`.
 */
export function solidAt(
  m: ParsedMap, r: number, c: number,
  extra?: (r: number, c: number) => boolean,
): boolean {
  if (c < 0 || c >= m.widthTiles) return true;
  if (r < 0 || r >= m.heightTiles) return false;
  if (m.solidSet.has(cellKey(r, c))) return true;
  return extra ? extra(r, c) : false;
}

/** wiersz, na którym można stanąć w kolumnie c (v1 Level.stand_row) */
export function standRow(
  m: ParsedMap, c: number,
  extra?: (r: number, c: number) => boolean,
): number {
  for (let r = MAP_H_TILES - 2; r >= 0; r--) {
    if (solidAt(m, r + 1, c, extra) && !solidAt(m, r, c, extra)) return r;
  }
  return 18;
}

/** komórki ściany areny domykane za graczem (v1 Level.seal_wall) */
export function sealWallCells(wallCol: number): Array<[number, number]> {
  return [[17, wallCol], [18, wallCol]];
}
