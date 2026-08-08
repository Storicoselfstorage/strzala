/**
 * Runner (aneks 8.3): deterministyczny pattern, prędkość/przyspieszenie,
 * reset po śmierci, wariant LINA, brama 10 kryształów, ślizg pod Machaczem,
 * bot przechodzący 2-3 (port testu z v1 test_extra.py).
 */
import { describe, expect, it } from 'vitest';
import {
  CHARACTERS, DIFFICULTY, DT60, RUNNER_GROUND_Y, RUNNER_PLAYER_X, TILE,
} from '../src/core/balance';
import { createSim, SimEnv, simStep } from '../src/core/physicsSim';
import {
  checkObstacleHit, collectRunnerPickups, cutLina, GateState,
  gateRequirement, obstacleRect, rectsOverlap, RunnerState,
  runnerArrowHit, runnerPlayerRect,
} from '../src/core/runnerPattern';
import { RUNNER_1_3, RUNNER_2_3, RUNNER_3_3_FULL } from '../src/data/levels';

const N = DIFFICULTY.NORMALNY;

describe('parsowanie patternu', () => {
  it('RUNNER_1_3: 12 kryształów, 9 kaktusów, 3 dziury, 2 pęki; tor 556 kolumn', () => {
    const rn = new RunnerState(RUNNER_1_3, N);
    expect(rn.crystalTotal).toBe(12);
    expect(rn.obstacles).toHaveLength(9);
    expect(rn.gaps).toHaveLength(3);
    expect(rn.arrowPacks).toHaveLength(2);
    expect(rn.trackLen).toBe(556 * TILE);   // zweryfikowane z v1 RunnerState
  });

  it('RUNNER_2_3: 16 przeszkód (10 kaktusów + 6 Machaczy); tor 733 kolumny', () => {
    const rn = new RunnerState(RUNNER_2_3, N);
    expect(rn.obstacles).toHaveLength(16);
    expect(rn.obstacles.filter((o) => o.kind === 'n')).toHaveLength(6);
    expect(rn.trackLen).toBe(733 * TILE);
  });

  it('RUNNER_3_3: pełny 776 kolumn, LINA 639 (tokeny 15–24 usunięte)', () => {
    const full = new RunnerState(RUNNER_3_3_FULL, N);
    expect(full.trackLen).toBe(776 * TILE);
    expect(full.crystalTotal).toBe(15);
    const lina = new RunnerState(RUNNER_3_3_FULL, N, true);
    expect(lina.trackLen).toBe(639 * TILE);
    expect(lina.crystalTotal).toBe(12);
    expect(lina.obstacles).toHaveLength(14);
    expect(lina.gaps).toHaveLength(4);
    // cutLina usuwa dokładnie 10 tokenów
    expect(RUNNER_3_3_FULL.trim().split(/\s+/).length
      - cutLina(RUNNER_3_3_FULL).split(/\s+/).length).toBe(10);
  });

  it('dziury nie mają gruntu, reszta toru ma', () => {
    const rn = new RunnerState(RUNNER_1_3, N);
    const g = rn.gaps[0];
    expect(rn.groundAt(g.x)).toBe(false);
    expect(rn.groundAt(g.x + g.widthPx - 1)).toBe(false);
    expect(rn.groundAt(g.x + g.widthPx)).toBe(true);
    expect(rn.groundAt(g.x - 1)).toBe(true);
    expect(rn.groundAt(-1)).toBe(false);
  });
});

