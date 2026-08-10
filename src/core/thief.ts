/**
 * Złodziejaszek 2.0 (spec playtest2) — FSM:
 *   approach → flee(sprint) → flee(tired) → dig → kopczyk.
 * Złodziej NIGDY nie opuszcza mapy (zawrotki na krawędziach / przy ścianie
 * areny ≥ 3 wierszy), kradnie CAŁY plecak (kryształy nigdy), a złapany żywy
 * oddaje łup prosto do plecaka (+50, bez dropu i TTL). Po 20 s łącznego flee
 * zakopuje łup w kopczyku (odkopanie 0,8 s = pełny zwrot bez bonusu).
 * Deterministyczny (bez RNG). Spawner bez zmian względem v1.
 *
 * Pozycje w px; kratkowe sprawdzenia kolizji przez floor(px / 16).
 * y = górna kratka (głowa); złodziej ma 1 × 2 kratki jak bohaterka.
 */
import {
  ARROWS_MAX, GRAVITY, MAGIC_MAX, TILE,
  THIEF_BURY_AT, THIEF_DIG_TIME, THIEF_DODGE_DIST, THIEF_EDGE_MARGIN,
  THIEF_FLEE_SPEED, THIEF_JUMP_V, THIEF_MOUND_DIG_TIME, THIEF_RUN_SPEED,
  THIEF_SPAWN_DIST, THIEF_SPAWN_TIME, THIEF_SPRINT_TIME,
  THIEF_STEAL_CAP_SKRZAT, THIEF_STEAL_GRACE, THIEF_TIRED_BOUNCES,
  THIEF_TIRED_SPEED, THIEF_WARN_TIME, THIEF_WARN_TIME_ECHO,
  SCORE,
} from './balance';

export type ThiefState = 'approach' | 'flee' | 'tired' | 'dig';

/** łup = pakiet: cały plecak (kryształy NIGDY — postęp poziomu jest święty) */
export interface Loot {
  arrows: number;
  magic: number;
  diamonds: number;
  hasCake: boolean;
}

