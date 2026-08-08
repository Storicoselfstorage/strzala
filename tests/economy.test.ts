/**
 * Ekonomia WSZYSTKICH map i patternów runnerów vs tabela 8.6 (PRD 14).
 * Wartości oczekiwane w balance.ts są zweryfikowane względem danych v1;
 * rozbieżności tabeli aneksu z levels.py opisane przy ECONOMY_MAPS.
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_GATE_CRYSTALS, ECONOMY_MAPS, ECONOMY_RUNNERS,
} from '../src/core/balance';
import { countMapEconomy, countRunnerEconomy } from '../src/core/economy';
import {
  DRAGONS, LEVEL_DEF, LEVEL_ORDER, MAPS,
  RUNNER_1_3, RUNNER_2_3, RUNNER_3_3_FULL, THIEF_MAX,
} from '../src/data/levels';

const RUNNER_PATTERN: Record<string, string> = {
  '1-3': RUNNER_1_3, '2-3': RUNNER_2_3, '3-3': RUNNER_3_3_FULL,
};

describe('ekonomia map (tabela 8.6)', () => {
  for (const [mapId, expected] of Object.entries(ECONOMY_MAPS)) {
    it(`mapa ${mapId}`, () => {
      const c = countMapEconomy(MAPS[mapId]);
      expect(c.crystals).toBe(expected.crystals);
      expect(c.diamonds).toBe(expected.diamonds);
      expect(c.arrowPacks).toBe(expected.arrowPacks);
      expect(c.cakes).toBe(expected.cakes);
      expect(c.cacti).toBe(expected.cacti);
      expect(c.spikeCells).toBe(expected.spikeCells);
      expect(c.traps).toBe(expected.traps);
      expect(c.thiefPoints).toBe(expected.thiefPoints);
      expect(c.hearts).toBe(expected.hearts);
      expect(c.oPoints).toBe(expected.oPoints);
    });
  }

  it('każda mapa ma dokładnie 1 start i 1 wyjście', () => {
    for (const rows of Object.values(MAPS)) {
      const c = countMapEconomy(rows);
      expect(c.playerStarts).toBe(1);
      expect(c.exits).toBe(1);
    }
  });

  it('areny smoków z tarczą mają 3 punkty `o`; bez tarczy — 0', () => {
    // 1-2 Miraż (bez tarczy), ARENA_1_3 Samum (bez), 2-2 Cierń, ARENA_2_3
    // Monsun, 3-2 Pira, BOSS Obsydian (z tarczą)
    const arenaMap: Record<string, string> = {
      '1-2': '1-2', '1-3': 'ARENA_1_3', '2-2': '2-2', '2-3': 'ARENA_2_3',
      '3-2': '3-2', 'BOSS': 'BOSS',
    };
    for (const [lid, mid] of Object.entries(arenaMap)) {
      const dragon = LEVEL_DEF[lid].dragon;
      expect(dragon).not.toBeNull();
      const c = countMapEconomy(MAPS[mid]);
      expect(c.oPoints).toBe(DRAGONS[dragon!].shield ? 3 : 0);
    }
  });

  it('limit złodziei zgodny z liczbą punktów T', () => {
    for (const [lid, max] of Object.entries(THIEF_MAX)) {
      const c = countMapEconomy(MAPS[lid]);
      expect(c.thiefPoints).toBeGreaterThanOrEqual(1);
      expect(max).toBeGreaterThanOrEqual(1);
      // v1: limit nie przekracza sensownie punktów spawnu × wielokrotność
      expect(max).toBeLessThanOrEqual(c.thiefPoints * 3);
    }
  });
});

describe('ekonomia runnerów (patterny 8.3)', () => {
  for (const [lid, expected] of Object.entries(ECONOMY_RUNNERS)) {
    it(`runner ${lid}`, () => {
      const c = countRunnerEconomy(RUNNER_PATTERN[lid]);
      expect(c.crystals).toBe(expected.crystals);
      expect(c.arrowPacks).toBe(expected.arrowPacks);
      expect(c.cactusTokens).toBe(expected.cactusTokens);
      expect(c.cactusEntities).toBe(expected.cactusEntities);
      expect(c.machacze).toBe(expected.machacze);
      expect(c.gaps).toBe(expected.gaps);
    });
  }

  it('3-3: kryształów wystarcza na bramę bossa (15 ≥ 10)', () => {
    const c = countRunnerEconomy(RUNNER_3_3_FULL);
    expect(c.crystals).toBe(15);
    expect(c.crystals).toBeGreaterThanOrEqual(BOSS_GATE_CRYSTALS);
  });

  it('kolejność poziomów kompletna i zdefiniowana', () => {
    expect(LEVEL_ORDER).toHaveLength(10);
    for (const lid of LEVEL_ORDER) {
      expect(LEVEL_DEF[lid]).toBeDefined();
    }
  });
});
