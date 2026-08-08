/**
 * Parser map: legenda znaków (aneks 10), spawny, kolizje, asserty P/E.
 */
import { describe, expect, it } from 'vitest';
import { parseMap, solidAt, standRow, sealWallCells } from '../src/core/mapParser';
import { MAPS } from '../src/data/levels';

describe('parser mapy 1-1', () => {
  const m = parseMap(MAPS['1-1'], '1-1');

  it('wymiary: 100×20 kratek → 1600×320 px', () => {
    expect(m.widthTiles).toBe(100);
    expect(m.heightTiles).toBe(20);
    expect(m.widthPx).toBe(1600);
    expect(m.heightPx).toBe(320);
  });

  it('start gracza: P w wierszu 18 → głowa na (17,2) = (32, 272) px', () => {
    expect(m.playerStart).toEqual({ r: 17, c: 2, x: 32, y: 272 });
  });

  it('wyjście E na wierszu 18', () => {
    expect(m.exit.r).toBe(18);
    expect(m.exit.c).toBeGreaterThan(90);
  });

  it('spawny wg legendy: Echo (M), kryjówka (m), złodziej (T), Toczek (1)', () => {
    expect(m.echoMarker).not.toBeNull();
    expect(m.hideout).not.toBeNull();
    expect(m.hideout!.c).toBe(5);
    expect(m.thiefPoints).toHaveLength(1);
    expect(m.enemies.filter((e) => e.kind === 'toczek')).toHaveLength(1);
  });

  it('kryształy i pułapki policzone', () => {
    expect(m.crystalTotal).toBe(10);
    expect(m.pickups.filter((p) => p.kind === 'crystal')).toHaveLength(10);
    expect(m.traps).toHaveLength(2);
    expect(m.traps.every((t) => t.r === 18)).toBe(true);
    expect(m.cacti).toHaveLength(3);
  });

  it('kaktus zajmuje 2 kratki (r i r−1)', () => {
    expect(m.cactusCells.size).toBe(6);
  });

  it('kolizje: grunt solidny, niebo nie, krawędzie mapy jak ściana', () => {
    expect(solidAt(m, 19, 2)).toBe(true);    // '=' na dnie
    expect(solidAt(m, 5, 2)).toBe(false);
    expect(solidAt(m, 10, -1)).toBe(true);   // poza lewą krawędzią
    expect(solidAt(m, 10, 100)).toBe(true);  // poza prawą
    expect(solidAt(m, -1, 5)).toBe(false);   // nad mapą
    expect(solidAt(m, 25, 5)).toBe(false);   // pod mapą
  });

  it('standRow: na gruncie stoi się w wierszu 18', () => {
    expect(standRow(m, 2)).toBe(18);
  });
});

describe('parser map areny i pułapek', () => {
  it('1-2: trigger areny, spawn smoka, ściana |', () => {
    const m = parseMap(MAPS['1-2'], '1-2');
    expect(m.trigger).not.toBeNull();
    expect(m.dragonSpawn).not.toBeNull();
    expect(m.solidTiles.some((t) => t.kind === 'wall')).toBe(true);
    expect(m.oPoints).toHaveLength(0);       // Miraż bez tarczy
  });

  it('2-1: znikające platformy zgrupowane w 3 segmenty po 6 kratek', () => {
    const m = parseMap(MAPS['2-1'], '2-1');
    expect(m.vanish).toHaveLength(3);
    for (const v of m.vanish) {
      expect(v.c1 - v.c0 + 1).toBe(6);
      expect(v.widthPx).toBe(96);
    }
  });

  it('ARENA_2_3: 3 punkty `o` dla tarczy Monsuna', () => {
    const m = parseMap(MAPS['ARENA_2_3'], 'ARENA_2_3');
    expect(m.oPoints).toHaveLength(3);
    expect(m.dragonSpawn).not.toBeNull();
  });

  it('3-1: gejzery i głaz sparsowane', () => {
    const m = parseMap(MAPS['3-1'], '3-1');
    expect(m.geysers).toHaveLength(3);
    expect(m.boulders).toHaveLength(1);
  });

  it('sealWallCells domyka ścianę areny na wierszach 17-18', () => {
    expect(sealWallCells(137)).toEqual([[17, 137], [18, 137]]);
  });
});

describe('walidacja wejścia', () => {
  it('zła wysokość mapy → wyjątek', () => {
    expect(() => parseMap(['===', '==='], 'X')).toThrow(/wysokość/);
  });

  it('brak P/E → wyjątek', () => {
    const rows = Array.from({ length: 20 }, () => '   ');
    expect(() => parseMap(rows, 'X')).toThrow(/P\/E/);
  });

  it('wszystkie mapy v1 parsują się bez błędu', () => {
    for (const [mid, rows] of Object.entries(MAPS)) {
      expect(() => parseMap(rows, mid)).not.toThrow();
    }
  });
});