export interface Backpack {
  arrows: number;
  /** strzały magiczne (kradzione w pakiecie — spec playtest2) */
  magic: number;
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
  /** zawrotka na krawędzi mapy / przy wysokiej ścianie (obłoczek poślizgu) */
  | { type: 'turned' }
  /** sprint → tired (11 kol/s — obie bohaterki doganiają biegiem) */
  | { type: 'tired' }
  /** start kopania (1,2 s bezbronności) */
  | { type: 'digStart' }
  /** łup zakopany — powstaje kopczyk (bez TTL, leży do końca poziomu) */
  | { type: 'buried'; mound: { x: number; y: number; loot: Loot } }
  /** pusty łup: po THIEF_BURY_AT znika w obłoczku (kopczyk NIE powstaje) */
  | { type: 'vanished' }
  /** złapany żywy: łup wraca prosto do plecaka (bez dropu), +50 pkt */
  | { type: 'caught'; loot: Loot | null; score: number };

const col = (px: number) => Math.floor(px / TILE);
const row = (px: number) => Math.floor(px / TILE);

/** czy łup jest pusty (nic nie ukradziono) */
export function lootEmpty(l: Loot): boolean {
  return l.arrows === 0 && l.magic === 0 && l.diamonds === 0 && !l.hasCake;
}

/** pełny zwrot łupu do plecaka (złapanie / odkopanie kopczyka) — mutuje */
export function returnLoot(loot: Loot, backpack: Backpack): void {
  backpack.arrows = Math.min(ARROWS_MAX, backpack.arrows + loot.arrows);
  backpack.magic = Math.min(MAGIC_MAX, backpack.magic + loot.magic);
  backpack.diamondsLevel += loot.diamonds;
  backpack.hasCake = backpack.hasCake || loot.hasCake;
}

export class Thief {
  x: number;
  y: number;
  vy = 0;
  state: ThiefState = 'approach';
  loot: Loot | null = null;
  /** łączny czas flee (sprint + tired) — po THIEF_BURY_AT zakopuje */
  fleeT = 0;
  /** czas kopania (stan dig) */
  digT = 0;
  /** licznik zawrotek — po THIEF_TIRED_BOUNCES męczy się */
  bounces = 0;
  /** karencja dotyku po kradzieży (kradzież zachodzi w overlapie z graczem) */
  stealGraceT = 0;
  alive = true;
  dirOut: -1 | 1 = 1;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** zwraca zdarzenia tej klatki (zawrotka / zmęczenie / kopanie / kopczyk) */
  update(dt: number, env: ThiefEnv): ThiefEvent[] {
    const events: ThiefEvent[] = [];
    if (!this.alive || dt <= 0) return events;
    this.stealGraceT = Math.max(0, this.stealGraceT - dt);

    if (this.state === 'dig') {
      // kopanie: stoi w miejscu (bezbronny — caught() działa), grawitacja jak niżej
      this.digT += dt;
      if (this.digT >= THIEF_DIG_TIME) {
        this.alive = false;
        if (this.loot && !lootEmpty(this.loot)) {
          events.push({
            type: 'buried',
            mound: { x: this.x, y: this.y + 2 * TILE, loot: this.loot },
          });
          this.loot = null;
        } else {
          events.push({ type: 'vanished' });
        }
        return events;
      }
      this.applyGravity(dt, env);
      return events;
    }

    let d: -1 | 1;
    let speed: number;
    if (this.state === 'approach') {
      d = env.playerX > this.x ? 1 : -1;
      speed = THIEF_RUN_SPEED;
    } else {
      // flee (sprint) / tired
      this.fleeT += dt;
      if (this.state === 'flee'
          && (this.fleeT > THIEF_SPRINT_TIME || this.bounces >= THIEF_TIRED_BOUNCES)) {
        this.state = 'tired';
        events.push({ type: 'tired' });
      }
      if (this.fleeT > THIEF_BURY_AT) {
        if (!this.loot || lootEmpty(this.loot)) {
          // pusty łup: bez kopczyka — znika w obłoczku od razu
          this.alive = false;
          events.push({ type: 'vanished' });
          return events;
        }
        // łup „przepada": 1,2 s kopania (bezbronny), potem kopczyk
        this.state = 'dig';
        this.digT = 0;
        events.push({ type: 'digStart' });
        this.applyGravity(dt, env);
        return events;
      }
      d = this.dirOut;
      speed = this.state === 'tired' ? THIEF_TIRED_SPEED : THIEF_FLEE_SPEED;
    }

    // v1: edge = int(nx + 0.999) (dla d>0) / int(nx) (d<0); r = int(y)
    const nx = this.x + d * speed * dt;
    const edge = d > 0 ? col(nx + 0.999 * TILE) : col(nx);
    const r = row(this.y);
    const onGround = env.solidAt(r + 2, col(this.x));
    const blockedLow = env.solidAt(r + 1, edge) || env.solidAt(r, edge)
      || env.isCactus(r + 1, edge);
    // ściana ≥ 3 wierszy (np. ściana areny `|`): solid także NAD głową
    const highWall = blockedLow && env.solidAt(r - 1, edge);

    if (this.state !== 'approach') {
      // krawędź mapy i wysokie ściany są NIEPRZEKRACZALNE: zawrotka, nie skok
      const atEdge = (d < 0 && nx <= THIEF_EDGE_MARGIN)
        || (d > 0 && nx >= env.levelWidthPx - TILE - THIEF_EDGE_MARGIN);
      if (atEdge || highWall) {
        this.dirOut = (-this.dirOut) as -1 | 1;
        this.bounces += 1;
        events.push({ type: 'turned' });
        this.applyGravity(dt, env);
        return events;
      }
      // unik przy mijaniu: podskok nad głową gracza (deterministyczny);
      // tylko gdy bohaterka na tej samej wysokości — na platformę nie wskakuje
      const dxPlayer = env.playerX - this.x;
      if (Math.abs(dxPlayer) < THIEF_DODGE_DIST && Math.sign(dxPlayer) === d
          && Math.abs(env.playerY - this.y) < 1.5 * TILE
          && onGround && this.vy === 0) {
        this.vy = -THIEF_JUMP_V;
      }
    }

    if (blockedLow && !highWall && onGround) {
      this.vy = -THIEF_JUMP_V;           // przeskakuje przeszkody ≤ 2 wierszy
    }
    if (!blockedLow) {
      this.x = Math.max(0, Math.min(nx, env.levelWidthPx - TILE));
    }

    this.applyGravity(dt, env);
    return events;
  }

