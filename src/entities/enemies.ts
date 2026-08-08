/**
 * Zwykli przeciwnicy (aneks 6.3) — logika kinematyczna w encji, zero Arcade.
 * Toczek (ślimak/slime PA2 — wariant per świat): patrol krawędziowy 8 kolumn.
 * Skoczka (królik PA2): siad 2 s → telegraf przysiadu 0,5 s → skok ku graczowi.
 * Machacz (nietoperz PA2, światy 2-3): przelot sinusoidą po wyzwoleniu `2`.
 */
import Phaser from 'phaser';
import {
  GRAVITY, MACHACZ_AMP, MACHACZ_PERIOD, MACHACZ_SPEED,
  SKOCZKA_JUMP_V, SKOCZKA_JUMP_VX, SKOCZKA_SIT_TIME,
  SKOCZKA_TELEGRAPH, TILE, TOCZEK_PATROL_HALF, TOCZEK_SPEED,
} from '../core/balance';

export interface EnemyEnv {
  solidAt(r: number, c: number): boolean;
  playerX: number;
}

/** wariant kolorystyczny na świat (aneks 6.3) */
export type ToczekSkin = 'snail' | 'slime';

export interface Rect { x: number; y: number; w: number; h: number }

abstract class EnemyBase {
  readonly sprite: Phaser.GameObjects.Sprite;
  alive = true;
  dying = false;

  protected constructor(sprite: Phaser.GameObjects.Sprite) {
    this.sprite = sprite;
    this.sprite.setDepth(-20);   // za graczem (0) i za złodziejem (-14)
  }

  abstract rect(): Rect;
  abstract update(dt: number, env: EnemyEnv): void;

  /** pokonany (skok na grzbiet / strzała): animacja hit → znika */
  kill(hitAnim: string): void {
    if (!this.alive || this.dying) return;
    this.dying = true;
    this.sprite.play(hitAnim, true);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.alive = false;
      this.sprite.setVisible(false);
    });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

export class Toczek extends EnemyBase {
  private readonly spawnX: number;
  private readonly feetY: number;
  private readonly rowFeet: number;
  private dir: -1 | 1 = -1;
  x: number;
  /** animacja śmierci zależna od skina (Level woła die()) */
  readonly hitAnim: string;

  constructor(
    scene: Phaser.Scene, spawnR: number, spawnC: number,
    skin: ToczekSkin = 'snail', tint = 0xffffff,
  ) {
    const x = spawnC * TILE + TILE / 2;
    const feetY = (spawnR + 1) * TILE;
    const tex = skin === 'snail' ? 'enemy-snail-walk' : 'enemy-slime-idle-run';
    super(scene.add.sprite(x, feetY + 1, tex, 0).setOrigin(0.5, 1));
    this.sprite.play(skin === 'snail' ? 'snail-walk' : 'slime-move');
    if (tint !== 0xffffff) this.sprite.setTint(tint);
    this.hitAnim = skin === 'snail' ? 'snail-hit' : 'slime-hit';
    this.x = x;
    this.spawnX = x;
    this.feetY = feetY;
    this.rowFeet = spawnR + 1;
  }

  die(): void {
    this.kill(this.hitAnim);
  }

  rect(): Rect {
    return { x: this.x - 12, y: this.feetY - 18, w: 24, h: 18 };
  }

  get topY(): number { return this.feetY - 18; }

  update(dt: number, env: EnemyEnv): void {
    if (!this.alive || this.dying) return;
    const nx = this.x + this.dir * TOCZEK_SPEED * dt;
    const aheadC = Math.floor((nx + this.dir * 10) / TILE);
    const r = this.rowFeet - 1;
    const noFloor = !env.solidAt(this.rowFeet, aheadC);
    const wall = env.solidAt(r, aheadC);
    if (noFloor || wall || Math.abs(nx - this.spawnX) > TOCZEK_PATROL_HALF) {
      this.dir = this.dir === 1 ? -1 : 1;
    } else {
      this.x = nx;
    }
    this.sprite.x = this.x;
    this.sprite.setFlipX(this.dir > 0);
  }
}

type BunnyState = 'sit' | 'telegraph' | 'air';

