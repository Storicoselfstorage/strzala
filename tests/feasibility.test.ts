/**
 * Wykonalność Vegą — port testu geometrii z v1 (scratchpad/test_extra.py):
 * każdy przedmiot osiągalny z pola, na którym można stanąć, w zasięgu
 * poziomym ≤ 5 kolumn i wzniosie ≤ 3 wierszy (twarda reguła map, aneks 5).
 * Sekrety Tosi: 2-1 (14,75) i 3-1 (14,51) — zasięg 4 kratki (tylko Tosia).
 */
import { describe, expect, it } from 'vitest';
import { MAP_H_TILES } from '../src/core/balance';
import { cellKey, parseMap, solidAt } from '../src/core/mapParser';
import { MAPS } from '../src/data/levels';

const TOSIA_SECRETS = new Set(['2-1:14:75', '3-1:14:51']);
const PICKUP_CHARS = new Set(['C', 'D', 'A', 'L', 'V', 't', 'u', 'o']);

const TESTED_MAPS = [
  '1-1', '1-2', '2-1', '2-2', '3-1', '3-2', 'BOSS', 'ARENA_1_3', 'ARENA_2_3',
];

describe('geometria: każdy przedmiot osiągalny Vegą', () => {
  for (const mid of TESTED_MAPS) {
    it(`mapa ${mid}`, () => {
      const m = parseMap(MAPS[mid], mid);
      const hazard = new Set([...m.cactusCells, ...m.spikeCells]);

      const standable = (r: number, c: number) =>
        solidAt(m, r + 1, c) && !solidAt(m, r, c) && !solidAt(m, r - 1, c)
        && !hazard.has(cellKey(r, c)) && !hazard.has(cellKey(r - 1, c));

      const stands: Array<[number, number]> = [];
      for (let r = 1; r < MAP_H_TILES - 1; r++) {
        for (let c = 0; c < m.widthTiles; c++) {
          if (standable(r, c)) stands.push([r, c]);
        }
      }

      const bad: string[] = [];
      m.rows.forEach((line, r) => {
        for (let c = 0; c < line.length; c++) {
          if (!PICKUP_CHARS.has(line[c])) continue;
          const secret = TOSIA_SECRETS.has(`${mid}:${r}:${c}`);
          const rise = secret ? 4 : 3;
          const ok = stands.some(([sr, sc]) =>
            Math.abs(sc - c) <= 5 && sr - 1 - rise <= r && r <= sr + 1);
          if (!ok) bad.push(`${line[c]}@(${r},${c})`);
        }
      });
      expect(bad, `nieosiągalne: ${bad.join(', ')}`).toHaveLength(0);
    });
  }
});
