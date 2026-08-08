/**
 * Fizyka gracza: coyote 0,10 s i jump buffer 0,15 s (aneks 8.2, obowiązkowe),
 * kucanie/ślizg, clamp prędkości spadania.
 */
import { describe, expect, it } from 'vitest';
import {
  CHARACTERS, DT60, MAX_FALL, PLAYER_H, PLAYER_H_CROUCH,
} from '../src/core/balance';
import { createSim, SimEnv, simStep } from '../src/core/physicsSim';

const TOSIA = CHARACTERS.TOSIA;
const FLOOR = 304;
const flat: SimEnv = { groundYAt: () => FLOOR };
const idle = { move: 0 as const, jumpPressed: false, down: false };

function grounded(x = 0) {
  const s = createSim(x, FLOOR - PLAYER_H);
  s.onGround = true;
  return s;
}

/** podłoga z krawędzią: grunt tylko dla x < edgeX */
function ledge(edgeX: number): SimEnv {
  return { groundYAt: (x) => (x < edgeX ? FLOOR : null) };
}

describe('coyote time', () => {
  it('skok do 0,10 s po zejściu z krawędzi wykonuje się', () => {
    const env = ledge(160);
    const s = grounded(100);
    // biegnij w prawo aż zejdziesz z krawędzi
    while (s.onGround) simStep(s, { ...idle, move: 1 }, TOSIA, env, DT60);
    // 4 klatki spadania = 0,067 s < 0,10 s
    for (let i = 0; i < 4; i++) simStep(s, idle, TOSIA, env, DT60);
    expect(s.onGround).toBe(false);
    simStep(s, { ...idle, jumpPressed: true }, TOSIA, env, DT60);
    expect(s.vy).toBeLessThan(0);   // skok wykonany w powietrzu
  });

  it('po upływie okna coyote skok w powietrzu nie działa', () => {
    const env = ledge(160);
    const s = grounded(100);
    while (s.onGround) simStep(s, { ...idle, move: 1 }, TOSIA, env, DT60);
    // 8 klatek = 0,133 s > 0,10 s
    for (let i = 0; i < 8; i++) simStep(s, idle, TOSIA, env, DT60);
    simStep(s, { ...idle, jumpPressed: true }, TOSIA, env, DT60);
    expect(s.vy).toBeGreaterThan(0);   // nadal spada
  });
});

describe('jump buffer', () => {
  it('skok wciśnięty tuż przed lądowaniem wykonuje się przy lądowaniu', () => {
    const s = grounded();
    simStep(s, { ...idle, jumpPressed: true }, TOSIA, flat, DT60);
    expect(s.vy).toBeLessThan(0);
    // leć aż do ostatniej fazy opadania (tuż nad ziemią)
    while (!(s.vy > 0 && FLOOR - (s.y + s.h) < 30)) {
      simStep(s, idle, TOSIA, flat, DT60);
    }
    expect(s.onGround).toBe(false);
    simStep(s, { ...idle, jumpPressed: true }, TOSIA, flat, DT60); // bufor
    // w ciągu 0,15 s ma nastąpić lądowanie + automatyczny skok
    let jumped = false;
    for (let i = 0; i < 9 && !jumped; i++) {
      simStep(s, idle, TOSIA, flat, DT60);
      jumped = s.vy < -200;
    }
    expect(jumped).toBe(true);
  });

  it('bufor wygasa po 0,15 s', () => {
    const s = grounded();
    s.jumpBuf = 0.15;
    for (let i = 0; i < 12; i++) simStep(s, idle, TOSIA, flat, DT60);
    expect(s.jumpBuf).toBe(0);
  });
});

describe('kucanie / ślizg', () => {
  it('kucanie zmienia wysokość 32 → 16 px (głowa idzie w dół)', () => {
    const s = grounded();
    const headY = s.y;
    simStep(s, { ...idle, down: true }, TOSIA, flat, DT60);
    expect(s.h).toBe(PLAYER_H_CROUCH);
    expect(s.y).toBeGreaterThan(headY);
    simStep(s, idle, TOSIA, flat, DT60);
    expect(s.h).toBe(PLAYER_H);
  });

  it('kucanie działa tylko na ziemi', () => {
    const s = grounded();
    simStep(s, { ...idle, jumpPressed: true }, TOSIA, flat, DT60);
    simStep(s, { ...idle, down: true }, TOSIA, flat, DT60);
    expect(s.h).toBe(PLAYER_H);
  });
});

describe('spadanie', () => {
  it('prędkość spadania nie przekracza MAX_FALL (400 px/s)', () => {
    const env: SimEnv = { groundYAt: () => null };
    const s = createSim(0, 0);
    for (let i = 0; i < 120; i++) simStep(s, idle, TOSIA, env, DT60);
    expect(s.vy).toBe(MAX_FALL);
  });
});
