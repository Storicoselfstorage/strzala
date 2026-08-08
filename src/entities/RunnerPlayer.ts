/**
 * Bohaterka w fazie RUNNER — czysty widok (bez Arcade): pozycję pionową liczy
 * core/physicsSim (SimState), scena podaje stan co klatkę. Animacje jak
 * w Player.ts (warianty Tosi wg TOSIA_VARIANT), ślizg = przysiad wizualny.
 */
import Phaser from 'phaser';
import { CharacterId } from '../core/balance';
import { TOSIA_VARIANT } from './Player';

export class RunnerPlayerView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly charId: CharacterId;
  private readonly scene: Phaser.Scene;
  iframes = 0;

  constructor(scene: Phaser.Scene, x: number, feetY: number, charId: CharacterId) {
    this.scene = scene;
    this.charId = charId;
    const tex = charId === 'VEGA' ? 'vega-run'
      : TOSIA_VARIANT === 'ranger' ? 'tosia-ranger' : 'tosia-frog-run';
    this.sprite = scene.add.sprite(x, feetY, tex, 0).setOrigin(0.5, 1).setDepth(0);
    this.playAnim('run');
  }

  private playAnim(kind: 'run' | 'jump' | 'fall'): void {
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
      s.play('tosia-run', true);
    }
  }

  /** sync co klatkę: stopy (px), stan lotu/ślizgu, i-frames (miganie) */
  update(dt: number, feetY: number, onGround: boolean, sliding: boolean, vy: number): void {
    this.iframes = Math.max(0, this.iframes - dt);
    this.sprite.y = feetY + 0.5;
    if (!onGround) this.playAnim(vy < 0 ? 'jump' : 'fall');
    else this.playAnim('run');
    // ślizg bez klatek ślizgu: przysiad wizualny (jak Player.syncSprite)
    this.sprite.setScale(sliding ? 1.15 : 1, sliding ? 0.62 : 1);
    this.sprite.alpha = this.iframes > 0
      ? (Math.floor(this.scene.time.now / 50) % 2 === 0 ? 0.35 : 0.9)
      : 1;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
