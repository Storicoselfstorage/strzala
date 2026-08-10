/**
 * Złodziejaszek 2.0 (spec playtest2): FSM approach → flee(sprint) →
 * flee(tired) → dig → kopczyk; zawrotki na krawędziach (NIGDY poza mapę),
 * kradzież CAŁEGO plecaka (kryształy nigdy; Vega: 1 strzała; Skrzat: ≤ 3),
 * złapanie żywego = zwrot prosto do plecaka (+50, bez dropu/TTL), kopczyk
 * 0,8 s = pełny zwrot bez bonusu. Spawner bez zmian względem v1.
 */
import { describe, expect, it } from 'vitest';
import {
  DT60, THIEF_BURY_AT, THIEF_DIG_TIME, THIEF_EDGE_MARGIN, THIEF_FLEE_SPEED,
  THIEF_JUMP_V, THIEF_MOUND_DIG_TIME, THIEF_RUN_SPEED, THIEF_SPRINT_TIME,
  THIEF_TIRED_SPEED, TILE,
} from '../src/core/balance';
import {
  Backpack, Loot, lootEmpty, Mound, returnLoot, Thief, ThiefEnv, ThiefEvent,
  ThiefSpawner,
} from '../src/core/thief';

const flatEnv = (playerX: number, widthPx = 1600): ThiefEnv => ({
  levelWidthPx: widthPx,
  solidAt: (r) => r >= 19,
  isCactus: () => false,
  playerX,
  playerY: 272,
});

const bp = (over: Partial<Backpack> = {}): Backpack => ({
  arrows: 7, magic: 2, hasCake: true, diamondsLevel: 1, ...over,
});

describe('kradzież całego plecaka (spec playtest2)', () => {
  it('Tosia: placek + wszystkie strzały (zwykłe i magiczne) + diamenty poziomu', () => {
    const t = new Thief(800, 272);
    const pack = bp();
    const ev = t.steal(pack, false, 1600);
    expect(ev).toEqual({
      type: 'stole',
      loot: { arrows: 7, magic: 2, diamonds: 1, hasCake: true },
      cakeStolen: true,
    });
    expect(pack).toEqual({ arrows: 0, magic: 0, hasCake: false, diamondsLevel: 0 });
    expect(t.state).toBe('flee');
  });

  it('kryształy NIGDY: Loot nie ma pola kryształów', () => {
    const t = new Thief(800, 272);
    const ev = t.steal(bp(), false, 1600);
    const loot = (ev.type === 'stole' && ev.loot) as Loot;
    expect(Object.keys(loot).sort())
      .toEqual(['arrows', 'diamonds', 'hasCake', 'magic']);
  });

  it('Vega (chroniony plecak): dokładnie 1 zwykła strzała, nic więcej', () => {
    const pack = bp();
    const ev = new Thief(800, 272).steal(pack, true, 1600);
    expect(ev.type === 'stole' && ev.loot)
      .toEqual({ arrows: 1, magic: 0, diamonds: 0, hasCake: false });
    expect(ev.type === 'stole' && ev.cakeStolen).toBe(false);
    expect(pack).toEqual({ arrows: 6, magic: 2, hasCake: true, diamondsLevel: 1 });
  });

  it('Vega bez strzał: łup pusty (null), reszta nietknięta', () => {
    const pack = bp({ arrows: 0 });
    const ev = new Thief(800, 272).steal(pack, true, 1600);
    expect(ev.type === 'stole' && ev.loot).toBeNull();
    expect(pack).toEqual({ arrows: 0, magic: 2, hasCake: true, diamondsLevel: 1 });
  });

  it('Tryb Skrzat: najwyżej 3 zwykłe strzały, nic więcej', () => {
    const pack = bp({ arrows: 7 });
    const ev = new Thief(800, 272).steal(pack, false, 1600, true);
    expect(ev.type === 'stole' && ev.loot)
      .toEqual({ arrows: 3, magic: 0, diamonds: 0, hasCake: false });
    expect(pack).toEqual({ arrows: 4, magic: 2, hasCake: true, diamondsLevel: 1 });
  });

  it('pusty plecak: łup null, złodziej i tak ucieka', () => {
    const t = new Thief(800, 272);
    const ev = t.steal(
      bp({ arrows: 0, magic: 0, hasCake: false, diamondsLevel: 0 }), false, 1600,
    );
    expect(ev.type === 'stole' && ev.loot).toBeNull();
    expect(t.state).toBe('flee');
  });
});

