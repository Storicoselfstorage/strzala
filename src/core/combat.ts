/**
 * Walka ze smokiem (arena) — port 1:1 z game.py (Dragon, Game.update_arena,
 * Game.update_shield / shield_break / spawn_shield_wave / arena_restart)
 * wg aneksu 8.4. Pozycje w px (1 kratka = 16 px); w komentarzach oryginalne
 * wartości kratkowe v1.
 *
 * Sceny Phasera renderują stan i wykrywają kolizje z graczem; cała decyzyjna
 * logika (FSM, telegrafy, tarcza, timer ucieczki, fazy bossa) jest tutaj.
 */
import {
  ARENA_W, BOSS_SHIELD_RESPAWN, BOSS_SHIELD_RESPAWN_P3,
  DIFFICULTY, DifficultyId, DRAGON_COOLDOWN, DRAGON_FLEE_ANIM,
  DRAGON_FLEE_WARN, DRAGON_H, DRAGON_IDLE, DRAGON_PATROL_SPEED, DRAGON_W,
  SHIELD_DOWN_TIME, SHIELD_RESPAWN_DELAY, SHIELD_STUN_TIME, TILE,
} from './balance';
import { DragonId, DRAGONS, DragonPattern } from '../data/levels';

export type DragonState =
  | 'IDLE' | 'TELEGRAPH' | 'ATTACK' | 'COOLDOWN' | 'STUNNED'
  | 'CHARGE' | 'FLEE' | 'DYING' | 'GONE';

export type TelegraphKind = 'fire' | 'flame' | 'boulder' | 'fire2' | 'charge';

export interface Fireball {
  x: number; y: number; vx: number; vy: number;
  grav: boolean; alive: boolean;
}
export interface Shockwave { x: number; dir: -1 | 1; alive: boolean }
export interface FlameWave { x: number; dir: -1 | 1; alive: boolean }
/** zionięcie Piry: pas ziemi (kratki c0..c1) płonie 1,0 s */
export interface GroundFlame { c0: number; c1: number; ttl: number; alive: boolean }
export interface BossBoulder { x: number; y: number; vy: number; alive: boolean }

export type CombatEvent =
  | { type: 'telegraph'; kind: TelegraphKind }
  | { type: 'attack'; kind: TelegraphKind }
  | { type: 'stunned' }
  | { type: 'phase'; phase: 2 | 3 }
  | { type: 'shieldWave' }
  | { type: 'shieldDown' }
  | { type: 'shieldUp' }
  | { type: 'fleeWarning' }
  | { type: 'fleeStart' }
  | { type: 'fled' }
  | { type: 'dying' }
  | { type: 'defeated' }
  | { type: 'deflect'; x: number; y: number }
  | { type: 'hit'; dmg: number; hp: number };

export interface ShieldPickup { x: number; y: number; alive: boolean }

interface DragonCtx {
  playerX: number;
  playerY: number;
  telegraphTime: number;
  fireballSpeed: number;
  arena: { x0: number; x1: number };
  sink: {
    fireball(x: number, y: number, vx: number, vy?: number, grav?: boolean): Fireball;
    groundFlame(c0: number, c1: number): void;
    flameWave(x: number, dir: -1 | 1): void;
    bossBoulder(x: number): void;
    shockwave(x: number, dir: -1 | 1): void;
  };
}

export class Dragon {
  readonly id: DragonId;
  readonly name: string;
  readonly pattern: DragonPattern;
  readonly hasShield: boolean;
  readonly maxHp: number;
  hp: number;
  shieldUp: boolean;
  x: number;
  y: number;
  readonly w = DRAGON_W;   // 6 kratek
  readonly h = DRAGON_H;   // 3 kratki
  state: DragonState = 'IDLE';
  t = DRAGON_IDLE;
  dir: -1 | 1 = -1;
  bob = 0;
  /** pociski bieżącego ataku — ATTACK trwa do ich zniknięcia (v1 shots) */
  shots: Fireball[] = [];
  /** słaby punkt bossa po szarży (magiczna ×2) */
  weak = 0;
  phase: 1 | 2 | 3 = 1;
  atkA = 3.0;
  atkB = 10.0;
  chargeFrom = 0;
  fled = false;
  telegraphKind: TelegraphKind = 'fire';
  private readonly arena: { x0: number; x1: number };