describe('prędkość i przyspieszenie (N: 192 → 288 px/s, +16 co 8 s)', () => {
  it('start 192 px/s, po 8 s 208, cap na 288', () => {
    const rn = new RunnerState(RUNNER_3_3_FULL, N);
    rn.update(DT60);
    expect(rn.v).toBe(192);
    while (rn.time < 8.05) rn.update(DT60);
    expect(rn.v).toBe(208);
    while (rn.time < 60 && !rn.decel) rn.update(DT60);
    expect(rn.v).toBeLessThanOrEqual(288);
    expect(rn.v).toBe(288);   // po 48 s osiąga vmax
  });

  it('koniec toru: wytraca prędkość do 0 w ~2 s → done', () => {
    const rn = new RunnerState(RUNNER_1_3, N);
    rn.traveled = rn.trackLen - 1;
    rn.update(DT60);
    expect(rn.decel).toBe(true);
    let t = 0;
    while (!rn.done && t < 5) {
      rn.update(DT60);
      t += DT60;
    }
    expect(rn.done).toBe(true);
    expect(t).toBeLessThan(2.5);
    expect(rn.progress()).toBe(1);
  });

  it('reset po śmierci: prędkość startowa, przeszkody i zbiórki wracają', () => {
    const rn = new RunnerState(RUNNER_2_3, N);
    for (let i = 0; i < 600; i++) rn.update(DT60);
    rn.obstacles[1].alive = false;
    rn.crystals[0].taken = true;
    rn.arrowPacks[0].taken = true;
    rn.reset();
    expect(rn.traveled).toBe(0);
    expect(rn.v).toBe(N.runnerV0);
    expect(rn.done).toBe(false);
    expect(rn.obstacles[1].alive).toBe(true);
    expect(rn.crystals[0].taken).toBe(false);
    expect(rn.arrowPacks[0].taken).toBe(false);
  });
});

describe('kolizje i ślizg', () => {
  it('stojący gracz zderza się z Machaczem; w ślizgu przechodzi pod nim', () => {
    const rn = new RunnerState(RUNNER_2_3, N);
    const n = rn.obstacles.find((o) => o.kind === 'n')!;
    rn.traveled = n.x - RUNNER_PLAYER_X;   // Machacz dokładnie nad graczem
    // stojąc: głowa na wierszu 17 (y=272), h=32
    expect(checkObstacleHit(rn, 17 * TILE, 2 * TILE)).toBe(n);
    // ślizg: h=16, y=288 — pod Machaczem
    expect(checkObstacleHit(rn, 18 * TILE, TILE)).toBeNull();
  });

  it('kaktus trafia też w ślizgu (2 kratki wysokości)', () => {
    const rn = new RunnerState(RUNNER_1_3, N);
    const k = rn.obstacles.find((o) => o.kind === 'K')!;
    rn.traveled = k.x - RUNNER_PLAYER_X;
    expect(checkObstacleHit(rn, 18 * TILE, TILE)).toBe(k);
  });

  it('gracz w powietrzu nad kaktusem nie koliduje', () => {
    const rn = new RunnerState(RUNNER_1_3, N);
    const k = rn.obstacles.find((o) => o.kind === 'K')!;
    rn.traveled = k.x - RUNNER_PLAYER_X;
    // skok: głowa na 13 wierszu → stopy na 15 (240) nad kaktusem (272)
    expect(checkObstacleHit(rn, 13 * TILE, 2 * TILE)).toBeNull();
  });

  it('strzała zdejmuje Machacza (+20 pkt), wbija się w kaktus', () => {
    const rn = new RunnerState(RUNNER_2_3, N);
    const n = rn.obstacles.find((o) => o.kind === 'n')!;
    const hitN = runnerArrowHit(rn, n.x - rn.traveled, 17 * TILE);
    expect(hitN).toMatchObject({ killed: true });
    expect(n.alive).toBe(false);
    const k = rn.obstacles.find((o) => o.kind === 'K')!;
    const hitK = runnerArrowHit(rn, k.x - rn.traveled, 17.5 * TILE);
    expect(hitK).toMatchObject({ killed: false });
    expect(k.alive).toBe(true);
  });

  it('hitbox gracza jest hojny (0,6 kratki szerokości)', () => {
    const r = runnerPlayerRect(17 * TILE, 2 * TILE);
    expect(r.w).toBeCloseTo(9.6);
    expect(r.h).toBeCloseTo(25.6);
    expect(rectsOverlap(r, obstacleRect(
      { kind: 'K', x: RUNNER_PLAYER_X, alive: true }, 0))).toBe(true);
  });
});

