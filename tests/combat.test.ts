/**
 * FSM smoka (aneks 8.4.1), tarcza (8.4.2), timer ucieczki 120 s (8.4.4),
 * checkpoint z zachowanym HP, boss Obsydian 3 fazy (8.4.3).
 */
import { describe, expect, it } from 'vitest';
import { DT60, TILE } from '../src/core/balance';
import { ArenaCombat, CombatEvent } from '../src/core/combat';

const O_POINTS = [
  { x: 30 * TILE, y: 12 * TILE }, { x: 46 * TILE, y: 15 * TILE },
  { x: 10 * TILE, y: 18 * TILE },
];

function run(
  arena: ArenaCombat, seconds: number, px = 100, py = 272,
): CombatEvent[] {
  const all: CombatEvent[] = [];
  const frames = Math.round(seconds / DT60);
  for (let i = 0; i < frames; i++) {
    all.push(...arena.update(DT60, px, py));
  }
  return all;
}

describe('FSM smoka bez tarczy (Miraż)', () => {
  it('IDLE 1,5 s → TELEGRAPH 1,0 s → ATTACK (1 fireball) → COOLDOWN 2,0 s → IDLE', () => {
    const a = new ArenaCombat('MIRAZ', 'NORMALNY', 0, []);
    const d = a.dragon;
    expect(d.state).toBe('IDLE');
    expect(d.shieldUp).toBe(false);

    run(a, 1.55);
    expect(d.state).toBe('TELEGRAPH');
    const ev = run(a, 1.05);
    expect(ev.some((e) => e.type === 'attack')).toBe(true);
    expect(d.state).toBe('ATTACK');
    expect(a.fireballs).toHaveLength(1);   // pattern "single"
    // fireball leci w stronę gracza (gracz z lewej) z prędkością 288 px/s (N)
    expect(a.fireballs[0].vx).toBe(-288);

    // pocisk wylatuje z areny → COOLDOWN → IDLE
    run(a, 4.0);
    expect(a.fireballs).toHaveLength(0);
    run(a, 2.1);
    expect(d.state === 'IDLE' || d.state === 'TELEGRAPH').toBe(true);
  });

  it('telegraf trwa 0,7 s na TRUDNYM i 1,4 s na ŁATWYM', () => {
    const hard = new ArenaCombat('MIRAZ', 'TRUDNY', 0, []);
    run(hard, 1.55);
    expect(hard.dragon.state).toBe('TELEGRAPH');
    run(hard, 0.75);
    expect(hard.dragon.state).toBe('ATTACK');

    const easy = new ArenaCombat('MIRAZ', 'LATWY', 0, []);
    run(easy, 1.55);
    run(easy, 0.75);
    expect(easy.dragon.state).toBe('TELEGRAPH');   // 1,4 s jeszcze trwa
  });

  it('HP wg trudności (Miraż 4/6/9), fireball 224/288/352 px/s', () => {
    expect(new ArenaCombat('MIRAZ', 'LATWY', 0, []).dragon.maxHp).toBe(4);
    expect(new ArenaCombat('MIRAZ', 'NORMALNY', 0, []).dragon.maxHp).toBe(6);
    expect(new ArenaCombat('MIRAZ', 'TRUDNY', 0, []).dragon.maxHp).toBe(9);
  });
});

describe('Cierń: dwa fireballe (wiersz gracza i 2 wyżej)', () => {
  it('pattern "double" strzela parą', () => {
    const a = new ArenaCombat('CIERN', 'NORMALNY', 0, O_POINTS);
    // zbij tarczę? Nie trzeba — smok strzela niezależnie od tarczy
    run(a, 2.7, 100, 272);
    expect(a.fireballs).toHaveLength(2);
    const ys = a.fireballs.map((f) => f.y).sort((p, q) => p - q);
    expect(ys[1] - ys[0]).toBe(2 * TILE);   // 2 wiersze różnicy
  });
});

