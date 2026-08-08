/**
 * Runner (typ C) — port 1:1 z game.py RunnerState + logika bramy 3-3
 * (aneks 8.3). Deterministycznie z patternu, zero RNG.
 *
 * Pattern: liczba = puste kolumny, K kaktus, KK podwójny, n Machacz (ślizg),
 * G4/G5 dziura, C3 linia 3 kryształów, A strzały +3.
 * Współrzędne w px (kolumny patternu × 16).
 */
import {
  BOSS_GATE_CRYSTALS, DifficultySettings, PICKUP_RADIUS,
  RUNNER_ACC_STEP, RUNNER_DECEL, RUNNER_PLAYER_X, RUNNER_STOP_EPS,
  RUNNER_TAIL_PX, TILE,
} from './balance';
import { RUNNER_3_3_LINA_CUT } from '../data/levels';

export type RunnerObstacleKind = 'K' | 'n';

export interface RunnerObstacle { kind: RunnerObstacleKind; x: number; alive: boolean }
export interface RunnerGap { x: number; widthPx: number }
export interface RunnerCrystal { x: number; y: number; taken: boolean }
export interface RunnerArrowPack { x: number; taken: boolean }

export function cutLina(pattern: string): string {
  // wariant LINA: tokeny [14:24] usunięte (v1 RUNNER_3_3_LINA_CUT)
  const toks = pattern.split(/\s+/);
  const [a, b] = RUNNER_3_3_LINA_CUT;
  return [...toks.slice(0, a), ...toks.slice(b)].join(' ');
}

export class RunnerState {
  readonly obstacles: RunnerObstacle[] = [];
  readonly gaps: RunnerGap[] = [];
  readonly crystals: RunnerCrystal[] = [];
  readonly arrowPacks: RunnerArrowPack[] = [];
  readonly trackLen: number;
  readonly crystalTotal: number;
  private readonly diff: DifficultySettings;
  traveled = 0;
  time = 0;
  v = 0;
  done = false;
  decel = false;

  constructor(pattern: string, diff: DifficultySettings, useLina = false) {
    this.diff = diff;
    const toks = (useLina ? cutLina(pattern) : pattern).trim().split(/\s+/);
    let x = 0;   // w kolumnach, jak v1
    for (const t of toks) {
      if (/^\d+$/.test(t)) {
        x += parseInt(t, 10);
      } else if (t === 'K') {
        this.obstacles.push({ kind: 'K', x: x * TILE, alive: true });
        x += 2;
      } else if (t === 'KK') {
        this.obstacles.push({ kind: 'K', x: x * TILE, alive: true });
        this.obstacles.push({ kind: 'K', x: (x + 1) * TILE, alive: true });
        x += 3;
      } else if (t === 'n') {
        this.obstacles.push({ kind: 'n', x: x * TILE, alive: true });
        x += 2;
      } else if (t.startsWith('G')) {
        const w = parseInt(t[1], 10);
        this.gaps.push({ x: x * TILE, widthPx: w * TILE });
        x += w;
      } else if (t === 'C3') {
        for (let i = 0; i < 3; i++) {
          this.crystals.push({ x: (x + i) * TILE, y: 15 * TILE, taken: false });
        }
        x += 4;
      } else if (t === 'A') {
        this.arrowPacks.push({ x: x * TILE, taken: false });
        x += 2;
      }
    }
    this.trackLen = x * TILE + RUNNER_TAIL_PX;
    this.crystalTotal = this.crystals.length;
    this.reset();
  }

  /** reset sekcji po śmierci: prędkość wraca do startowej (aneks 8.3) */
  reset(): void {
    this.traveled = 0;
    this.time = 0;
    this.v = this.diff.runnerV0;
    this.done = false;
    this.decel = false;
    for (const o of this.obstacles) o.alive = true;
    for (const c of this.crystals) c.taken = false;
    for (const a of this.arrowPacks) a.taken = false;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.decel) {
      // koniec sekcji: scroll wytraca prędkość do 0 w ~2 s
      this.v = Math.max(0, this.v - RUNNER_DECEL * dt);
      this.traveled += this.v * dt;
      if (this.v <= RUNNER_STOP_EPS) this.done = true;
      return;
    }
    // przyspieszenie: +1 kol/s (16 px/s) co runnerAccEvery sekund, do vmax
    const steps = Math.floor(this.time / this.diff.runnerAccEvery);
    this.v = Math.min(this.diff.runnerVmax,
      this.diff.runnerV0 + steps * RUNNER_ACC_STEP);
    this.traveled += this.v * dt;
    if (this.traveled >= this.trackLen) this.decel = true;
  }

  /** czy pod absolutnym x (px) jest grunt (dziury z patternu) */
  groundAt(ax: number): boolean {
    for (const g of this.gaps) {
      if (g.x <= ax && ax < g.x + g.widthPx) return false;
    }
    return ax >= 0;
  }

  progress(): number {
    return Math.max(0, Math.min(1, this.traveled / this.trackLen));
  }
}