describe('brama bossa 3-3 (10 kryształów)', () => {
  it('wymaganie: 10 (Skrzat: 5)', () => {
    expect(gateRequirement(false)).toBe(10);
    expect(gateRequirement(true)).toBe(5);
  });

  it('komplet kryształów otwiera bramę', () => {
    const gate = new GateState();
    expect(gate.update(DT60, 10, 10)).toBe('open');
    expect(gate.update(DT60, 15, 10)).toBe('open');
  });

  it('za mało: komunikat raz, po 2,5 s reset sekcji', () => {
    const gate = new GateState();
    expect(gate.update(DT60, 3, 10)).toBe('blockedMessage');
    let result = gate.update(DT60, 3, 10);
    expect(result).toBe('blocked');
    let t = DT60 * 2;
    while (result === 'blocked' && t < 5) {
      result = gate.update(DT60, 3, 10);
      t += DT60;
    }
    expect(result).toBe('reset');
    expect(t).toBeGreaterThan(2.4);
    expect(t).toBeLessThan(2.7);
    // po resecie cykl zaczyna się od komunikatu
    expect(gate.update(DT60, 3, 10)).toBe('blockedMessage');
  });
});

describe('bot runnera 2-3 (port z v1 test_extra.py)', () => {
  it('bot ze ślizgiem pod Machaczem dociera do końca sekcji', () => {
    const rn = new RunnerState(RUNNER_2_3, N);
    const char = CHARACTERS.TOSIA;
    const sim = createSim(0, RUNNER_GROUND_Y - 2 * TILE);
    sim.onGround = true;
    let absX = rn.traveled + RUNNER_PLAYER_X;
    const env: SimEnv = {
      groundYAt: () => {
        const gx = Math.floor(absX / TILE) * TILE;
        return rn.groundAt(gx) || rn.groundAt(gx + TILE) ? RUNNER_GROUND_Y : null;
      },
    };
    let deaths = 0;
    let crystals = 0;
    let frames = 0;
    let iframes = 0;
    while (!rn.done && frames < 30000) {
      rn.update(DT60);
      absX = rn.traveled + RUNNER_PLAYER_X;
      // decyzje bota — progi jak w v1 (kolumny × 16)
      let jump = false;
      let slide = false;
      for (const o of rn.obstacles) {
        if (!o.alive) continue;
        const d = o.x - absX;
        if (o.kind === 'K' && d >= 0 && d < 5 * TILE) jump = true;
        if (o.kind === 'n' && d >= -2 * TILE && d < 7 * TILE) slide = true;
      }
      for (const g of rn.gaps) {
        const d = g.x - absX;
        if (d >= 0 && d < 4 * TILE) jump = true;
      }
      if (!slide) {
        for (const c of rn.crystals) {
          const d = c.x - absX;
          if (!c.taken && d >= 4 * TILE && d < 7 * TILE) jump = true;
        }
      }
      simStep(sim, {
        move: 0,
        jumpPressed: jump && sim.onGround && !slide,
        down: slide,
      }, char, env, DT60);
      crystals += collectRunnerPickups(rn, sim.y, sim.h).crystals;
      iframes = Math.max(0, iframes - DT60);
      const hitObstacle = iframes <= 0 && checkObstacleHit(rn, sim.y, sim.h);
      const fell = sim.y > 20.5 * TILE;
      if (hitObstacle || fell) {
        // −1 życie + reset sekcji od początku (aneks 8.3)
        deaths++;
        rn.reset();
        sim.y = RUNNER_GROUND_Y - 2 * TILE;
        sim.vy = 0;
        sim.h = 2 * TILE;
        sim.crouch = false;
        sim.onGround = true;
        iframes = 1.5;
        if (deaths > 10) break;
      }
      frames++;
    }
    expect(rn.done).toBe(true);
    expect(deaths).toBeLessThanOrEqual(2);
    expect(crystals).toBeGreaterThan(0);
  });
});