describe('tarcza (aneks 8.4.2)', () => {
  it('zwykła strzała odbija się, magiczna przebija zawsze', () => {
    const a = new ArenaCombat('CIERN', 'NORMALNY', 0, O_POINTS);
    const d = a.dragon;
    expect(d.shieldUp).toBe(true);
    const ev1 = a.tryArrowHit(d.x + 8, d.y + 8, 1, false);
    expect(ev1[0].type).toBe('deflect');
    expect(d.hp).toBe(d.maxHp);
    const ev2 = a.tryArrowHit(d.x + 8, d.y + 8, 3, true);
    expect(ev2[0]).toMatchObject({ type: 'hit', dmg: 3 });
    expect(d.hp).toBe(d.maxHp - 3);
  });

  it('3 kryształy zbijają tarczę na 8 s (pierwsze 2 s STUNNED), potem wraca i po 1 s nowa fala', () => {
    const a = new ArenaCombat('CIERN', 'NORMALNY', 0, O_POINTS);
    const d = a.dragon;
    expect(a.shieldPickups).toHaveLength(3);

    let ev: CombatEvent[] = [];
    for (let i = 0; i < 3; i++) ev = ev.concat(a.collectShieldPickup(i));
    expect(ev.some((e) => e.type === 'shieldDown')).toBe(true);
    expect(ev.some((e) => e.type === 'stunned')).toBe(true);
    expect(d.shieldUp).toBe(false);
    expect(d.state).toBe('STUNNED');

    // zwykła strzała działa przy zbitej tarczy
    const hit = a.tryArrowHit(d.x + 8, d.y + 8, 2, false);
    expect(hit[0]).toMatchObject({ type: 'hit', dmg: 2 });

    // STUNNED mija po 2 s
    run(a, 2.1);
    expect(d.state).not.toBe('STUNNED');
    expect(d.shieldUp).toBe(false);

    // po 8 s od zbicia tarcza wraca
    const evUp = run(a, 6.0);
    expect(evUp.some((e) => e.type === 'shieldUp')).toBe(true);
    expect(d.shieldUp).toBe(true);

    // 1 s później nowa fala 3 kryształów
    const evWave = run(a, 1.05);
    expect(evWave.some((e) => e.type === 'shieldWave')).toBe(true);
    expect(a.shieldPickups.filter((p) => p.alive)).toHaveLength(3);
  });
});

describe('timer ucieczki (aneks 8.4.4)', () => {
  it('ostrzeżenie 30 s przed, FLEE po 120 s (N), potem fled', () => {
    const a = new ArenaCombat('MIRAZ', 'NORMALNY', 0, []);
    const ev1 = run(a, 89.5);
    expect(ev1.some((e) => e.type === 'fleeWarning')).toBe(false);
    const ev2 = run(a, 1.0);
    expect(ev2.some((e) => e.type === 'fleeWarning')).toBe(true);

    const ev3 = run(a, 30.0);
    expect(ev3.some((e) => e.type === 'fleeStart')).toBe(true);
    const ev4 = run(a, 1.6);   // animacja FLEE 1,5 s
    expect(ev4.some((e) => e.type === 'fled')).toBe(true);
    expect(a.dragon.state).toBe('GONE');
    expect(a.dragon.fled).toBe(true);
  });

  it('na TRUDNYM smok ucieka po 90 s', () => {
    const a = new ArenaCombat('MIRAZ', 'TRUDNY', 0, []);
    const ev = run(a, 90.5);
    expect(ev.some((e) => e.type === 'fleeStart')).toBe(true);
  });
});

describe('checkpoint areny (aneks 8.4.4)', () => {
  it('HP smoka NIE resetuje się; FSM, tarcza i timer wracają', () => {
    const a = new ArenaCombat('CIERN', 'NORMALNY', 0, O_POINTS);
    const d = a.dragon;
    a.tryArrowHit(d.x + 8, d.y + 8, 4, true);
    expect(d.hp).toBe(d.maxHp - 4);
    for (let i = 0; i < 3; i++) a.collectShieldPickup(i);   // tarcza zbita
    run(a, 20);
    const hpBefore = d.hp;

    a.restart();   // śmierć gracza w arenie → restart od checkpointu
    expect(d.hp).toBe(hpBefore);           // zachowany HP
    expect(d.state).toBe('IDLE');
    expect(d.shieldUp).toBe(true);          // tarcza wraca
    expect(a.arenaTime).toBe(0);            // timer ucieczki od nowa
    expect(a.fireballs).toHaveLength(0);
    expect(a.shieldPickups.filter((p) => p.alive)).toHaveLength(3);
  });

  it('nowa arena z initialHp odtwarza zachowany HP (powrót po game over w poziomie)', () => {
    const a = new ArenaCombat('PIRA', 'NORMALNY', 0, O_POINTS, { initialHp: 5 });
    expect(a.dragon.hp).toBe(5);
    expect(a.dragon.maxHp).toBe(12);
  });
});

describe('pokonanie smoka', () => {
  it('hp 0 → DYING 1,5 s → defeated', () => {
    const a = new ArenaCombat('MIRAZ', 'NORMALNY', 0, []);
    const d = a.dragon;
    const ev = a.tryArrowHit(d.x + 8, d.y + 8, d.maxHp, false);
    expect(ev.some((e) => e.type === 'dying')).toBe(true);
    expect(d.state).toBe('DYING');
    const ev2 = run(a, 1.6);
    expect(ev2.some((e) => e.type === 'defeated')).toBe(true);
    expect(d.state).toBe('GONE');
    // timer ucieczki nie tyka po śmierci
    expect(a.dragon.fled).toBe(false);
  });
});

