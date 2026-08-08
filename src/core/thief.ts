/**
 * Złodziejaszek — port 1:1 algorytmu z aneksu 6.2 / game.py (Thief,
 * Game.maybe_spawn_thief). Deterministyczny (bez RNG).
 *
 * Pozycje w px; kratkowe sprawdzenia kolizji przez floor(px / 16).
 * y = górna kratka (głowa); złodziej ma 1 × 2 kratki jak bohaterka.
 */
import {
  GRAVITY, TILE,
  THIEF_FLEE_MAX, THIEF_FLEE_SPEED, THIEF_JUMP_V, THIEF_LOOT_TTL,
  THIEF_RUN_SPEED, THIEF_SPAWN_DIST, THIEF_SPAWN_TIME,
  THIEF_WARN_TIME, THIEF_WARN_TIME_ECHO,
  SCORE,
} from './balance';

export type ThiefState = 'approach' | 'flee';
export type LootKind = 'cake' | 'arrow' | 'diamond';

export interface Loot {
  kind: LootKind;
  count: number;
}

export interface Backpack {
  arrows: number;
  hasCake: boolean;
  /** diamenty zebrane w tym poziomie (tylko te można ukraść) */
  diamondsLevel: number;
}

export interface ThiefEnv {
  /** szerokość poziomu w px */
  levelWidthPx: number;
  /** kolizje kratkowe (z uszczelnioną ścianą areny, jeśli jest) */
  solidAt(r: number, c: number): boolean;
  /** czy kratka to kaktus */
  isCactus(r: number, c: number): boolean;
  playerX: number;
  playerY: number;
}

export type ThiefEvent =
  | { type: 'stole'; loot: Loot | null; cakeStolen: boolean }
  | { type: 'escaped'; loot: Loot | null }
  | { type: 'caught'; drop: (Loot & { x: number; y: number; ttl: number }) | null; score: number };

const col = (px: number) => Math.floor(px / TILE);
const row = (px: number) => Math.floor(px / TILE);

export class Thief {
  x: number;
  y: number;
  vy = 0;
  state: ThiefState = 'approach';
  loot: Loot | null = null;
  fleeT = 0;
  alive = true;
  dirOut: -1 | 1 = 1;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** zwraca zdarzenia tej klatki (ucieczka poza mapę / timeout) */
  update(dt: number, env: ThiefEnv): ThiefEvent[] {
    const events: ThiefEvent[] = [];
    if (!this.alive) return events;

    let d: -1 | 1;
    let speed: number;
    if (this.state === 'approach') {
      d = env.playerX > this.x ? 1 : -1;
      speed = THIEF_RUN_SPEED;
    } else {
      d = this.dirOut;
      speed = THIEF_FLEE_SPEED;
      this.fleeT += dt;
      if (this.fleeT > THIEF_FLEE_MAX || this.x <= 0
          || this.x >= env.levelWidthPx - TILE) {
        this.alive = false;              // znika z łupem bezpowrotnie
        events.push({ type: 'escaped', loot: this.loot });
        return events;
      }
    }

    // v1: edge = int(nx + 0.999) (dla d>0) / int(nx) (d<0); r = int(y)
    const nx = this.x + d * speed * dt;
    const edge = d > 0 ? col(nx + 0.999 * TILE) : col(nx);
    const r = row(this.y);
    const onGround = env.solidAt(r + 2, col(this.x));
    const blocked = env.solidAt(r + 1, edge) || env.solidAt(r, edge)
      || env.isCactus(r + 1, edge);
    if (blocked && onGround) {
      this.vy = -THIEF_JUMP_V;           // przeskakuje przeszkody ≤ 2 wierszy
    }
    if (!blocked) {
      this.x = Math.max(0, Math.min(nx, env.levelWidthPx - TILE));
    }

    this.vy += GRAVITY * dt;
    let ny = this.y + this.vy * dt;
    // v1: feet = int(ny + 1.999); lądowanie gdy solid(feet) lub feet > 19
    const feet = row(ny + 1.999 * TILE);
    if (this.vy > 0 && (env.solidAt(feet, col(this.x)) || feet > 19)) {
      ny = Math.min(feet, 19) * TILE - 2 * TILE;
      this.vy = 0;
    }
    this.y = ny;
    return events;
  }

