/**
 * Mała symulacja ruchu gracza w stylu Arcade (semi-implicit Euler, dt = 1/60).
 * Używana przez testy fizyki (coyote, jump buffer, kalibracja skoku) oraz
 * bota runnera — scena Phasera ma mieć TE SAME parametry (balance.ts).
 *
 * Port zachowań z game.py Player.physics + common_input:
 *  - skok/coyote/buffer — aneks 8.2 (obowiązkowe),
 *  - kucanie/ślizg zmienia wysokość 2 kratki → 1 kratka (głowa idzie w dół).
 */
import {
  COYOTE_TIME, GRAVITY, JUMP_BUFFER, MAX_FALL,
  PLAYER_H, PLAYER_H_CROUCH,
} from './balance';

export interface SimChar {
  /** px/s */
  speed: number;
  /** px/s (skalibrowane testem tests/jump.test.ts) */
  jumpV0: number;
}

export interface SimState {
  x: number;
  /** y górnej krawędzi (głowy); stopy = y + h */
  y: number;
  vx: number;
  vy: number;
  /** wysokość px: 32 lub 16 w kucnięciu */
  h: number;
  crouch: boolean;
  onGround: boolean;
  coyote: number;
  jumpBuf: number;
}

export interface SimInput {
  move: -1 | 0 | 1;
  /** edge-triggered — świeże wciśnięcie w tej klatce (JustDown) */
  jumpPressed: boolean;
  /** trzymanie ↓ (kucanie / ślizg) */
  down: boolean;
}

export interface SimEnv {
  /**
   * y podłogi (górna krawędź gruntu) pod pozycją x albo null nad dziurą.
   * Prosty model płaskiej podłogi wystarcza testom fizyki i runnerowi.
   */
  groundYAt(x: number): number | null;
  /** czy nad głową jest miejsce na wstanie z kucania (domyślnie tak) */
  ceilingFree?(s: SimState): boolean;
}

export function createSim(x: number, y: number): SimState {
  return {
    x, y, vx: 0, vy: 0, h: PLAYER_H,
    crouch: false, onGround: false, coyote: 0, jumpBuf: 0,
  };
}

function doJump(s: SimState, char: SimChar): void {
  s.vy = -char.jumpV0;
  s.onGround = false;
  s.coyote = 0;
  s.jumpBuf = 0;
}

function setCrouch(s: SimState, want: boolean, env: SimEnv): void {
  if (want === s.crouch) return;
  if (want) {
    s.y += PLAYER_H - PLAYER_H_CROUCH;   // v1: y += 1 wiersz
    s.h = PLAYER_H_CROUCH;
    s.crouch = true;
  } else if (!env.ceilingFree || env.ceilingFree(s)) {
    s.y -= PLAYER_H - PLAYER_H_CROUCH;
    s.h = PLAYER_H;
    s.crouch = false;
  }
}

/** jedna klatka symulacji; mutuje stan */
export function simStep(
  s: SimState, input: SimInput, char: SimChar, env: SimEnv, dt: number,
): void {
  // kucanie tylko na ziemi (v1 common_input)
  setCrouch(s, input.down && s.onGround, env);

  // skok: edge + coyote + buffer (v1 common_input)
  if (input.jumpPressed) {
    s.jumpBuf = JUMP_BUFFER;
    if (s.onGround || s.coyote > 0) doJump(s, char);
  }

  // oś X
  s.vx = input.move * char.speed;
  s.x += s.vx * dt;

  // oś Y — semi-implicit Euler (styl Arcade)
  s.vy = Math.min(s.vy + GRAVITY * dt, MAX_FALL);
  s.y += s.vy * dt;

  const wasGround = s.onGround;
  s.onGround = false;
  const gy = env.groundYAt(s.x);
  if (gy !== null && s.vy >= 0 && s.y + s.h >= gy) {
    s.y = gy - s.h;
    s.vy = 0;
    s.onGround = true;
  }

  // coyote + bufor skoku (v1 Player.physics)
  if (s.onGround) {
    s.coyote = COYOTE_TIME;
    if (s.jumpBuf > 0) doJump(s, char);
  } else {
    if (wasGround && s.vy >= 0) s.coyote = COYOTE_TIME;
    s.coyote = Math.max(0, s.coyote - dt);
  }
  s.jumpBuf = Math.max(0, s.jumpBuf - dt);
}

/**
 * Pomiar wysokości skoku: skok z płaskiej podłogi, zwraca apex w px.
 * Test kalibracyjny (tests/jump.test.ts) trzyma tym pomiarem JUMP_V0 w ryzach.
 */
export function measureJumpApex(char: SimChar, dt: number): number {
  const floorY = 304;
  const env: SimEnv = { groundYAt: () => floorY };
  const s = createSim(0, floorY - PLAYER_H);
  s.onGround = true;
  const startY = s.y;
  simStep(s, { move: 0, jumpPressed: true, down: false }, char, env, dt);
  let minY = s.y;
  for (let i = 0; i < 600 && !s.onGround; i++) {
    simStep(s, { move: 0, jumpPressed: false, down: false }, char, env, dt);
    minY = Math.min(minY, s.y);
  }
  return startY - minY;
}
