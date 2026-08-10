/**
 * Runner (aneks 8.3 + spec playtest2): deterministyczny pattern, system 4
 * biegów zależnych od POSTĘPU trasy (progi 0/25/50/75%, rampa 48 px/s²),
 * reset po śmierci → bieg 1, wariant LINA, brama 10 kryształów, ślizg pod
 * Machaczem, wykonalność patternów przy prędkościach biegów, bot 2-3.
 */
import { describe, expect, it } from 'vitest';
import {
  CHARACTERS, DIFFICULTY, DifficultyId, DT60, GearTable,
  RUNNER_DECEL, RUNNER_GEAR_ACCEL, RUNNER_GEAR_THRESHOLDS, RUNNER_GROUND_Y,
  RUNNER_PLAYER_X, RunnerId, SKRZAT_SPEED_SCALE, TILE,
} from '../src/core/balance';
import { createSim, SimEnv, simStep } from '../src/core/physicsSim';
import {
  checkObstacleHit, collectRunnerPickups, cutLina, GateState,
  gateRequirement, obstacleRect, rectsOverlap, RunnerState,
  runnerArrowHit, runnerGearsFor, runnerPlayerRect,
} from '../src/core/runnerPattern';
import { RUNNER_1_3, RUNNER_2_3, RUNNER_3_3_FULL } from '../src/data/levels';

const N = DIFFICULTY.NORMALNY;
const NG = (id: RunnerId): GearTable => N.runnerGears[id];

const PATTERNS: Record<RunnerId, string> = {
  '1-3': RUNNER_1_3, '2-3': RUNNER_2_3, '3-3': RUNNER_3_3_FULL,
};

describe('parsowanie patternu', () => {
  it('RUNNER_1_3: 12 kryształów, 9 kaktusów, 3 dziury, 2 pęki; tor 556 kolumn', () => {
    const rn = new RunnerState(RUNNER_1_3, NG('1-3'));
    expect(rn.crystalTotal).toBe(12);
    expect(rn.obstacles).toHaveLength(9);
    expect(rn.gaps).toHaveLength(3);
    expect(rn.arrowPacks).toHaveLength(2);
    expect(rn.trackLen).toBe(556 * TILE);   // zweryfikowane z v1 RunnerState
  });

  it('RUNNER_2_3: 16 przeszkód (10 kaktusów + 6 Machaczy); tor 733 kolumny', () => {
    const rn = new RunnerState(RUNNER_2_3, NG('2-3'));
    expect(rn.obstacles).toHaveLength(16);
    expect(rn.obstacles.filter((o) => o.kind === 'n')).toHaveLength(6);
    expect(rn.trackLen).toBe(733 * TILE);
  });

  it('RUNNER_3_3: pełny 776 kolumn, LINA 639 (tokeny 15–24 usunięte)', () => {
    const full = new RunnerState(RUNNER_3_3_FULL, NG('3-3'));
    expect(full.trackLen).toBe(776 * TILE);
    expect(full.crystalTotal).toBe(15);
    const lina = new RunnerState(RUNNER_3_3_FULL, NG('3-3'), true);
    expect(lina.trackLen).toBe(639 * TILE);
    expect(lina.crystalTotal).toBe(12);
    expect(lina.obstacles).toHaveLength(14);
    expect(lina.gaps).toHaveLength(4);
    // cutLina usuwa dokładnie 10 tokenów
    expect(RUNNER_3_3_FULL.trim().split(/\s+/).length
      - cutLina(RUNNER_3_3_FULL).split(/\s+/).length).toBe(10);
  });

  it('dziury nie mają gruntu, reszta toru ma', () => {
    const rn = new RunnerState(RUNNER_1_3, NG('1-3'));
    const g = rn.gaps[0];
    expect(rn.groundAt(g.x)).toBe(false);
    expect(rn.groundAt(g.x + g.widthPx - 1)).toBe(false);
    expect(rn.groundAt(g.x + g.widthPx)).toBe(true);
    expect(rn.groundAt(g.x - 1)).toBe(true);
    expect(rn.groundAt(-1)).toBe(false);
  });
});

// ── System biegów (spec playtest2) ─────────────────────────────────────────

/** v próbkowane przy postępie 10/30/60/90% (rampy zdążą się zakończyć) */
function gearSpeedSamples(pattern: string, gears: GearTable, useLina = false): number[] {
  const rn = new RunnerState(pattern, gears, useLina);
  const points = [0.10, 0.30, 0.60, 0.90];
  const samples: number[] = [];
  let i = 0;
  let guard = 0;
  while (i < points.length && guard++ < 300_000 && !rn.done) {
    rn.update(DT60);
    if (rn.progress() >= points[i]) {
      samples.push(rn.v);
      i++;
    }
  }
  return samples;
}

