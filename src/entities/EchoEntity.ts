/**
 * Echo (małpa-zwiadowczyni) — render nad logiką core/monkey.ts.
 * Stan 'waiting' (znak `M` w 1-1): siedzi i czeka na podejście — poza core,
 * bo to skrypt sceny 1-1; po dołączeniu steruje wyłącznie core.Echo.
 */
import Phaser from 'phaser';
import { Echo, EchoEnv, EchoEvent } from '../core/monkey';
import { COL, FONT_TITLE } from '../ui/theme';

export class EchoEntity {
  readonly logic: Echo;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** czeka na znaku `M` (tylko 1-1) — logika core nieaktywna do dołączenia */
  waiting: boolean;
  private readonly bang: Phaser.GameObjects.Text;
  private hopTween?: Phaser.Tweens.Tween;
  private hopOffset = { v: 0 };

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
    const events = this.logic.update(dt, env);
    const l = this.logic;
    this.sprite.x = l.x;
    this.sprite.y = l.y + 1 - this.hopOffset.v;
    const moving = l.state === 'fleeing'
      || (l.state === 'follow' && Math.abs(env.playerX - l.x) > 52);
    this.sprite.play(moving ? 'echo-run' : 'echo-idle', true);
    if (l.state === 'follow') this.sprite.setFlipX(env.playerFacing < 0);
    this.bang.setVisible(l.whistle > 0);
    this.bang.x = l.x;
    this.bang.y = this.sprite.y - 40;
    return events;
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
