/**
 * Echo (małpa-zwiadowczyni) — render nad logiką core/monkey.ts.
 * Stan 'waiting' (znak `M` w 1-1): siedzi i czeka na podejście — poza core,
 * bo to skrypt sceny 1-1; po dołączeniu steruje wyłącznie core.Echo.
 */
import Phaser from 'phaser';
import { Echo, EchoEnv, EchoEvent } from '../core/monkey';
import { COL, FONT_TITLE } from '../ui/theme';

// ── skok nad hazardem naziemnym (zgłoszenie z playtestu rodzinnego: Echo
// „stawała jak słupek" przed kolcami albo przez nie przenikała) ─────────────
// Czysto wizualny łuk w warstwie sceny: core/monkey.ts dalej prowadzi x/y po
// gruncie, my tylko odejmujemy offset łuku od sprite.y. Echo jest nieśmiertelna
// — skok to czytelność i urok, nie mechanika obrażeń.
/** czas skoku = 4 klatki animacji 'echo-jump' @ 8 fps */
const ECHO_JUMP_DUR = 0.5;
/** apex łuku (px) — nad kaktus 2-kratkowy (32 px) */
const ECHO_JUMP_H = 30;
/** histereza: cooldown po lądowaniu, żeby nie skakała w kółko nerwowo */
const ECHO_JUMP_CD = 0.8;
/**
 * Zerwanie skoku przy skokowej zmianie x — tak duży krok w 1 klatce robi tylko
 * teleport core (ECHO_TELEPORT_DIST); normalny bieg to ~4 px/klatkę.
 */
const ECHO_JUMP_TELEPORT_STEP = 5 * 16;

export class EchoEntity {
  readonly logic: Echo;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** czeka na znaku `M` (tylko 1-1) — logika core nieaktywna do dołączenia */
  waiting: boolean;
  private readonly bang: Phaser.GameObjects.Text;
  private hopTween?: Phaser.Tweens.Tween;
  private hopOffset = { v: 0 };
  /** ruch x w ostatniej klatce (px) — scena decyduje z niego o skoku */
  lastStepX = 0;
  /** czas trwającego skoku; −1 = brak skoku */
  private jumpT = -1;
  private jumpCd = 0;
  private onJumpLand?: (x: number, y: number) => void;

  constructor(scene: Phaser.Scene, xPx: number, feetY: number, waiting: boolean) {
    this.logic = new Echo(xPx, feetY);
    this.waiting = waiting;
    this.sprite = scene.add
      .sprite(xPx, feetY + 1, 'echo-idle', 0)
      .setOrigin(0.5, 1)
      .setDepth(-15);
    this.sprite.play('echo-idle');
    this.bang = scene.add
      .text(xPx, feetY - 40, '!', {
        fontFamily: FONT_TITLE, fontSize: '14px', color: COL.danger,
        stroke: COL.ink, strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);
  }

  update(dt: number, env: EchoEnv): EchoEvent[] {
    if (this.waiting) {
      this.sprite.play('echo-idle', true);
      return [];
    }
    const prevX = this.logic.x;
    const events = this.logic.update(dt, env);
    const l = this.logic;
    this.lastStepX = l.x - prevX;
    // teleport core (dystans > ECHO_TELEPORT_DIST) → utnij skok bez lądowania
    if (Math.abs(this.lastStepX) > ECHO_JUMP_TELEPORT_STEP) this.cancelJump();
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    let jumpOff = 0;
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT >= ECHO_JUMP_DUR) {
        const land = this.onJumpLand;
        this.cancelJump();
        this.jumpCd = ECHO_JUMP_CD;
        land?.(l.x, l.y);
      } else {
        jumpOff = ECHO_JUMP_H * Math.sin((Math.PI * this.jumpT) / ECHO_JUMP_DUR);
      }
    }
    this.sprite.x = l.x;
    this.sprite.y = l.y + 1 - this.hopOffset.v - jumpOff;
    if (this.jumpT < 0) {
      const moving = l.state === 'fleeing'
        || (l.state === 'follow' && Math.abs(env.playerX - l.x) > 52);
      this.sprite.play(moving ? 'echo-run' : 'echo-idle', true);
    }
    if (l.state === 'follow') this.sprite.setFlipX(env.playerFacing < 0);
    this.bang.setVisible(l.whistle > 0);
    this.bang.x = l.x;
    this.bang.y = this.sprite.y - 40;
    return events;
  }

  get jumping(): boolean {
    return this.jumpT >= 0;
  }

  /**
   * Start skoku nad hazardem (scena wykryła kaktus/kolce w pasie przed Echo).
   * Odmawia w trakcie skoku i w cooldownie (histereza — bez nerwowego
   * podskakiwania przy hazardzie tuż obok celu podążania).
   */
  tryJump(onLand: (x: number, y: number) => void): boolean {
    if (this.jumpT >= 0 || this.jumpCd > 0) return false;
    this.jumpT = 0;
    this.onJumpLand = onLand;
    this.sprite.play('echo-jump');
    return true;
  }

  private cancelJump(): void {
    this.jumpT = -1;
    this.onJumpLand = undefined;
  }

  /** gwizd: podskok w miejscu + `!` (render; SFX gra scena) */
  hop(scene: Phaser.Scene): void {
    this.hopTween?.stop();
    this.hopOffset.v = 0;
    this.hopTween = scene.tweens.add({
      targets: this.hopOffset, v: 10, duration: 130,
      yoyo: true, repeat: 2, ease: 'Sine.out',
    });
  }

  destroy(): void {
    this.hopTween?.stop();
    this.bang.destroy();
    this.sprite.destroy();
  }
}