/** hitbox przeszkody we współrzędnych EKRANOWYCH (v1 update_runner):
 *  kaktus 1×2 kratki od wiersza 17; Machacz 1×1 na wysokości głowy */
export function obstacleRect(
  o: RunnerObstacle, traveled: number,
): { x: number; y: number; w: number; h: number } {
  const sx = o.x - traveled;
  return o.kind === 'K'
    ? { x: sx, y: 17 * TILE, w: TILE, h: 2 * TILE }
    : { x: sx, y: 17 * TILE, w: TILE, h: TILE };
}

/** hojny hitbox gracza w runnerze (v1: COL+0,2 / h·0,1 / 0,6 / h·0,8) */
export function runnerPlayerRect(
  playerY: number, playerH: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: RUNNER_PLAYER_X + 0.2 * TILE,
    y: playerY + playerH * 0.1,
    w: 0.6 * TILE,
    h: playerH * 0.8,
  };
}

export function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** kolizja gracza z przeszkodą (zwraca pierwszą trafioną albo null) */
export function checkObstacleHit(
  rn: RunnerState, playerY: number, playerH: number,
): RunnerObstacle | null {
  const prect = runnerPlayerRect(playerY, playerH);
  for (const o of rn.obstacles) {
    if (!o.alive) continue;
    const sx = o.x - rn.traveled;
    if (sx <= -2 * TILE || sx >= 40 * TILE) continue;   // v1: -2 < sx < 40 kol
    if (rectsOverlap(obstacleRect(o, rn.traveled), prect)) return o;
  }
  return null;
}

/** zbieranie kryształów/strzał (v1 update_runner); zwraca co zebrano */
export function collectRunnerPickups(
  rn: RunnerState, playerY: number, playerH: number,
): { crystals: number; arrowPacks: number } {
  let crystals = 0;
  let arrowPacks = 0;
  const px = RUNNER_PLAYER_X + 0.5 * TILE;
  const py = playerY + playerH / 2;
  // v1: promień 1,4 kratki dla kryształów w locie
  const r = 1.4 * TILE;
  for (const c of rn.crystals) {
    if (c.taken) continue;
    const dx = c.x - rn.traveled - px;
    const dy = c.y - py;
    if (dx * dx + dy * dy <= r * r) {
      c.taken = true;
      crystals++;
    }
  }
  for (const a of rn.arrowPacks) {
    if (a.taken) continue;
    // v1: |x| < 1,2 kratki i stopy poniżej wiersza 17,5
    if (Math.abs(a.x - rn.traveled - RUNNER_PLAYER_X) < PICKUP_RADIUS
        && playerY + playerH > 17.5 * TILE) {
      a.taken = true;
      arrowPacks++;
    }
  }
  return { crystals, arrowPacks };
}

/** strzała gracza vs przeszkody (v1: Machacz ginie, kaktus połyka strzałę) */
export function runnerArrowHit(
  rn: RunnerState, arrowX: number, arrowY: number,
): { obstacle: RunnerObstacle; killed: boolean } | null {
  for (const o of rn.obstacles) {
    if (!o.alive) continue;
    const sx = o.x - rn.traveled;
    if (Math.abs(sx - arrowX) < 0.9 * TILE) {
      if (o.kind === 'n' && Math.abs(17 * TILE - arrowY) < 1.4 * TILE) {
        o.alive = false;
        return { obstacle: o, killed: true };
      }
      if (o.kind === 'K' && arrowY >= 16 * TILE) {
        return { obstacle: o, killed: false };   // strzała wbija się w kaktus
      }
      return null;   // v1: break po pierwszej przeszkodzie w zasięgu
    }
  }
  return null;
}

// ── Brama bossa w 3-3 (v1 update_runner, gałąź gate) ───────────────────────
export function gateRequirement(skrzat: boolean): number {
  return skrzat ? Math.floor(BOSS_GATE_CRYSTALS / 2) : BOSS_GATE_CRYSTALS;
}

export type GateResult = 'open' | 'blocked' | 'blockedMessage' | 'reset';

export class GateState {
  private blockT = 0;

  /**
   * Wywoływane co klatkę po rn.done na poziomie z bramą.
   * 'open' — przejście; 'blockedMessage' — pokaż „Brama wymaga 10 kryształów"
   * (raz); po 2,5 s 'reset' — caller przywraca snapshot i resetuje runner.
   */
  update(dt: number, crystals: number, required: number): GateResult {
    if (crystals >= required) return 'open';
    let result: GateResult = 'blocked';
    if (this.blockT === 0) result = 'blockedMessage';
    this.blockT += dt;
    if (this.blockT > 2.5) {
      this.blockT = 0;
      return 'reset';
    }
    return result;
  }
}