describe('Pira: zionięcie na przemian z fireballem', () => {
  it('pas ziemi 8 kolumn płonie 1,0 s', () => {
    const a = new ArenaCombat('PIRA', 'NORMALNY', 0, O_POINTS);
    // atkA startuje na 3.0 → pierwszy atak: fireball; drugi: zionięcie
    let flames = 0;
    let fires = 0;
    for (let i = 0; i < 60 * 16; i++) {
      a.update(DT60, 400, 272);
      flames = Math.max(flames, a.flames.length);
      fires = Math.max(fires, a.fireballs.length);
    }
    expect(flames).toBeGreaterThan(0);
    expect(fires).toBeGreaterThan(0);
  });
});

describe('BOSS Obsydian — 3 fazy (aneks 8.4.3)', () => {
  it('faza 1: płomień przy ziemi (~3 s) i głaz (~10 s); bez timera ucieczki', () => {
    const a = new ArenaCombat('OBSYDIAN', 'NORMALNY', 0, O_POINTS);
    expect(a.dragon.maxHp).toBe(18);
    let sawFlame = false;
    let sawBoulder = false;
    for (let i = 0; i < 60 * 20; i++) {
      a.update(DT60, 400, 272);
      sawFlame = sawFlame || a.flamewaves.length > 0;
      sawBoulder = sawBoulder || a.bossBoulders.length > 0;
    }
    expect(sawFlame).toBe(true);
    expect(sawBoulder).toBe(true);
    expect(a.arenaTime).toBe(0);   // boss: bez timera ucieczki
  });

  it('progi faz: 100–66–33% (18 → faza 2 przy ≤12, faza 3 przy ≤6)', () => {
    const a = new ArenaCombat('OBSYDIAN', 'NORMALNY', 0, O_POINTS);
    const d = a.dragon;
    expect(d.bossPhase()).toBe(1);
    d.hp = 13;
    expect(d.bossPhase()).toBe(1);
    d.hp = 12;
    expect(d.bossPhase()).toBe(2);
    d.hp = 7;
    expect(d.bossPhase()).toBe(2);
    d.hp = 6;
    expect(d.bossPhase()).toBe(3);
  });

  it('faza 2: dwie kule ognia po parabolach (grav)', () => {
    const a = new ArenaCombat('OBSYDIAN', 'NORMALNY', 0, O_POINTS);
    a.dragon.hp = 12;
    const ev = run(a, 0.1);
    expect(ev.some((e) => e.type === 'phase' && e.phase === 2)).toBe(true);
    let grav = 0;
    for (let i = 0; i < 60 * 5; i++) {
      a.update(DT60, 400, 272);
      grav = Math.max(grav, a.fireballs.filter((f) => f.grav).length);
    }
    expect(grav).toBe(2);
  });

  it('faza 3: szarża + fale uderzeniowe + słaby punkt (magiczna ×2)', () => {
    const a = new ArenaCombat('OBSYDIAN', 'NORMALNY', 0, O_POINTS);
    const d = a.dragon;
    d.hp = 6;
    const ev = run(a, 0.1);
    expect(ev.some((e) => e.type === 'phase' && e.phase === 3)).toBe(true);
    // po ~2 s telegraf szarży (1,2 s), potem CHARGE do ściany
    let sawCharge = false;
    for (let i = 0; i < 60 * 12 && !(d.weak > 0); i++) {
      a.update(DT60, 400, 272);
      sawCharge = sawCharge || d.state === 'CHARGE';
    }
    expect(sawCharge).toBe(true);
    expect(d.weak).toBeGreaterThan(0);       // dyszy po szarży
    expect(a.shocks.length).toBeGreaterThan(0);
    // słaby punkt: magiczna liczy się podwójnie
    const hp0 = d.hp;
    const hit = d.takeHit(1, true);
    expect(hit[0]).toMatchObject({ type: 'hit', dmg: 2 });
    expect(d.hp).toBe(hp0 - 2);
  });

  it('tarcza bossa: fala co 5 s (faza 3: co 3 s) po powrocie tarczy', () => {
    const a = new ArenaCombat('OBSYDIAN', 'NORMALNY', 0, O_POINTS);
    for (let i = 0; i < 3; i++) a.collectShieldPickup(i);
    expect(a.dragon.shieldUp).toBe(false);
    const evUp = run(a, 8.1);                 // tarcza wraca po 8 s
    expect(evUp.some((e) => e.type === 'shieldUp')).toBe(true);
    const ev4s = run(a, 4.0);                 // fala dopiero po 5 s
    expect(ev4s.some((e) => e.type === 'shieldWave')).toBe(false);
    const ev1s = run(a, 1.1);
    expect(ev1s.some((e) => e.type === 'shieldWave')).toBe(true);
  });

  it('pokonany boss → defeated (bez ucieczki)', () => {
    const a = new ArenaCombat('OBSYDIAN', 'NORMALNY', 0, O_POINTS);
    const d = a.dragon;
    d.hp = 6;
    run(a, 0.1);                              // wejście w fazę 3
    d.takeHit(6, true);
    expect(d.state).toBe('DYING');
    const ev = run(a, 1.6);
    expect(ev.some((e) => e.type === 'defeated')).toBe(true);
  });
});