describe('złapanie żywego: zwrot prosto do plecaka (+50, bez dropu)', () => {
  it('plecak wraca bit-w-bit do stanu sprzed kradzieży', () => {
    const t = new Thief(400, 272);
    const pack = bp();
    const original = { ...pack };
    t.steal(pack, false, 1600);
    const ev = t.caught();
    expect(ev.type).toBe('caught');
    if (ev.type === 'caught') {
      expect(ev.score).toBe(50);
      expect('drop' in ev).toBe(false);   // dropu na ziemi już nie ma
      returnLoot(ev.loot!, pack);
    }
    expect(pack).toEqual(original);
    expect(t.alive).toBe(false);
  });

  it('złapanie z pustym łupem daje +50', () => {
    const t = new Thief(400, 272);
    t.steal(bp({ arrows: 0, magic: 0, hasCake: false, diamondsLevel: 0 }), false, 1600);
    const ev = t.caught();
    expect(ev.type === 'caught' && ev.score).toBe(50);
    expect(ev.type === 'caught' && ev.loot).toBeNull();
  });
});

describe('ruch i FSM ucieczki', () => {
  it('podchodzi do gracza 160 px/s (10 kol/s — wolniej niż bohaterki)', () => {
    const t = new Thief(800, 272);
    const env = flatEnv(400);
    for (let i = 0; i < 60; i++) t.update(DT60, env);
    expect(t.x).toBeLessThan(800 - THIEF_RUN_SPEED * 0.9);
    expect(t.x).toBeGreaterThan(800 - THIEF_RUN_SPEED * 1.1);
  });

  it('ucieka sprintem do bliższej krawędzi 224 px/s', () => {
    const t = new Thief(700, 272);          // lewa połowa → dirOut −1
    t.steal(bp(), false, 1600);
    expect(t.dirOut).toBe(-1);
    const env = flatEnv(1500);              // gracz daleko (bez uniku)
    const x0 = t.x;
    for (let i = 0; i < 30; i++) t.update(DT60, env);
    expect(x0 - t.x).toBeCloseTo(THIEF_FLEE_SPEED * 0.5, 0);
  });

  it('NIGDY poza mapą: 60 s flee na mapie 160 kolumn, zero `escaped`', () => {
    const width = 160 * TILE;               // 2560 px
    const t = new Thief(800, 272);
    t.steal(bp(), false, width);
    const env = flatEnv(2400, width);
    const seen: string[] = [];
    for (let i = 0; i < 60 * 60 && t.alive; i++) {
      const evs = t.update(DT60, env);
      for (const e of evs) seen.push(e.type);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(width - TILE);
    }
    expect(seen).not.toContain('escaped');
    expect(seen).toContain('turned');
    expect(seen).toContain('buried');       // łup ląduje w kopczyku, nie znika
  });

  it('zawrotka na krawędzi: dirOut się odwraca, bounces rośnie', () => {
    const t = new Thief(100, 272);
    t.steal(bp(), false, 1600);             // dirOut −1 (lewa połowa)
    const env = flatEnv(1500);
    let turned = false;
    for (let i = 0; i < 120 && !turned; i++) {
      turned = t.update(DT60, env).some((e) => e.type === 'turned');
    }
    expect(turned).toBe(true);
    expect(t.dirOut).toBe(1);
    expect(t.bounces).toBe(1);
    expect(t.x).toBeGreaterThanOrEqual(THIEF_EDGE_MARGIN - 4);
  });

  it('ściana ≥ 3 wierszy: zawrotka, NIE skok; przeszkoda ≤ 2 wierszy: skok', () => {
    // ściana areny w kolumnie 60 (pełna wysokość)
    const wallEnv: ThiefEnv = {
      levelWidthPx: 1600,
      solidAt: (r, c) => r >= 19 || c === 60,
      isCactus: () => false,
      playerX: 0, playerY: 272,
    };
    const t = new Thief(56 * TILE, 272);
    t.steal(bp(), false, 1600);
    t.dirOut = 1;                            // biegnie w prawo na ścianę
    let turned = false;
    for (let i = 0; i < 120 && !turned; i++) {
      turned = t.update(DT60, wallEnv).some((e) => e.type === 'turned');
      expect(t.vy).toBeGreaterThanOrEqual(-1e-9);   // nigdy nie skacze na ścianę
    }
    expect(turned).toBe(true);
    expect(t.dirOut).toBe(-1);

    // niska przeszkoda (2 wiersze: 17–18 w kolumnie 60) → skok jak w v1
    const lowEnv: ThiefEnv = {
      levelWidthPx: 1600,
      solidAt: (r, c) => r >= 19 || (c === 60 && r >= 17),
      isCactus: () => false,
      playerX: 0, playerY: 272,
    };
    const t2 = new Thief(56 * TILE, 272);
    t2.steal(bp(), false, 1600);
    t2.dirOut = 1;
    let jumped = false;
    for (let i = 0; i < 120 && !jumped; i++) {
      t2.update(DT60, lowEnv);
      if (t2.vy < -THIEF_JUMP_V * 0.9) jumped = true;
    }
    expect(jumped).toBe(true);
    expect(t2.bounces).toBe(0);
  });

  it('tired po 6 s sprintu: prędkość 176 px/s (11 kol/s)', () => {
    const width = 400 * TILE;                // szeroko — bez zawrotek
    const t = new Thief(width / 2, 272);
    t.steal(bp(), false, width);
    const env = flatEnv(0, width);
    let sawTired = false;
    for (let i = 0; i <= Math.ceil((THIEF_SPRINT_TIME + 0.1) / DT60); i++) {
      sawTired = t.update(DT60, env).some((e) => e.type === 'tired') || sawTired;
    }
    expect(sawTired).toBe(true);
    expect(t.state).toBe('tired');
    const x0 = t.x;
    for (let i = 0; i < 60; i++) t.update(DT60, env);
    expect(Math.abs(t.x - x0)).toBeCloseTo(THIEF_TIRED_SPEED, 0);
  });

  it('tired po 2 zawrotkach (przed upływem 6 s)', () => {
    const width = 50 * TILE;                 // 800 px — wąska mapa
    const t = new Thief(width / 2, 272);
    t.steal(bp(), false, width);
    const env = flatEnv(width - 40, width);
    let elapsed = 0;
    while (t.state !== 'tired' && elapsed < 10) {
      t.update(DT60, env);
      elapsed += DT60;
    }
    expect(t.state).toBe('tired');
    expect(t.bounces).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(THIEF_SPRINT_TIME);
  });

  it('karencja dotyku po kradzieży: 0,5 s bez złapania (kradzież = overlap)', () => {
    const t = new Thief(800, 272);
    t.steal(bp(), false, 1600);
    expect(t.catchableByTouch()).toBe(false);   // klatka kradzieży: bez łapania
    const env = flatEnv(1500);
    for (let i = 0; i < Math.ceil(0.5 / DT60) + 1; i++) t.update(DT60, env);
    expect(t.catchableByTouch()).toBe(true);    // po karencji dotyk łapie
  });

  it('unik-podskok tylko przy mijaniu na tej samej wysokości', () => {
    // gracz na ziemi (y=272 jak złodziej) → przeskok nad głową
    const pass = (playerY: number): number => {
      const t = new Thief(800, 272);
      t.steal(bp(), false, 3200);
      t.dirOut = 1;
      let minY = t.y;
      for (let i = 0; i < 120; i++) {
        t.update(DT60, { ...flatEnv(900, 3200), playerY });
        minY = Math.min(minY, t.y);
      }
      return minY;
    };
    expect(pass(272)).toBeLessThan(272 - 20);        // podskok (leci nad głową)
    expect(pass(272 - 3 * TILE)).toBe(272);          // gracz na platformie: bez skoku
  });

  it('dogonienie Vegą (208 px/s): dotyka złodzieja przed THIEF_BURY_AT', () => {
    const width = 160 * TILE;
    const t = new Thief(800, 272);
    let px = 800 - 40 * TILE;                // Vega 40 kolumn za złodziejem
    t.steal(bp(), false, width);
    let caughtAt = -1;
    for (let i = 0; i < 60 * 25 && caughtAt < 0 && t.alive; i++) {
      t.update(DT60, { ...flatEnv(px, width), playerX: px });
      px += Math.sign(t.x - px) * 208 * DT60;
      if (Math.abs(t.x - px) < 12 && Math.abs(t.y - 272) < 24) {
        caughtAt = t.fleeT;
      }
    }
    expect(caughtAt).toBeGreaterThan(0);
    expect(caughtAt).toBeLessThan(THIEF_BURY_AT);
  });
});

