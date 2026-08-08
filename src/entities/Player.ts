/**
 * Bohaterka — nakładka Phaser na fizykę Arcade.
 * Hitbox ZAWSZE z balance (9,6 × 25,6 px; ślizg: 1 kratka), nigdy ze sprite'a:
 * fizykę niesie niewidzialny prostokąt, a sprite tylko podąża za nim
 * (dzięki temu squash&stretch/miganie nie ruszają kolizji).
 */
import Phaser from 'phaser';
import {
  CharacterId, CHARACTERS, CharacterStats, COYOTE_TIME, JUMP_BUFFER,
  MAX_FALL, PLAYER_HITBOX_H, PLAYER_HITBOX_W, TILE,
} from '../core/balance';

/**
 * Przełącznik wariantu Tosi (PRD 4.2): 'ranger' = Ranger Girl (domyślny),
 * 'frog' = fallback Ninja Frog recolor (pełne klatki skoku/upadku/hit).
 * JEDNO miejsce zmiany na wypadek słabego efektu na bramce B1.
 */
export const TOSIA_VARIANT: 'ranger' | 'frog' = 'ranger';

/** ślizg: wysokość ciała 1 kratka (16 px − 0,4 px luzu na korzyść gracza) */
const SLIDE_H = TILE - 0.4;

export interface PlayerInput {
  move: -1 | 0 | 1;
  jumpPressed: boolean;
  downHeld: boolean;
}

export interface PlayerCallbacks {
  onJump(): void;
  onLand(fallSpeed: number): void;
  /** kurz przy sprincie (wołane co ~90 ms biegu po ziemi) */
  onRunDust(x: number, y: number): void;
  /** czy kratka (r, c) jest solidna (mapa + ściany areny) */
  solidAt(r: number, c: number): boolean;
}

export class Player {
  readonly scene: Phaser.Scene;
  readonly charId: CharacterId;
  readonly char: CharacterStats;
  readonly carrier: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly cb: PlayerCallbacks;

