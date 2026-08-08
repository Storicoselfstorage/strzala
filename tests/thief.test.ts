/**
 * Złodziejaszek — algorytm 6.2: priorytet łupu (placek → 3 strzały →
 * 1 diament), reguła chronionego plecaka Vegi, ucieczka 6 s, odzysk łupu,
 * spawner (dystans/czas/cooldown/limit) i czasy sygnalizacji.
 */
import { describe, expect, it } from 'vitest';
import {
  DT60, THIEF_FLEE_SPEED, THIEF_LOOT_TTL, THIEF_RUN_SPEED, TILE,
} from '../src/core/balance';
import { Backpack, Thief, ThiefEnv, ThiefSpawner } from '../src/core/thief';

const flatEnv = (playerX: number, widthPx = 1600): ThiefEnv => ({
  levelWidthPx: widthPx,
  solidAt: (r) => r >= 19,
  isCactus: () => false,
  playerX,
  playerY: 272,
});

const bp = (over: Partial<Backpack> = {}): Backpack => ({
  arrows: 10, hasCake: true, diamondsLevel: 2, ...over,
});

describe('priorytet łupu (aneks 6.2 pkt 3)', () => {
  it('placek kradziony w pierwszej kolejności', () => {
    const t = new Thief(800, 272);
    const pack = bp();
    const ev = t.steal(pack, false, 1600);
    expect(ev).toEqual({ type: 'stole', loot: { kind: 'cake', count: 1 }, cakeStolen: true });
    expect(pack.hasCake).toBe(false);
    expect(pack.arrows).toBe(10);
    expect(t.state).toBe('flee');
  });

  it('bez placka: 3 strzały', () => {
    const pack = bp({ hasCake: false });
    const ev = new Thief(800, 272).steal(pack, false, 1600);
    expect(ev.type === 'stole' && ev.loot).toEqual({ kind: 'arrow', count: 3 });
    expect(pack.arrows).toBe(7);
  });

  it('mniej niż 3 strzały: kradnie ile jest', () => {
    const pack = bp({ hasCake: false, arrows: 2 });
    const ev = new Thief(800, 272).steal(pack, false, 1600);
    expect(ev.type === 'stole' && ev.loot).toEqual({ kind: 'arrow', count: 2 });
    expect(pack.arrows).toBe(0);
  });

  it('bez placka i strzał: 1 diament', () => {
    const pack = bp({ hasCake: false, arrows: 0 });
    const ev = new Thief(800, 272).steal(pack, false, 1600);
    expect(ev.type === 'stole' && ev.loot).toEqual({ kind: 'diamond', count: 1 });
    expect(pack.diamondsLevel).toBe(1);
  });

  it('pusty plecak: łup null, złodziej i tak ucieka', () => {
    const t = new Thief(800, 272);
    const ev = t.steal(bp({ hasCake: false, arrows: 0, diamondsLevel: 0 }), false, 1600);
    expect(ev.type === 'stole' && ev.loot).toBeNull();
    expect(t.state).toBe('flee');
  });
});

describe('reguła Vegi (chroniony plecak)', () => {
  it('nigdy placka: od razu najwyżej 1 strzała', () => {
    const pack = bp();
    const ev = new Thief(800, 272).steal(pack, true, 1600);
    expect(ev.type === 'stole' && ev.loot).toEqual({ kind: 'arrow', count: 1 });
    expect(ev.type === 'stole' && ev.cakeStolen).toBe(false);
    expect(pack.hasCake).toBe(true);
    expect(pack.arrows).toBe(9);
  });

  it('nigdy diamentu: bez strzał łup null', () => {
    const pack = bp({ arrows: 0 });
    const ev = new Thief(800, 272).steal(pack, true, 1600);
    expect(ev.type === 'stole' && ev.loot).toBeNull();
    expect(pack.diamondsLevel).toBe(2);
    expect(pack.hasCake).toBe(true);
  });
});