export class Skoczka extends EnemyBase {
  private state: BunnyState = 'sit';
  private t = SKOCZKA_SIT_TIME;
  private vx = 0;
  private vy = 0;
  private readonly groundFeetY: number;
  x: number;
  y: number;   // stopy (px)

  constructor(scene: Phaser.Scene, spawnR: number, spawnC: number, tint = 0xffffff) {
    const x = spawnC * TILE + TILE / 2;
    const feetY = (spawnR + 1) * TILE;
    super(scene.add.sprite(x, feetY + 1, 'enemy-bunny-idle', 0).setOrigin(0.5, 1));
    this.sprite.play('bunny-idle');
    if (tint !== 0xffffff) this.sprite.setTint(tint);
    this.x = x;
    this.y = feetY;
    this.groundFeetY = feetY;
  }

  rect(): Rect {
    return { x: this.x - 10, y: this.y - 30, w: 20, h: 30 };
  }

  get grounded(): boolean { return this.state !== 'air'; }

  update(dt: number, env: EnemyEnv): void {
    if (!this.alive || this.dying) return;
    this.t -= dt;
    if (this.state === 'sit') {
      if (this.t <= 0) {
        this.state = 'telegraph';
        this.t = SKOCZKA_TELEGRAPH;
        this.sprite.anims.stop();
        this.sprite.setTexture('enemy-bunny-idle', 0);
        this.sprite.setScale(1.12, 0.8);   // telegraf: przysiad (aneks 6.3)
      }
    } else if (this.state === 'telegraph') {
      if (this.t <= 0) {
        this.state = 'air';
        this.sprite.setScale(1, 1);
        this.sprite.setTexture('enemy-bunny-jump', 0);
        const d = env.playerX > this.x ? 1 : -1;
        this.vx = d * SKOCZKA_JUMP_VX;
        this.vy = -SKOCZKA_JUMP_V;
        this.sprite.setFlipX(d < 0);
      }
    } else {
      this.vy += GRAVITY * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.vy > 60) this.sprite.setTexture('enemy-bunny-fall', 0);
      if (this.vy > 0 && this.y >= this.groundFeetY) {
        this.y = this.groundFeetY;
        this.state = 'sit';
        this.t = SKOCZKA_SIT_TIME;
        this.sprite.play('bunny-idle');
      }
    }
    this.sprite.x = this.x;
    this.sprite.y = this.y + 1;
  }
}

/**
 * Machacz (aneks 6.3): przelot poziomy sinusoidą 8 kol/s, amplituda 2 wiersze,
 * okres 2 s; spawn na wyzwalaczu `2`, leci w stronę gracza; znika za mapą.
 */
export class Machacz extends EnemyBase {
  private readonly baseY: number;
  private t = 0;
  private readonly dir: -1 | 1;
  private readonly levelWidthPx: number;
  x: number;
  y: number;   // środek ciała (px)

  constructor(
    scene: Phaser.Scene, spawnR: number, spawnC: number, dir: -1 | 1,
    levelWidthPx: number, tint = 0xffffff,
  ) {
    const x = spawnC * TILE + TILE / 2;
    // baza sinusoidy 2,5 kratki nad znacznikiem — dół łuku muska głowę gracza
    const baseY = spawnR * TILE - 2.5 * TILE;
    super(scene.add.sprite(x, baseY, 'enemy-bat-flying', 0).setOrigin(0.5, 0.5));
    this.sprite.play('bat-fly');
    if (tint !== 0xffffff) this.sprite.setTint(tint);
    this.x = x;
    this.y = baseY;
    this.baseY = baseY;
    this.dir = dir;
    this.levelWidthPx = levelWidthPx;
    this.sprite.setFlipX(dir > 0);
  }

  rect(): Rect {
    return { x: this.x - 10, y: this.y - 8, w: 20, h: 16 };
  }

  update(dt: number, _env: EnemyEnv): void {
    if (!this.alive || this.dying) return;
    this.t += dt;
    this.x += this.dir * MACHACZ_SPEED * dt;
    this.y = this.baseY + MACHACZ_AMP * Math.sin((this.t * 2 * Math.PI) / MACHACZ_PERIOD);
    if (this.x < -3 * TILE || this.x > this.levelWidthPx + 3 * TILE) {
      this.alive = false;
      this.sprite.setVisible(false);
      return;
    }
    this.sprite.x = this.x;
    this.sprite.y = this.y;
  }
}