  facing: -1 | 1 = 1;
  sliding = false;
  coyote = 0;
  jumpBuf = 0;
  iframes = 0;
  shootCd = 0;
  /** czas pozostały animacji strzału / oberwania (sterowanie animacją) */
  private attackT = 0;
  private hurtT = 0;
  private wasOnGround = false;
  private dustT = 0;
  private squash?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene, feetX: number, feetY: number, charId: CharacterId,
    cb: PlayerCallbacks,
  ) {
    this.scene = scene;
    this.charId = charId;
    this.char = CHARACTERS[charId];
    this.cb = cb;

    this.carrier = scene.add
      .rectangle(feetX, feetY - PLAYER_HITBOX_H / 2, PLAYER_HITBOX_W, PLAYER_HITBOX_H)
      .setVisible(false);
    scene.physics.add.existing(this.carrier);
    this.body = this.carrier.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(1000, MAX_FALL);
    this.body.setCollideWorldBounds(true);

    if (charId === 'VEGA') {
      // klatki 100×68, stopy w każdej klatce na y=67 → origin przy stopach
      this.sprite = scene.add.sprite(feetX, feetY, 'vega-idle', 0).setOrigin(0.5, 1);
    } else if (TOSIA_VARIANT === 'ranger') {
      this.sprite = scene.add.sprite(feetX, feetY, 'tosia-ranger', 0).setOrigin(0.5, 1);
    } else {
      this.sprite = scene.add.sprite(feetX, feetY, 'tosia-frog-idle', 0).setOrigin(0.5, 1);
    }
    this.sprite.setDepth(0);
    this.playAnim('idle');
  }

  get onGround(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  /** środek hitboksu (px świata) */
  get cx(): number { return this.body.x + this.body.width / 2; }
  get cy(): number { return this.body.y + this.body.height / 2; }
  get feetY(): number { return this.body.y + this.body.height; }
  get headY(): number { return this.body.y; }

  rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.body.x, y: this.body.y, w: this.body.width, h: this.body.height };
  }

  update(dt: number, input: PlayerInput): void {
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);

    const onGround = this.onGround;

    // ── ślizg / kucanie (aneks 8.2; wejście tylko w biegu) ────────────────
    const wantSlide = input.downHeld && onGround
      && (input.move !== 0 || Math.abs(this.body.velocity.x) > 8);
    if (wantSlide && !this.sliding) this.setSlide(true);
    else if (this.sliding && !input.downHeld && this.ceilingFree()) this.setSlide(false);

    // ── ruch poziomy ──────────────────────────────────────────────────────
    if (this.hurtT <= 0) {
      this.body.setVelocityX(input.move * this.char.speed);
      if (input.move !== 0) this.facing = input.move;
    }

    // ── skok: edge + coyote 0,10 + buffer 0,15 (wzór core/physicsSim) ─────
    if (input.jumpPressed) {
      this.jumpBuf = JUMP_BUFFER;
      if ((onGround || this.coyote > 0) && !this.sliding) this.doJump();
    }
    if (onGround) {
      this.coyote = COYOTE_TIME;
      if (this.jumpBuf > 0 && !this.sliding && !input.jumpPressed) this.doJump();
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);

    // ── lądowanie: squash + kurz ──────────────────────────────────────────
    if (!this.wasOnGround && onGround) {
      this.cb.onLand(this.body.velocity.y);
      this.squashTo(1.1, 0.9);
      this.dustT = 0;
    }
    this.wasOnGround = onGround;

    // ── kurz sprintu ──────────────────────────────────────────────────────
    if (onGround && Math.abs(this.body.velocity.x) > this.char.speed * 0.6) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.07;
        this.cb.onRunDust(this.cx - this.facing * 7, this.feetY);
      }
    }

    this.syncSprite();
    this.updateAnim(onGround, input.move !== 0);
  }

  private doJump(): void {
    this.body.setVelocityY(-this.char.jumpV0);
    this.coyote = 0;
    this.jumpBuf = 0;
    this.squashTo(0.9, 1.1);
    this.cb.onJump();
  }

  private setSlide(on: boolean): void {
    this.sliding = on;
    const bottom = this.body.y + this.body.height;
    if (on) {
      this.body.setSize(PLAYER_HITBOX_W, SLIDE_H);
      this.body.y = bottom - SLIDE_H;
    } else {
      this.body.setSize(PLAYER_HITBOX_W, PLAYER_HITBOX_H);
      this.body.y = bottom - PLAYER_HITBOX_H;
    }
  }

  /** czy nad głową jest miejsce na wstanie z ślizgu */
  private ceilingFree(): boolean {
    const bottom = this.body.y + this.body.height;
    const top = bottom - PLAYER_HITBOX_H;
    const c0 = Math.floor(this.body.x / TILE);
    const c1 = Math.floor((this.body.x + this.body.width - 0.01) / TILE);
    const r0 = Math.floor(top / TILE);
    const r1 = Math.floor((bottom - SLIDE_H - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.cb.solidAt(r, c)) return false;
      }
    }
    return true;
  }

  /** trafienie: odrzut + i-frames (miganie w syncSprite) */
  hurt(knockDir: -1 | 1, iframes: number): void {
    this.iframes = iframes;
    this.hurtT = 0.25;
    this.body.setVelocity(knockDir * 220, -170);
    if (this.charId === 'VEGA') this.sprite.play('vega-hit', true);
    else if (TOSIA_VARIANT === 'frog') this.sprite.play('tosia-frog-hit', true);
  }

  /** próba strzału — zwraca true, gdy cooldown pozwolił (amunicję liczy Level) */
  tryShoot(): boolean {
    if (this.shootCd > 0) return false;
    this.shootCd = this.char.shootCd;
    this.attackT = 0.2;
    if (this.charId === 'VEGA') this.sprite.play('vega-attack', true);
    return true;
  }

  respawn(feetX: number, feetY: number): void {
    if (this.sliding) this.setSlide(false);
    this.body.reset(feetX - PLAYER_HITBOX_W / 2, feetY - PLAYER_HITBOX_H);
    this.body.setVelocity(0, 0);
    this.iframes = 0;
    this.hurtT = 0;
    this.facing = 1;
    this.syncSprite();
  }

  private squashTo(sx: number, sy: number): void {
    this.squash?.stop();
    this.sprite.setScale(sx, sy);
    this.squash = this.scene.tweens.add({
      targets: this.sprite, scaleX: 1, scaleY: 1, duration: 100, ease: 'Sine.out',
    });
  }

  private syncSprite(): void {
    this.sprite.x = this.cx;
    this.sprite.y = this.feetY + 0.5;
    this.sprite.setFlipX(this.facing < 0);
    // i-frames: miganie 20 Hz
    this.sprite.alpha = this.iframes > 0
      ? (Math.floor(this.scene.time.now / 50) % 2 === 0 ? 0.35 : 0.9)
      : 1;
    // ślizg bez klatek ślizgu: przysiad wizualny
    if (this.sliding) this.sprite.setScale(1.15, 0.62);
  }

  private playAnim(kind: 'idle' | 'run' | 'jump' | 'fall'): void {
    const s = this.sprite;
    if (this.charId === 'VEGA') {
      s.play(`vega-${kind}`, true);
      return;
    }
    if (TOSIA_VARIANT === 'frog') {
      s.play(`tosia-frog-${kind}`, true);
      return;
    }
    // Ranger Girl: brak klatek skoku → zamrożona klatka 14 (wykrok) — PRD 4.2
    if (kind === 'jump' || kind === 'fall') {
      s.anims.stop();
      s.setTexture('tosia-ranger', 14);
    } else {
      s.play(kind === 'run' ? 'tosia-run' : 'tosia-idle', true);
    }
  }

  private updateAnim(onGround: boolean, moving: boolean): void {
    if (this.hurtT > 0 || this.attackT > 0) return;   // hit/attack gra do końca
    if (!onGround) this.playAnim(this.body.velocity.y < 0 ? 'jump' : 'fall');
    else this.playAnim(moving ? 'run' : 'idle');
  }

  destroy(): void {
    this.squash?.stop();
    this.carrier.destroy();
    this.sprite.destroy();
  }
}