  constructor(id: DragonId, diff: DifficultyId, arena: { x0: number; x1: number }) {
    const d = DRAGONS[id];
    this.id = id;
    this.name = d.name;
    this.pattern = d.pattern;
    this.hasShield = d.shield;
    this.maxHp = d.hp[diff];
    this.hp = this.maxHp;
    this.shieldUp = d.shield;
    this.arena = arena;
    this.x = arena.x1 - 20 * TILE;   // v1: arena[1] − 20 kolumn
    this.y = 12 * TILE;
  }

  bossPhase(): 1 | 2 | 3 {
    if (this.hp * 3 > this.maxHp * 2) return 1;
    if (this.hp * 3 > this.maxHp) return 2;
    return 3;
  }

  aliveFighting(): boolean {
    return this.state !== 'DYING' && this.state !== 'GONE' && this.state !== 'FLEE';
  }

  rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  private patrol(dt: number): void {
    this.bob += dt;
    const { x0, x1 } = this.arena;
    this.x += this.dir * DRAGON_PATROL_SPEED * dt;
    if (this.x < x0 + 3 * TILE) this.dir = 1;
    if (this.x > x1 - 9 * TILE) this.dir = -1;
    this.y = 13 * TILE + 2 * TILE * Math.sin(this.bob * 1.1);
  }

  update(dt: number, ctx: DragonCtx): CombatEvent[] {
    const ev: CombatEvent[] = [];
    this.weak = Math.max(0, this.weak - dt);
    this.shots = this.shots.filter((s) => s.alive);
    if (this.pattern === 'boss') {
      this.updateBoss(dt, ctx, ev);
      return ev;
    }
    this.t -= dt;
    if (this.state === 'IDLE') {
      this.patrol(dt);
      if (this.t <= 0) {
        this.state = 'TELEGRAPH';
        this.t = ctx.telegraphTime;
        ev.push({ type: 'telegraph', kind: this.telegraphKind });
      }
    } else if (this.state === 'TELEGRAPH') {
      if (this.t <= 0) {
        this.attack(ctx, ev);
        this.state = 'ATTACK';
      }
    } else if (this.state === 'ATTACK') {
      if (this.shots.length === 0) {
        this.state = 'COOLDOWN';
        this.t = DRAGON_COOLDOWN;
      }
    } else if (this.state === 'COOLDOWN') {
      this.patrol(dt);
      if (this.t <= 0) {
        this.state = 'IDLE';
        this.t = DRAGON_IDLE;
      }
    } else if (this.state === 'STUNNED') {
      // v1: opada nisko — y += (15 − y)·min(1, 4·dt) wierszy
      this.y += (15 * TILE - this.y) * Math.min(1, 4 * dt);
      if (this.t <= 0) {
        this.state = 'IDLE';
        this.t = DRAGON_IDLE;
      }
    } else if (this.state === 'FLEE') {
      this.y -= 8 * TILE * dt;   // odlatuje 8 w/s
      if (this.t <= 0) {
        this.state = 'GONE';
        ev.push({ type: 'fled' });
      }
    } else if (this.state === 'DYING') {
      if (this.t <= 0) {
        this.state = 'GONE';
        ev.push({ type: 'defeated' });
      }
    }
    return ev;
  }