describe('ruch i ucieczka', () => {
  it('podchodzi do gracza 160 px/s (10 kol/s — wolniej niż bohaterki)', () => {
    const t = new Thief(800, 272);
    const env = flatEnv(400);
    for (let i = 0; i < 60; i++) t.update(DT60, env);
    expect(t.x).toBeLessThan(800 - THIEF_RUN_SPEED * 0.9);
    expect(t.x).toBeGreaterThan(800 - THIEF_RUN_SPEED * 1.1);
  });

  it('ucieka do bliższej krawędzi 224 px/s', () => {
    const t = new Thief(400, 272);        // lewa połowa → dirOut −1
    t.steal(bp(), false, 1600);
    expect(t.dirOut).toBe(-1);
    const env = flatEnv(800);
    const x0 = t.x;
    for (let i = 0; i < 30; i++) t.update(DT60, env);
    expect(x0 - t.x).toBeCloseTo(THIEF_FLEE_SPEED * 0.5, 0);
  });

  it('po 6 s ucieczki znika z łupem bezpowrotnie', () => {
    const t = new Thief(3000, 272);
    t.steal(bp(), false, 6400);
    const env = flatEnv(0, 6400);
    let escaped = false;
    for (let i = 0; i < 60 * 7 && !escaped; i++) {
      escaped = t.update(DT60, env).some((e) => e.type === 'escaped');
    }
    expect(escaped).toBe(true);
    expect(t.alive).toBe(false);
  });

  it('złapany w ucieczce oddaje łup (leży 10 s) i daje +50 pkt', () => {
    const t = new Thief(400, 272);
    t.steal(bp(), false, 1600);
    const ev = t.caught();
    expect(ev.type).toBe('caught');
    if (ev.type === 'caught') {
      expect(ev.score).toBe(50);
      expect(ev.drop).toMatchObject({ kind: 'cake', count: 1, ttl: THIEF_LOOT_TTL });
    }
    expect(t.alive).toBe(false);
  });
});

describe('spawner (game.py maybe_spawn_thief)', () => {
  const baseCtx = {
    levelTime: 5,
    playerX: 0,
    thiefPoints: [{ x: 928, y: 288 }],   // T w kratce (18, 58)
    echoPresent: false,
    limit: 1,
    cooldownAfterDespawn: 30,
    anyThiefActive: false,
  };

  it('spawn gdy gracz < 25 kolumn (400 px) od punktu T', () => {
    const sp = new ThiefSpawner();
    expect(sp.update(DT60, { ...baseCtx, playerX: 100 })).toBeNull();
    const spawn = sp.update(DT60, { ...baseCtx, playerX: 600 });
    expect(spawn).not.toBeNull();
    expect(spawn!.thief.y).toBe(288 - TILE);   // v1: Thief(c, r−1)
    expect(spawn!.warnTime).toBe(1.5);
    expect(spawn!.warnSide).toBe(1);
  });

  it('spawn po 20 s poziomu niezależnie od dystansu', () => {
    const sp = new ThiefSpawner();
    expect(sp.update(DT60, { ...baseCtx, levelTime: 19 })).toBeNull();
    expect(sp.update(DT60, { ...baseCtx, levelTime: 21 })).not.toBeNull();
  });

  it('z Echo sygnalizacja 3 s zamiast 1,5 s', () => {
    const sp = new ThiefSpawner();
    const spawn = sp.update(DT60, { ...baseCtx, playerX: 600, echoPresent: true });
    expect(spawn!.warnTime).toBe(3.0);
  });

  it('limit poziomu i cooldown po zniknięciu', () => {
    const sp = new ThiefSpawner();
    expect(sp.update(DT60, { ...baseCtx, playerX: 600 })).not.toBeNull();
    // limit 1 → koniec
    expect(sp.update(DT60, { ...baseCtx, playerX: 600 })).toBeNull();

    const sp2 = new ThiefSpawner();
    const ctx2 = { ...baseCtx, playerX: 600, limit: 2 };
    expect(sp2.update(DT60, ctx2)).not.toBeNull();
    sp2.noteDespawn({ cooldownAfterDespawn: 30 });
    expect(sp2.update(DT60, ctx2)).toBeNull();   // cooldown blokuje
    for (let i = 0; i < 30 * 60; i++) sp2.update(DT60, { ...ctx2, playerX: 0, levelTime: 1 });
    expect(sp2.update(DT60, ctx2)).not.toBeNull();
  });

  it('aktywny złodziej blokuje kolejny spawn', () => {
    const sp = new ThiefSpawner();
    expect(sp.update(DT60, { ...baseCtx, playerX: 600, limit: 3, anyThiefActive: true }))
      .toBeNull();
  });

  it('reset poziomu zeruje licznik i cooldown (snapshot 8.5)', () => {
    const sp = new ThiefSpawner();
    sp.update(DT60, { ...baseCtx, playerX: 600 });
    sp.noteDespawn({ cooldownAfterDespawn: 30 });
    sp.reset();
    expect(sp.update(DT60, { ...baseCtx, playerX: 600 })).not.toBeNull();
  });
});