describe('biegi z postępu trasy (tabela trudność × runner)', () => {
  const diffs: DifficultyId[] = ['LATWY', 'NORMALNY', 'TRUDNY'];
  const runners: RunnerId[] = ['1-3', '2-3', '3-3'];
  for (const d of diffs) {
    for (const r of runners) {
      it(`${d} ${r}: v przy 10/30/60/90% = biegi 1–4 z tabeli`, () => {
        const gears = DIFFICULTY[d].runnerGears[r];
        expect(gearSpeedSamples(PATTERNS[r], gears)).toEqual([...gears]);
      });
    }
  }

  it('progi biegów: 0 / 25% / 50% / 75%', () => {
    expect(RUNNER_GEAR_THRESHOLDS).toEqual([0, 0.25, 0.5, 0.75]);
    const rn = new RunnerState(RUNNER_1_3, NG('1-3'));
    rn.traveled = rn.trackLen * 0.2499;
    expect(rn.gear).toBe(1);
    rn.traveled = rn.trackLen * 0.25;
    expect(rn.gear).toBe(2);
    rn.traveled = rn.trackLen * 0.5;
    expect(rn.gear).toBe(3);
    rn.traveled = rn.trackLen * 0.75;
    expect(rn.gear).toBe(4);
  });

  it('rampa: monotonicznie, ≤ 48 px/s² na klatkę, cel w ≤ 1,05 s', () => {
    // NORMALNY 2-3: największa delta biegów 1→2 (192 → 240 = 48 px/s)
    const gears = NG('2-3');
    const rn = new RunnerState(RUNNER_2_3, gears);
    while (rn.gear < 2) rn.update(DT60);
    let t = 0;
    let prev = rn.v;
    while (rn.v < gears[1] && t < 2) {
      rn.update(DT60);
      t += DT60;
      expect(rn.v).toBeGreaterThanOrEqual(prev);                    // monotonia
      expect(rn.v - prev).toBeLessThanOrEqual(RUNNER_GEAR_ACCEL * DT60 + 1e-9);
      prev = rn.v;
    }
    expect(rn.v).toBe(gears[1]);
    expect(t).toBeLessThanOrEqual(1.05);
  });

  it('reset po śmierci: bieg 1, traveled=0, przeszkody i zbiórki wracają', () => {
    const gears = NG('2-3');
    const rn = new RunnerState(RUNNER_2_3, gears);
    rn.traveled = rn.trackLen * 0.8;
    for (let i = 0; i < 120; i++) rn.update(DT60);   // rampa do biegu 4
    expect(rn.v).toBeGreaterThan(gears[0]);
    rn.obstacles[1].alive = false;
    rn.crystals[0].taken = true;
    rn.arrowPacks[0].taken = true;
    rn.reset();
    expect(rn.traveled).toBe(0);
    expect(rn.v).toBe(gears[0]);                     // bieg 1 — nic więcej
    expect(rn.gear).toBe(1);
    expect(rn.done).toBe(false);
    expect(rn.obstacles[1].alive).toBe(true);
    expect(rn.crystals[0].taken).toBe(false);
    expect(rn.arrowPacks[0].taken).toBe(false);
  });

  it('decel: od 368 px/s (TRUDNY 3-3) stop w ≤ 2,0 s', () => {
    const rn = new RunnerState(RUNNER_3_3_FULL, DIFFICULTY.TRUDNY.runnerGears['3-3']);
    rn.decel = true;
    rn.v = 368;
    let t = 0;
    while (!rn.done && t < 5) {
      rn.update(DT60);
      t += DT60;
    }
    expect(rn.done).toBe(true);
    expect(t).toBeLessThanOrEqual(2.0 + DT60);
    expect(368 / RUNNER_DECEL).toBeLessThanOrEqual(2.0);
    expect(rn.progress()).toBeLessThanOrEqual(1);
  });

  it('koniec toru: wytraca prędkość do 0 → done, progress = 1', () => {
    const rn = new RunnerState(RUNNER_1_3, NG('1-3'));
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

  it('wariant LINA: progi z krótszej trasy, bieg 4 osiągany przed decel', () => {
    const gears = NG('3-3');
    const rn = new RunnerState(RUNNER_3_3_FULL, gears, true);
    let maxV = 0;
    let guard = 0;
    while (!rn.decel && guard++ < 300_000) {
      rn.update(DT60);
      maxV = Math.max(maxV, rn.v);
    }
    expect(maxV).toBe(gears[3]);
    // progi liczone z KRÓTSZEJ trackLen (automatycznie przez progress)
    const at80 = new RunnerState(RUNNER_3_3_FULL, gears, true);
    at80.traveled = at80.trackLen * 0.8;
    expect(at80.gear).toBe(4);
  });

  it('Skrzat: biegi = baza ŁATWY × 0.7 (niezależnie od trudności)', () => {
    for (const r of ['1-3', '2-3', '3-3'] as RunnerId[]) {
      const skrzat = runnerGearsFor('TRUDNY', r, true);
      const latwy = DIFFICULTY.LATWY.runnerGears[r];
      for (let g = 0; g < 4; g++) {
        expect(skrzat[g]).toBeCloseTo(latwy[g] * SKRZAT_SPEED_SCALE, 6);
      }
    }
    // bez Skrzata: tabela wybranej trudności 1:1
    expect(runnerGearsFor('TRUDNY', '1-3', false))
      .toBe(DIFFICULTY.TRUDNY.runnerGears['1-3']);
  });

  it('determinizm: dwa przebiegi → identyczne pozycje (zero RNG)', () => {
    const a = new RunnerState(RUNNER_2_3, NG('2-3'));
    const b = new RunnerState(RUNNER_2_3, NG('2-3'));
    for (let i = 0; i < 4000; i++) {
      a.update(DT60);
      b.update(DT60);
      expect(a.traveled).toBe(b.traveled);
      expect(a.v).toBe(b.v);
      expect(a.gear).toBe(b.gear);
    }
  });
});

// ── Wykonalność (spec playtest2, test generatywny na patternach) ───────────

/** min. czas reakcji: odstęp kolejnych przeszkód / prędkość biegu w miejscu
 *  drugiej z nich (KK = jedna przeszkoda — klaster < 4 kolumny) */
function minReactionTime(pattern: string, gears: GearTable, useLina = false): number {
  const rn = new RunnerState(pattern, gears, useLina);
  const xs = [...rn.obstacles.map((o) => o.x), ...rn.gaps.map((g) => g.x)]
    .sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < xs.length; i++) {
    const gapPx = xs[i] - xs[i - 1];
    if (gapPx < 4 * TILE) continue;   // KK: podwójny kaktus = jedna przeszkoda
    const p = xs[i] / rn.trackLen;
    let gear = 1;
    for (let t = RUNNER_GEAR_THRESHOLDS.length - 1; t >= 1; t--) {
      if (p >= RUNNER_GEAR_THRESHOLDS[t]) {
        gear = t + 1;
        break;
      }
    }
    min = Math.min(min, gapPx / gears[gear - 1]);
  }
  return min;
}

describe('wykonalność patternów przy prędkościach biegów', () => {
  const minima: Record<DifficultyId, number> = {
    LATWY: 1.5, NORMALNY: 1.2, TRUDNY: 1.0,
  };
  for (const d of ['LATWY', 'NORMALNY', 'TRUDNY'] as DifficultyId[]) {
    it(`${d}: min. odstęp / prędkość ≥ ${minima[d]} s (wszystkie patterny + LINA)`, () => {
      for (const r of ['1-3', '2-3', '3-3'] as RunnerId[]) {
        const gears = DIFFICULTY[d].runnerGears[r];
        expect(minReactionTime(PATTERNS[r], gears))
          .toBeGreaterThanOrEqual(minima[d]);
      }
      expect(minReactionTime(RUNNER_3_3_FULL, DIFFICULTY[d].runnerGears['3-3'], true))
        .toBeGreaterThanOrEqual(minima[d]);
    });
  }
});

describe('kolizje i ślizg', () => {
  it('stojący gracz zderza się z Machaczem; w ślizgu przechodzi pod nim', () => {
    const rn = new RunnerState(RUNNER_2_3, NG('2-3'));
    const n = rn.obstacles.find((o) => o.kind === 'n')!;
    rn.traveled = n.x - RUNNER_PLAYER_X;   // Machacz dokładnie nad graczem
    // stojąc: głowa na wierszu 17 (y=272), h=32
    expect(checkObstacleHit(rn, 17 * TILE, 2 * TILE)).toBe(n);
    // ślizg: h=16, y=288 — pod Machaczem
    expect(checkObstacleHit(rn, 18 * TILE, TILE)).toBeNull();
  });

  it('kaktus trafia też w ślizgu (2 kratki wysokości)', () => {
    const rn = new RunnerState(RUNNER_1_3, NG('1-3'));
    const k = rn.obstacles.find((o) => o.kind === 'K')!;
    rn.traveled = k.x - RUNNER_PLAYER_X;
    expect(checkObstacleHit(rn, 18 * TILE, TILE)).toBe(k);
  });

  it('gracz w powietrzu nad kaktusem nie koliduje', () => {
    const rn = new RunnerState(RUNNER_1_3, NG('1-3'));
    const k = rn.obstacles.find((o) => o.kind === 'K')!;
    rn.traveled = k.x - RUNNER_PLAYER_X;
    // skok: głowa na 13 wierszu → stopy na 15 (240) nad kaktusem (272)
    expect(checkObstacleHit(rn, 13 * TILE, 2 * TILE)).toBeNull();
  });

  it('strzała zdejmuje Machacza (+20 pkt), wbija się w kaktus', () => {
    const rn = new RunnerState(RUNNER_2_3, NG('2-3'));
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
    const rn = new RunnerState(RUNNER_2_3, NG('2-3'));
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