  /** pociski celują w pozycję gracza z chwili końca telegrafu (aneks 8.4.1) */
  private attack(ctx: DragonCtx, ev: CombatEvent[]): void {
    const speed = ctx.fireballSpeed;
    const mouthX = this.x + (ctx.playerX < this.x ? 0 : this.w);
    const d = ctx.playerX > this.x ? 1 : -1;
    let rows = [ctx.playerY];
    if (this.pattern === 'double') {
      rows = [ctx.playerY, ctx.playerY - 2 * TILE];  // kucnięcie albo wysoki skok
    }
    if (this.pattern === 'pira' && this.atkA % 2 < 1) {
      // zionięcie: pas ziemi 8 kolumn płonie 1,0 s (v1: c0..c0+8)
      const pc = ctx.playerX / TILE;
      const a0 = this.arena.x0 / TILE;
      const a1 = this.arena.x1 / TILE;
      const c0 = Math.floor(Math.max(a0, Math.min(pc - 4, a1 - 8)));
      ctx.sink.groundFlame(c0, c0 + 8);
      this.atkA += 1;
      ev.push({ type: 'attack', kind: 'flame' });
      return;
    }
    this.atkA += 1;
    for (const r of rows) {
      this.shots.push(ctx.sink.fireball(mouthX, r + 0.5 * TILE, speed * d));
    }
    ev.push({ type: 'attack', kind: 'fire' });
  }