describe('dig i kopczyk (spec playtest2)', () => {
  const dugThief = (loot = true): { t: Thief; events: ThiefEvent[] } => {
    const t = new Thief(800, 272);
    t.steal(loot ? bp() : bp({ arrows: 0, magic: 0, hasCake: false, diamondsLevel: 0 }),
      false, 1600);
    t.fleeT = THIEF_BURY_AT - DT60 / 2;      // tuż przed zakopaniem
    const events: ThiefEvent[] = [];
    const env = flatEnv(1500);
    for (let i = 0; i < 60 * 3 && t.alive; i++) events.push(...t.update(DT60, env));
    return { t, events };
  };

  it('po 20 s flee: 1,2 s kopania → kopczyk z całym łupem, bez TTL', () => {
    const { t, events } = dugThief();
    expect(events.some((e) => e.type === 'digStart')).toBe(true);
    const buried = events.find((e) => e.type === 'buried');
    expect(buried && buried.type === 'buried' && buried.mound.loot)
      .toEqual({ arrows: 7, magic: 2, diamonds: 1, hasCake: true });
    expect(t.alive).toBe(false);
    // kopczyk nie ma TTL — klasa Mound nie zna pojęcia wygaśnięcia
    const m = new Mound(800, 304, { arrows: 7, magic: 2, diamonds: 1, hasCake: true });
    expect('ttl' in m).toBe(false);
  });

  it('w trakcie kopania złapanie działa (pełny zwrot +50)', () => {
    const t = new Thief(800, 272);
    const pack = bp();
    const original = { ...pack };
    t.steal(pack, false, 1600);
    t.fleeT = THIEF_BURY_AT + 0.01;
    const env = flatEnv(1500);
    t.update(DT60, env);                     // wchodzi w dig
    expect(t.state).toBe('dig');
    for (let i = 0; i < Math.floor(THIEF_DIG_TIME / 2 / DT60); i++) t.update(DT60, env);
    expect(t.alive).toBe(true);              // w połowie kopania wciąż jest
    const ev = t.caught();
    expect(ev.type === 'caught' && ev.score).toBe(50);
    if (ev.type === 'caught' && ev.loot) returnLoot(ev.loot, pack);
    expect(pack).toEqual(original);
  });

  it('kopczyk: 0,8 s stania → pełny zwrot; zejście zeruje postęp; dt=0 nie tyka', () => {
    const loot: Loot = { arrows: 7, magic: 2, diamonds: 1, hasCake: true };
    const m = new Mound(800, 304, loot);
    // pół czasu → zejście → postęp od zera
    for (let i = 0; i < Math.floor(THIEF_MOUND_DIG_TIME / 2 / DT60); i++) {
      expect(m.update(DT60, true)).toBe(false);
    }
    expect(m.progress()).toBeGreaterThan(0.4);
    m.update(DT60, false);
    expect(m.progress()).toBe(0);
    // pauza: dt=0 nie posuwa odkopywania
    m.update(0, true);
    expect(m.progress()).toBe(0);
    // pełne 0,8 s → odkopane; zwrot = pełny łup (bez bonusu — scena nie dolicza)
    let done = false;
    for (let i = 0; i < 200 && !done; i++) done = m.update(DT60, true);
    expect(done).toBe(true);
    expect(m.dug).toBe(true);
    const pack: Backpack = { arrows: 0, magic: 0, hasCake: false, diamondsLevel: 0 };
    returnLoot(m.loot, pack);
    expect(pack).toEqual({ arrows: 7, magic: 2, hasCake: true, diamondsLevel: 1 });
  });

  it('pusty łup: brak kopczyka, despawn po THIEF_BURY_AT', () => {
    const { t, events } = dugThief(false);
    expect(t.alive).toBe(false);
    expect(events.some((e) => e.type === 'vanished')).toBe(true);
    expect(events.some((e) => e.type === 'buried')).toBe(false);
    expect(events.some((e) => e.type === 'digStart')).toBe(false);
  });

  it('lootEmpty rozpoznaje pusty pakiet', () => {
    expect(lootEmpty({ arrows: 0, magic: 0, diamonds: 0, hasCake: false })).toBe(true);
    expect(lootEmpty({ arrows: 0, magic: 0, diamonds: 0, hasCake: true })).toBe(false);
  });
});

describe('pauza (dt=0): timery FSM stoją', () => {
  it('fleeT i digT nie postępują przy dt=0', () => {
    const t = new Thief(800, 272);
    t.steal(bp(), false, 1600);
    const env = flatEnv(1500);
    t.update(DT60, env);
    const fleeT = t.fleeT;
    const x = t.x;
    t.update(0, env);
    expect(t.fleeT).toBe(fleeT);
    expect(t.x).toBe(x);
    t.fleeT = THIEF_BURY_AT + 0.01;
    t.update(DT60, env);                     // dig
    const digT = t.digT;
    t.update(0, env);
    expect(t.digT).toBe(digT);
  });
});

describe('spawner (game.py maybe_spawn_thief — regresja bez zmian)', () => {
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
