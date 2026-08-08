/**
 * Echo (małpa-zwiadowczyni) — port 1:1 z aneksu 6.1 / game.py (Monkey,
 * Game.check_echo_whistle, Game.echo_flee, Game.lose_life — okno strat).
 * Nieśmiertelna. Pozycje w px.
 */
import {
  ECHO_FLEE_LIFE_COUNT, ECHO_FLEE_LIFE_WINDOW, ECHO_FLEE_TRAPS,
  ECHO_FOLLOW_DIST, ECHO_HIDEOUT_RETURN_TIME, ECHO_RETURN_CAKE_R,
  ECHO_RUN_SPEED, ECHO_TELEPORT_DIST, ECHO_WHISTLE_DIST, TILE,
} from './balance';

export type EchoState = 'follow' | 'fleeing' | 'hideout' | 'away';

export interface EchoEnv {
  playerX: number;
  playerY: number;
  playerFacing: -1 | 1;
  playerOnGround: boolean;
  /** górny y (px) wiersza, na którym Echo stoi w kolumnie c (kratki) */
  standY(c: number): number;
  /** kryjówka `m` w px (null, gdy mapa jej nie ma) */
  hideoutX: number | null;
  levelWidthPx: number;
}

export type EchoEvent =
  | { type: 'whistle'; hazardX: number; first: boolean }
  | { type: 'returned' };

const col = (px: number) => Math.floor(px / TILE);

export class Echo {
  x: number;
  y: number;
  state: EchoState = 'follow';
  whistle = 0;
  hop = 0;
  returnT = 0;
  /** kolumny-px zagrożeń już ogwizdanych (v1: warned per poziom) */
  warned = new Set<number>();
  /** pierwszy gwizd na poziomie — z sygnałem dźwiękowym */
  whistledOnce = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  present(): boolean {
    return this.state === 'follow';
  }

  update(dt: number, env: EchoEnv): EchoEvent[] {
    const events: EchoEvent[] = [];
    this.whistle = Math.max(0, this.whistle - dt);
    this.hop = Math.max(0, this.hop - dt);

    if (this.state === 'follow') {
      // podąża 3 kolumny za bohaterką (teleport, gdy dystans > 20 kolumn)
      const tx = env.playerX - ECHO_FOLLOW_DIST * env.playerFacing;
      const dx = Math.abs(this.x - tx);
      if (dx > ECHO_TELEPORT_DIST) {
        this.x = tx;
      } else if (dx > 0.5 * TILE) {
        // v1: prędkość min(14 kol/s, |dx|·4 /s) — po przeliczeniu forma ta sama
        const v = Math.min(ECHO_RUN_SPEED, Math.abs(tx - this.x) * 4);
        this.x += (tx > this.x ? 1 : -1) * v * dt;
      }
      const c = col(Math.max(0, Math.min(this.x, env.levelWidthPx - TILE)));
      this.y = env.standY(c);
    } else if (this.state === 'fleeing') {
      const hx = env.hideoutX ?? 0;
      this.x += (hx > this.x ? 1 : -1) * ECHO_RUN_SPEED * dt;
      const c = col(Math.max(0, Math.min(this.x, env.levelWidthPx - TILE)));
      this.y = env.standY(c);
      if (Math.abs(this.x - hx) < TILE) this.state = 'hideout';
    } else if (this.state === 'hideout') {
      // powrót bez placka: stanie 1 s przy kryjówce
      if (Math.abs(env.playerX - this.x) < 2 * TILE && env.playerOnGround) {
        this.returnT += dt;
        if (this.returnT >= ECHO_HIDEOUT_RETURN_TIME) {
          this.comeBack();
          events.push({ type: 'returned' });
        }
      } else {
        this.returnT = 0;
      }
    }
    return events;
  }

  /**
   * Gwizd przed pułapkami: pułapka < 6 kolumn PRZED graczem (w kierunku
   * patrzenia), raz na kolumnę. hazardXs — kolumny-px kaktusów, kolców,
   * punktów `!`, gejzerów i głazów (v1 check_echo_whistle).
   */
  checkWhistle(hazardXs: readonly number[], env: EchoEnv): EchoEvent[] {
    const events: EchoEvent[] = [];
    if (!this.present()) return events;
    for (const hx of hazardXs) {
      const d = (hx - env.playerX) * env.playerFacing;
      if (d > 0 && d < ECHO_WHISTLE_DIST && !this.warned.has(hx)) {
        this.warned.add(hx);
        this.whistle = 1.0;
        this.hop = 0.4;
        const first = !this.whistledOnce;
        this.whistledOnce = true;
        events.push({ type: 'whistle', hazardX: hx, first });
      }
    }
    return events;
  }

  /** ucieczka (kradzież placka / 2 straty w 20 s / skrypt 2-2) */
  flee(): void {
    if (this.present()) this.state = 'fleeing';
  }

  /** powrót do drużyny (placek albo odczekanie przy kryjówce) */
  comeBack(): void {
    this.state = 'follow';
    this.returnT = 0;
  }

  /** placek działa, gdy Echo ucieka/siedzi w kryjówce w promieniu 5 kolumn */
  canRetameWithCake(playerX: number): boolean {
    return (this.state === 'fleeing' || this.state === 'hideout')
      && Math.abs(playerX - this.x) <= ECHO_RETURN_CAKE_R;
  }
}

/**
 * Ucieczka Echo aktywuje 2 najbliższe UKRYTE punkty `!` (v1 echo_flee).
 * Zwraca indeksy pułapek do aktywacji.
 */
export function pickTrapsToActivate(
  traps: ReadonlyArray<{ x: number; hidden: boolean }>,
  echoX: number,
): number[] {
  return traps
    .map((t, i) => ({ i, t }))
    .filter(({ t }) => t.hidden)
    .sort((a, b) => Math.abs(a.t.x - echoX) - Math.abs(b.t.x - echoX))
    .slice(0, ECHO_FLEE_TRAPS)
    .map(({ i }) => i);
}

/**
 * Okno strat (v1 lose_life): dopisz stratę, przytnij do 20 s;
 * 2 straty w oknie → Echo ucieka.
 */
export function recordLifeLoss(
  times: readonly number[], now: number,
): { times: number[]; echoShouldFlee: boolean } {
  const kept = [...times, now].filter((t) => now - t <= ECHO_FLEE_LIFE_WINDOW);
  return { times: kept, echoShouldFlee: kept.length >= ECHO_FLEE_LIFE_COUNT };
}