  // — Obsydian (aneks 8.4.3) —
  private updateBoss(dt: number, ctx: DragonCtx, ev: CombatEvent[]): void {
    const ph = this.bossPhase();
    if (ph !== this.phase) {
      this.phase = ph;
      ev.push({ type: 'phase', phase: ph as 2 | 3 });
      this.atkA = this.atkB = 2.0;
      this.state = 'IDLE';
    }
    const mult = ph === 3 ? 0.7 : 1.0;   // faza 3 „Furia": cooldowny ×0,7
    const { x0, x1 } = this.arena;
    if (this.state === 'DYING') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'GONE';
        ev.push({ type: 'defeated' });
      }
      return;
    }
    if (this.state === 'STUNNED') {
      this.t -= dt;
      this.y += (15 * TILE - this.y) * Math.min(1, 4 * dt);
      if (this.t <= 0) this.state = 'IDLE';
      return;
    }
    if (this.state === 'TELEGRAPH') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'IDLE';
        if (this.telegraphKind === 'flame') {
          const d: -1 | 1 = this.x > (x0 + x1) / 2 ? -1 : 1;
          ctx.sink.flameWave(this.x + 3 * TILE, d);
        } else if (this.telegraphKind === 'boulder') {
          ctx.sink.bossBoulder(
            Math.max(x0 + TILE, Math.min(ctx.playerX, x1 - TILE)));
        } else if (this.telegraphKind === 'fire2') {
          for (const dx of [-6 * TILE, 6 * TILE]) {
            // v1: vx = clamp((p.x − x)/2 + dx, −18, 18) kol/s
            const vx = Math.max(-18 * TILE,
              Math.min((ctx.playerX - this.x) / 2 + dx, 18 * TILE));
            ctx.sink.fireball(this.x + 3 * TILE, this.y + TILE, vx,
              -8 * TILE, true);
          }
        } else if (this.telegraphKind === 'charge') {
          this.state = 'CHARGE';
          this.chargeFrom = this.x;
        }
        ev.push({ type: 'attack', kind: this.telegraphKind });
      }
      return;
    }
    if (this.state === 'CHARGE') {
      const d = this.chargeFrom < (x0 + x1) / 2 ? 1 : -1;
      this.x += 20 * TILE * d * dt;   // szarża 20 kol/s
      this.y = 15 * TILE;
      if (this.x <= x0 + 2 * TILE || this.x >= x1 - 8 * TILE) {
        this.x = Math.max(x0 + 2 * TILE, Math.min(this.x, x1 - 8 * TILE));
        this.state = 'IDLE';
        this.weak = 2.0;   // dyszy, słaby punkt ♦ (magiczna ×2)
        ctx.sink.shockwave(this.x + 3 * TILE, 1);
        ctx.sink.shockwave(this.x + 3 * TILE, -1);
      }
      return;
    }
    // ruch bazowy per faza
    if (ph === 1) {
      this.x += (x1 - 26 * TILE - this.x) * Math.min(1, 2 * dt);
      this.y = 14 * TILE + Math.sin(this.bob * 2) * 0.5 * TILE;
      this.bob += dt;
    } else if (ph === 2) {
      this.bob += dt;
      this.x += this.dir * 10 * TILE * dt;   // lot 10 kol/s
      if (this.x < x0 + 3 * TILE) this.dir = 1;
      if (this.x > x1 - 9 * TILE) this.dir = -1;
      // sinusoida: amplituda 4 wiersze, okres 3 s
      this.y = 8 * TILE + 4 * TILE * Math.sin((this.bob * 2 * Math.PI) / 3);
    } else {
      this.y = 15 * TILE;
    }
    // ataki per faza
    if (this.weak > 0) return;
    this.atkA -= dt;
    this.atkB -= dt;
    let tele = 0;
    if (ph === 1) {
      if (this.atkA <= 0) {
        this.telegraphKind = 'flame'; tele = 1.2;
        this.atkA = 3.0 * mult;
      } else if (this.atkB <= 0) {
        this.telegraphKind = 'boulder'; tele = 0.8;
        this.atkB = 10.0 * mult;
      }
    } else if (ph === 2) {
      if (this.atkA <= 0) {
        this.telegraphKind = 'fire2'; tele = 1.0;
        this.atkA = 2.5 * mult;
      }
    } else {
      if (this.atkA <= 0) {
        this.telegraphKind = 'charge'; tele = 1.2;
        this.atkA = 4.0 * mult;
      }
    }
    if (tele) {
      this.state = 'TELEGRAPH';
      this.t = tele;
      ev.push({ type: 'telegraph', kind: this.telegraphKind });
    }
  }

  /** trafienie strzałą; zwraca zdarzenia (deflect / hit / dying) */
  takeHit(dmg: number, magic: boolean): CombatEvent[] {
    if (!this.aliveFighting()) return [];
    if (this.shieldUp && !magic) {
      return [{ type: 'deflect', x: this.x + 3 * TILE, y: this.y + TILE }];
    }
    let d = dmg;
    if (this.weak > 0 && magic) d *= 2;   // słaby punkt: magiczna podwójnie
    this.hp = Math.max(0, this.hp - d);
    const ev: CombatEvent[] = [{ type: 'hit', dmg: d, hp: this.hp }];
    if (this.hp <= 0) {
      this.state = 'DYING';
      this.t = 1.5;   // animacja 1,5 s (aneks 6.5)
      ev.push({ type: 'dying' });
    }
    return ev;
  }

  startFlee(): void {
    this.state = 'FLEE';
    this.t = DRAGON_FLEE_ANIM;
    this.fled = true;
  }
}

// ── Arena: tarcza + timer ucieczki + pociski + checkpoint ──────────────────

export interface ArenaOptions {
  /** HP zachowane z poprzedniej próby (checkpoint — aneks 8.4.4) */
  initialHp?: number;
  /** pozycja `S` z mapy (px) */
  spawnPos?: { x: number; y: number };
}

export function arenaRect(arenaX0Px: number): { x0: number; x1: number } {
  // v1: arena_rect = (ax, ax + 79) w kolumnach
  return { x0: arenaX0Px, x1: arenaX0Px + ARENA_W - TILE };
}

export class ArenaCombat {
  readonly dragon: Dragon;
  readonly rect: { x0: number; x1: number };
  private readonly diff: DifficultyId;
  private readonly oPoints: ReadonlyArray<{ x: number; y: number }>;
  fireballs: Fireball[] = [];
  shocks: Shockwave[] = [];
  flamewaves: FlameWave[] = [];
  flames: GroundFlame[] = [];
  bossBoulders: BossBoulder[] = [];
  shieldPickups: ShieldPickup[] = [];
  arenaTime = 0;
  fleeWarned = false;
  private shieldTimer = 0;
  private waveDelay = 0;

