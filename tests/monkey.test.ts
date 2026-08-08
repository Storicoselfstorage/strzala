/**
 * Echo — aneks 6.1: podążanie/teleport, gwizd przed pułapkami, ucieczka
 * (2 najbliższe punkty `!`), powrót (placek / 1 s przy kryjówce),
 * okno 2 strat w 20 s.
 */
import { describe, expect, it } from 'vitest';
import {
  DT60, ECHO_RETURN_CAKE_R, ECHO_TELEPORT_DIST,
} from '../src/core/balance';
import {
  Echo, EchoEnv, pickTrapsToActivate, recordLifeLoss,
} from '../src/core/monkey';

const env = (over: Partial<EchoEnv> = {}): EchoEnv => ({
  playerX: 400,
  playerY: 272,
  playerFacing: 1,
  playerOnGround: true,
  standY: () => 288,
  hideoutX: 100,
  levelWidthPx: 1600,
  ...over,
});

describe('podążanie', () => {
  it('trzyma się 3 kolumny (48 px) za bohaterką', () => {
    const e = new Echo(340, 288);
    for (let i = 0; i < 120; i++) e.update(DT60, env());
    expect(Math.abs(e.x - (400 - 48))).toBeLessThanOrEqual(8);
    expect(e.y).toBe(288);
  });

  it('teleport przy dystansie > 20 kolumn (320 px)', () => {
    const e = new Echo(0, 288);
    expect(Math.abs(e.x - 352)).toBeGreaterThan(ECHO_TELEPORT_DIST);
    e.update(DT60, env());
    expect(e.x).toBe(352);   // od razu na pozycji docelowej
  });
});

describe('gwizd przed pułapkami', () => {
  it('gwiżdże, gdy pułapka < 6 kolumn (96 px) przed graczem — raz na kolumnę', () => {
    const e = new Echo(352, 288);
    const ev1 = e.checkWhistle([460], env());
    expect(ev1).toHaveLength(1);
    expect(ev1[0]).toMatchObject({ type: 'whistle', hazardX: 460, first: true });
    expect(e.whistle).toBeGreaterThan(0);
    // ta sama pułapka drugi raz — cisza
    expect(e.checkWhistle([460], env())).toHaveLength(0);
  });

  it('drugi gwizd (inna pułapka) nie jest już „pierwszy" (bell tylko raz)', () => {
    const e = new Echo(352, 288);
    e.checkWhistle([460], env());
    const ev = e.checkWhistle([700], env({ playerX: 650 }));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ first: false });
  });

  it('pułapka za plecami nie gwiżdże', () => {
    const e = new Echo(352, 288);
    expect(e.checkWhistle([300], env())).toHaveLength(0);          // za graczem
    expect(e.checkWhistle([600], env())).toHaveLength(0);          // za daleko
  });
});

describe('ucieczka i powrót', () => {
  it('flee → bieg do kryjówki → hideout', () => {
    const e = new Echo(352, 288);
    e.flee();
    expect(e.state).toBe('fleeing');
    expect(e.present()).toBe(false);
    for (let i = 0; i < 60 * 3; i++) e.update(DT60, env({ playerX: 1400 }));
    expect(e.state).toBe('hideout');
    expect(Math.abs(e.x - 100)).toBeLessThan(20);
  });

  it('stanie 1 s przy kryjówce przywraca Echo bez placka', () => {
    const e = new Echo(100, 288);
    e.state = 'hideout';
    // gracz daleko: nic się nie dzieje
    for (let i = 0; i < 30; i++) e.update(DT60, env({ playerX: 800 }));
    expect(e.state).toBe('hideout');
    // gracz przy kryjówce (< 2 kolumny), na ziemi
    let returned = false;
    for (let i = 0; i < 70 && !returned; i++) {
      returned = e.update(DT60, env({ playerX: 110 }))
        .some((v) => v.type === 'returned');
    }
    expect(returned).toBe(true);
    expect(e.state).toBe('follow');
  });

  it('licznik powrotu zeruje się, gdy gracz odejdzie', () => {
    const e = new Echo(100, 288);
    e.state = 'hideout';
    for (let i = 0; i < 30; i++) e.update(DT60, env({ playerX: 110 }));
    for (let i = 0; i < 5; i++) e.update(DT60, env({ playerX: 800 }));
    expect(e.returnT).toBe(0);
  });

  it('placek działa w promieniu 5 kolumn (80 px) przy uciekłej Echo', () => {
    const e = new Echo(500, 288);
    e.flee();
    expect(e.canRetameWithCake(500 + ECHO_RETURN_CAKE_R)).toBe(true);
    expect(e.canRetameWithCake(500 + ECHO_RETURN_CAKE_R + 1)).toBe(false);
    e.comeBack();
    expect(e.canRetameWithCake(500)).toBe(false);   // obecna — placek to +1 życie
  });

  it('nieśmiertelna: flee nie działa, gdy już uciekła (away/fleeing)', () => {
    const e = new Echo(500, 288);
    e.state = 'away';
    e.flee();
    expect(e.state).toBe('away');
  });
});

describe('aktywacja pułapek przy ucieczce (v1 echo_flee)', () => {
  it('wybiera 2 najbliższe UKRYTE punkty `!`', () => {
    const traps = [
      { x: 100, hidden: true },
      { x: 500, hidden: true },
      { x: 180, hidden: false },   // już aktywna — pomijana
      { x: 120, hidden: true },
    ];
    expect(pickTrapsToActivate(traps, 110)).toEqual([0, 3]);
  });

  it('mniej niż 2 ukryte — aktywuje ile jest', () => {
    expect(pickTrapsToActivate([{ x: 50, hidden: true }], 0)).toEqual([0]);
    expect(pickTrapsToActivate([], 0)).toEqual([]);
  });
});

describe('okno strat (2 życia w 20 s → Echo ucieka)', () => {
  it('dwie straty w oknie wywołują ucieczkę', () => {
    const r1 = recordLifeLoss([], 5);
    expect(r1.echoShouldFlee).toBe(false);
    const r2 = recordLifeLoss(r1.times, 24);   // 19 s później
    expect(r2.echoShouldFlee).toBe(true);
  });

  it('straty rozdzielone > 20 s nie wywołują ucieczki', () => {
    const r1 = recordLifeLoss([], 5);
    const r2 = recordLifeLoss(r1.times, 26);   // 21 s później
    expect(r2.echoShouldFlee).toBe(false);
    expect(r2.times).toEqual([26]);
  });
});