  private applyGravity(dt: number, env: ThiefEnv): void {
    this.vy += GRAVITY * dt;
    let ny = this.y + this.vy * dt;
    // v1: feet = int(ny + 1.999); lądowanie gdy solid(feet) lub feet > 19
    const feet = row(ny + 1.999 * TILE);
    if (this.vy > 0 && (env.solidAt(feet, col(this.x)) || feet > 19)) {
      ny = Math.min(feet, 19) * TILE - 2 * TILE;
      this.vy = 0;
    }
    this.y = ny;
  }

  /**
   * Kradzież przy dotknięciu gracza (nie rani!) — CAŁY plecak: placek +
   * wszystkie strzały (zwykłe i magiczne) + diamenty poziomu. Kryształy NIGDY.
   * Vega (protectedBackpack): najwyżej 1 zwykła strzała. Tryb Skrzat: najwyżej
   * 3 zwykłe strzały. Mutuje plecak.
   */
  steal(backpack: Backpack, protectedBackpack: boolean,
        levelWidthPx: number, skrzat = false): ThiefEvent {
    let loot: Loot;
    if (protectedBackpack) {
      const n = Math.min(1, backpack.arrows);
      loot = { arrows: n, magic: 0, diamonds: 0, hasCake: false };
      backpack.arrows -= n;
    } else if (skrzat) {
      const n = Math.min(THIEF_STEAL_CAP_SKRZAT, backpack.arrows);
      loot = { arrows: n, magic: 0, diamonds: 0, hasCake: false };
      backpack.arrows -= n;
    } else {
      loot = {
        arrows: backpack.arrows,
        magic: backpack.magic,
        diamonds: backpack.diamondsLevel,
        hasCake: backpack.hasCake,
      };
      backpack.arrows = 0;
      backpack.magic = 0;
      backpack.diamondsLevel = 0;
      backpack.hasCake = false;
    }
    const cakeStolen = loot.hasCake;
    this.loot = lootEmpty(loot) ? null : loot;
    this.state = 'flee';
    this.fleeT = 0;
    this.bounces = 0;
    this.stealGraceT = THIEF_STEAL_GRACE;
    this.dirOut = this.x < levelWidthPx / 2 ? -1 : 1;
    return { type: 'stole', loot: this.loot, cakeStolen };
  }

  /** czy dotknięcie łapie złodzieja (strzała łapie zawsze — bez karencji) */
  catchableByTouch(): boolean {
    return this.alive && this.state !== 'approach' && this.stealGraceT <= 0;
  }

  /** trafiony strzałą lub dotknięty w ucieczce/kopaniu: łup wraca prosto do
   *  plecaka (caller woła returnLoot) + 50 pkt — bez dropu na ziemi */
  caught(): ThiefEvent {
    this.alive = false;
    const loot = this.loot;
    this.loot = null;
    return { type: 'caught', loot, score: SCORE.thief };
  }
}

// ── Kopczyk (spec playtest2) — leży DO KOŃCA POZIOMU, bez TTL ──────────────

export class Mound {
  readonly x: number;
  /** px stóp (dolna krawędź kopczyka = grunt, na którym kopał złodziej) */
  readonly y: number;
  readonly loot: Loot;
  /** postęp odkopywania 0..THIEF_MOUND_DIG_TIME */
  t = 0;
  dug = false;

  constructor(x: number, y: number, loot: Loot) {
    this.x = x;
    this.y = y;
    this.loot = loot;
  }

  /**
   * Co klatkę: playerOn = gracz stoi na kopczyku. 0,8 s ciągłego stania →
   * true (pełny zwrot łupu, bez +50). Zejście z kopczyka zeruje postęp.
   */
  update(dt: number, playerOn: boolean): boolean {
    if (this.dug) return false;
    if (!playerOn) {
      this.t = 0;
      return false;
    }
    this.t += dt;
    if (this.t >= THIEF_MOUND_DIG_TIME) {
      this.dug = true;
      return true;
    }
    return false;
  }

  progress(): number {
    return Math.max(0, Math.min(1, this.t / THIEF_MOUND_DIG_TIME));
  }
}

// ── Spawner (game.py maybe_spawn_thief) — bez zmian względem v1 ────────────

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

  /** po zniknięciu złodzieja (złapany / kopczyk / zniknął) startuje cooldown */
  noteDespawn(ctx: Pick<ThiefSpawnCtx, 'cooldownAfterDespawn'>): void {
    this.cooldown = ctx.cooldownAfterDespawn;
  }

  /** reset poziomu (snapshot — v1: złodziej znika, licznik wraca) */
  reset(): void {
    this.spawned = 0;
    this.cooldown = 0;
  }
}