  constructor(
    dragonId: DragonId, diff: DifficultyId, arenaX0Px: number,
    oPointsPx: ReadonlyArray<{ x: number; y: number }>, opts: ArenaOptions = {},
  ) {
    this.diff = diff;
    this.rect = arenaRect(arenaX0Px);
    this.oPoints = oPointsPx;
    this.dragon = new Dragon(dragonId, diff, this.rect);
    if (opts.initialHp !== undefined) this.dragon.hp = opts.initialHp;
    if (opts.spawnPos) {
      this.dragon.x = opts.spawnPos.x;
      this.dragon.y = opts.spawnPos.y;
    }
    this.spawnShieldWave();
  }

  private get sink(): DragonCtx['sink'] {
    return {
      fireball: (x, y, vx, vy = 0, grav = false) => {
        const fb: Fireball = { x, y, vx, vy, grav, alive: true };
        this.fireballs.push(fb);
        return fb;
      },
      groundFlame: (c0, c1) => this.flames.push({ c0, c1, ttl: 1.0, alive: true }),
      flameWave: (x, dir) => this.flamewaves.push({ x, dir, alive: true }),
      bossBoulder: (x) => this.bossBoulders.push({ x, y: 2 * TILE, vy: 20 * TILE, alive: true }),
      shockwave: (x, dir) => this.shocks.push({ x, dir, alive: true }),
    };
  }

  update(dt: number, playerX: number, playerY: number): CombatEvent[] {
    const d = this.dragon;
    const settings = DIFFICULTY[this.diff];
    const ev = d.update(dt, {
      playerX, playerY,
      telegraphTime: settings.telegraph,
      fireballSpeed: settings.fireballSpeed,
      arena: this.rect,
      sink: this.sink,
    });
    if (ev.some((e) => e.type === 'fled')) this.shieldPickups = [];

    // timer ucieczki — wszyscy poza Obsydianem (aneks 8.4.4)
    if (d.pattern !== 'boss' && d.aliveFighting()) {
      this.arenaTime += dt;
      const lim = settings.dragonFlee;
      if (lim - this.arenaTime <= DRAGON_FLEE_WARN && !this.fleeWarned) {
        this.fleeWarned = true;
        ev.push({ type: 'fleeWarning' });
      }
      if (this.arenaTime >= lim && d.state !== 'FLEE' && d.state !== 'DYING') {
        d.startFlee();
        ev.push({ type: 'fleeStart' });
      }
    }

    this.updateShield(dt, ev);
    this.updateProjectiles(dt);
    return ev;
  }

  private updateProjectiles(dt: number): void {
    const { x0, x1 } = this.rect;
    for (const fb of this.fireballs) {
      fb.x += fb.vx * dt;
      if (fb.grav) fb.vy += 25 * TILE * dt;   // v1: 25 w/s²
      fb.y += fb.vy * dt;
      // v1 (z priorytetem operatorów Pythona): poza areną ±2 kol LUB y ≥ 18,6 w
      if (fb.x < x0 - 2 * TILE || fb.x > x1 + 2 * TILE || fb.y >= 18.6 * TILE) {
        fb.alive = false;
      }
    }
    for (const s of this.shocks) {
      s.x += 20 * TILE * s.dir * dt;
      if (s.x < x0 || s.x > x1) s.alive = false;
    }
    for (const fw of this.flamewaves) {
      fw.x += 20 * TILE * fw.dir * dt;
      if (fw.x < x0 || fw.x > x1) fw.alive = false;
    }
    for (const fl of this.flames) {
      fl.ttl -= dt;
      if (fl.ttl <= 0) fl.alive = false;
    }
    for (const bb of this.bossBoulders) {
      bb.y += bb.vy * dt;
      if (bb.y >= 18 * TILE) bb.alive = false;
    }
    this.fireballs = this.fireballs.filter((p) => p.alive);
    this.shocks = this.shocks.filter((p) => p.alive);
    this.flamewaves = this.flamewaves.filter((p) => p.alive);
    this.flames = this.flames.filter((p) => p.alive);
    this.bossBoulders = this.bossBoulders.filter((p) => p.alive);
  }