  /**
   * Kradzież przy dotknięciu gracza (nie rani!) — priorytet łupu:
   * placek → 3 strzały → 1 diament; Vega (protectedBackpack): najwyżej
   * 1 strzała, nigdy placka ani diamentu. Mutuje plecak.
   */
  steal(backpack: Backpack, protectedBackpack: boolean,
        levelWidthPx: number): ThiefEvent {
    let cakeStolen = false;
    if (!protectedBackpack && backpack.hasCake) {
      this.loot = { kind: 'cake', count: 1 };
      backpack.hasCake = false;
      cakeStolen = true;
    } else if (backpack.arrows > 0) {
      const n = protectedBackpack ? 1 : Math.min(3, backpack.arrows);
      this.loot = { kind: 'arrow', count: n };
      backpack.arrows -= n;
    } else if (!protectedBackpack && backpack.diamondsLevel > 0) {
      this.loot = { kind: 'diamond', count: 1 };
      backpack.diamondsLevel -= 1;
    } else {
      this.loot = null;
    }
    this.state = 'flee';
    this.dirOut = this.x < levelWidthPx / 2 ? -1 : 1;
    return { type: 'stole', loot: this.loot, cakeStolen };
  }

  /** trafiony strzałą lub dotknięty w ucieczce: oddaje łup (+50 pkt) */
  caught(): ThiefEvent {
    this.alive = false;
    const drop = this.loot
      ? { ...this.loot, x: this.x, y: 18 * TILE, ttl: THIEF_LOOT_TTL }
      : null;
    return { type: 'caught', drop, score: SCORE.thief };
  }
}

// ── Spawner (game.py maybe_spawn_thief) ────────────────────────────────────

export interface ThiefSpawnCtx {
  levelTime: number;
  playerX: number;
  /** punkty `T` w px */
  thiefPoints: Array<{ x: number; y: number }>;
  echoPresent: boolean;
  /** THIEF_MAX dla poziomu (0 gdy brak wpisu) */
  limit: number;
  /** cooldown po zniknięciu złodzieja: LEVEL_DEF.thiefCd ?? diff.thiefCd */
  cooldownAfterDespawn: number;
  anyThiefActive: boolean;
}

export interface ThiefSpawn {
  thief: Thief;
  /** czas sygnalizacji `!` na krawędzi ekranu: 1,5 s (z Echo 3 s) */
  warnTime: number;
  /** strona nadejścia względem gracza */
  warnSide: -1 | 1;
}

export class ThiefSpawner {
  spawned = 0;
  cooldown = 0;

  /** wywoływane co klatkę fazy PLATFORM; zwraca spawn albo null */
  update(dt: number, ctx: ThiefSpawnCtx): ThiefSpawn | null {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.spawned >= ctx.limit || ctx.anyThiefActive || this.cooldown > 0) {
      return null;
    }
    for (const pt of ctx.thiefPoints) {
      const near = Math.abs(ctx.playerX - pt.x) < THIEF_SPAWN_DIST;
      if (near || ctx.levelTime > THIEF_SPAWN_TIME) {
        this.spawned += 1;
        return {
          thief: new Thief(pt.x, pt.y - TILE),   // v1: Thief(c, r - 1)
          warnTime: ctx.echoPresent ? THIEF_WARN_TIME_ECHO : THIEF_WARN_TIME,
          warnSide: pt.x > ctx.playerX ? 1 : -1,
        };
      }
    }
    return null;
  }

  /** po zniknięciu złodzieja (złapany albo uciekł) startuje cooldown */
  noteDespawn(ctx: Pick<ThiefSpawnCtx, 'cooldownAfterDespawn'>): void {
    this.cooldown = ctx.cooldownAfterDespawn;
  }

  /** reset poziomu (snapshot — v1: złodziej znika, licznik wraca) */
  reset(): void {
    this.spawned = 0;
    this.cooldown = 0;
  }
}
