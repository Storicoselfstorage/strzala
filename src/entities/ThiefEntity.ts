/**
 * Złodziejaszek — render (Mask Dude) nad logiką core/thief.ts.
 * Scena woła update() z env; encja tylko rysuje: bieg, ikona łupu nad głową
 * (plecak przy pakiecie, strzała przy pojedynczej — Vega), kropelka potu
 * w stanie tired, animacja grzebania w stanie dig.
 */
import Phaser from 'phaser';
import { TILE } from '../core/balance';
import { Loot, Thief, ThiefEnv, ThiefEvent } from '../core/thief';

export class ThiefEntity {
  readonly logic: Thief;
  readonly sprite: Phaser.GameObjects.Sprite;
  private lootIcon: Phaser.GameObjects.Image | null = null;
  private sweat: Phaser.GameObjects.Image | null = null;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, logic: Thief) {
    this.scene = scene;
    this.logic = logic;
    this.sprite = scene.add
      .sprite(logic.x + TILE / 2, logic.y + 2 * TILE, 'thief-run', 0)
      .setOrigin(0.5, 1)
      .setDepth(-14);
    this.sprite.play('thief-run');
  }

  update(dt: number, env: ThiefEnv): ThiefEvent[] {
    const events = this.logic.update(dt, env);
    const l = this.logic;
    this.sprite.x = l.x + TILE / 2;
    this.sprite.y = l.y + 2 * TILE + 0.5;
    const dir = l.state === 'approach'
      ? (env.playerX > l.x ? 1 : -1)
      : l.dirOut;
    this.sprite.setFlipX(dir < 0);
    if (l.state === 'dig') {
      // grzebanie: przysiad + drganie (bez dedykowanych klatek — PRD 4.2)
      this.sprite.anims.stop();
      this.sprite.setTexture('thief-idle', 0);
      const wob = Math.floor(this.scene.time.now / 90) % 2 === 0;
      this.sprite.setScale(1.1, wob ? 0.72 : 0.66);
    } else {
      this.sprite.setScale(1, 1);
      if (this.sprite.anims.currentAnim?.key !== 'thief-run') {
        this.sprite.play('thief-run', true);
      }
    }
    if (this.lootIcon) {
      this.lootIcon.x = this.sprite.x;
      this.lootIcon.y = this.sprite.y - 40 + Math.sin(this.scene.time.now / 120) * 2;
    }
    // kropelka potu w stanie tired (spec playtest2)
    if (l.state === 'tired' || l.state === 'dig') {
      if (!this.sweat) {
        this.sweat = this.scene.add.image(0, 0, 'p-circle-small')
          .setTint(0x35e6ff).setScale(0.45).setDepth(-13);
      }
      this.sweat.setPosition(
        this.sprite.x + (dir < 0 ? 8 : -8),
        this.sprite.y - 34 + Math.abs(Math.sin(this.scene.time.now / 180)) * 3,
      );
      this.sweat.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(this.scene.time.now / 250)));
    }
    return events;
  }

  /** po kradzieży: ikona łupu nad głową — plecak (pakiet) albo strzała (Vega) */
  showLoot(loot: Loot): void {
    this.lootIcon?.destroy();
    const single = loot.arrows <= 1 && loot.magic === 0
      && loot.diamonds === 0 && !loot.hasCake;
    this.lootIcon = this.scene.add
      .image(this.sprite.x, this.sprite.y - 40, single ? 'arrow' : 'thief-backpack')
      .setDepth(-13);
    if (single) this.lootIcon.setRotation(-Math.PI / 4);
  }

  rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.logic.x + 3, y: this.logic.y + 6, w: TILE - 6, h: 2 * TILE - 6 };
  }

  destroy(): void {
    this.lootIcon?.destroy();
    this.sweat?.destroy();
    this.sprite.destroy();
  }
}