  // — tarcza (aneks 8.4.2) —
  private spawnShieldWave(): void {
    this.shieldPickups = [];
    if (!this.dragon.shieldUp || this.oPoints.length === 0) return;
    for (const o of this.oPoints) {
      this.shieldPickups.push({ x: o.x, y: o.y, alive: true });
    }
  }

  /**
   * Zbieranie kryształów tarczowych (scena woła przy nachodzeniu gracza).
   * Zebranie WSZYSTKICH → tarcza pada na 8 s, smok STUNNED 2 s.
   * Kryształy tarczowe punktują (+10), ale nie ładują strzał magicznych.
   */
  collectShieldPickup(index: number): CombatEvent[] {
    const pk = this.shieldPickups[index];
    if (!pk || !pk.alive) return [];
    pk.alive = false;
    const ev: CombatEvent[] = [];
    if (this.shieldPickups.every((p) => !p.alive) && this.dragon.shieldUp) {
      this.shieldPickups = [];
      this.shieldBreak(ev);
    }
    return ev;
  }

  private shieldBreak(ev: CombatEvent[]): void {
    const d = this.dragon;
    d.shieldUp = false;
    this.shieldTimer = SHIELD_DOWN_TIME;
    ev.push({ type: 'shieldDown' });
    if (d.aliveFighting() && d.state !== 'CHARGE') {
      d.state = 'STUNNED';
      d.t = SHIELD_STUN_TIME;
      ev.push({ type: 'stunned' });
    }
  }

  private updateShield(dt: number, ev: CombatEvent[]): void {
    const d = this.dragon;
    if (!d.hasShield || !d.aliveFighting()) return;
    if (!d.shieldUp) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        d.shieldUp = true;
        ev.push({ type: 'shieldUp' });
        this.waveDelay = d.pattern === 'boss'
          ? (d.phase === 3 ? BOSS_SHIELD_RESPAWN_P3 : BOSS_SHIELD_RESPAWN)
          : SHIELD_RESPAWN_DELAY;
      }
      return;
    }
    if (this.shieldPickups.length === 0) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.spawnShieldWave();
        if (this.shieldPickups.length > 0) ev.push({ type: 'shieldWave' });
      }
    }
  }

  /**
   * Trafienie strzałą gracza w smoka (v1 update_arena, pad tarczy 1 kratka).
   * Zwraca [] gdy pudło; przy trafieniu/odbiciu strzała ginie (caller).
   */
  tryArrowHit(x: number, y: number, dmg: number, magic: boolean): CombatEvent[] {
    const d = this.dragon;
    if (!d.aliveFighting()) return [];
    const pad = d.shieldUp ? TILE : 0;
    const inX = d.x - pad <= x && x <= d.x + d.w + pad;
    const inY = d.y - 0.5 * TILE <= y && y <= d.y + d.h;
    if (!inX || !inY) return [];
    return d.takeHit(dmg, magic);
  }

  /**
   * Restart od checkpointu areny (v1 arena_restart): HP smoka zachowane,
   * FSM wraca do IDLE, tarcza wraca, pociski znikają, timer ucieczki od nowa.
   */
  restart(): void {
    this.fireballs = [];
    this.shocks = [];
    this.flamewaves = [];
    this.flames = [];
    this.bossBoulders = [];
    this.arenaTime = 0;
    const d = this.dragon;
    if (d.aliveFighting()) {
      d.state = 'IDLE';
      d.t = DRAGON_IDLE;
      d.shots = [];
      d.shieldUp = d.hasShield;
      this.spawnShieldWave();
    }
  }
}
