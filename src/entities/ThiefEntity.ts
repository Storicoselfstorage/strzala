/**
 * Złodziejaszek — render (Mask Dude) nad logiką core/thief.ts.
 * Scena woła update() z env; encja tylko rysuje: bieg, ikona łupu nad głową,
 * obłoczek przy zniknięciu.
 */
import Phaser from 'phaser';
import { TILE } from '../core/balance';
import { LootKind, Thief, ThiefEnv, ThiefEvent } from '../core/thief';

const LOOT_TEXTURE: Record<LootKind, string> = {
  cake: 'placek',
  arrow: 'arrow',
  diamond: 'diamond',
};

export class ThiefEntity {
  readonly logic: Thief;
  readonly sprite: Phaser.GameObjects.Sprite;
  private lootIcon: Phaser.GameObjects.Image | null = null;
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
    if (this.lootIcon) {
      this.lootIcon.x = this.sprite.x;
      this.lootIcon.y = this.sprite.y - 40 + Math.sin(this.scene.time.now / 120) * 2;
    }
    return events;
  }

  /** po kradzieży: ikona łupu nad głową (aneks 6.2) */
  showLoot(kind: LootKind): void {
    this.lootIcon?.destroy();
    this.lootIcon = this.scene.add
      .image(this.sprite.x, this.sprite.y - 40, LOOT_TEXTURE[kind])
      .setDepth(-13);
    if (kind === 'arrow') this.lootIcon.setRotation(-Math.PI / 4);
  }

  rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.logic.x + 3, y: this.logic.y + 6, w: TILE - 6, h: 2 * TILE - 6 };
  }

  destroy(): void {
    this.lootIcon?.destroy();
    this.sprite.destroy();
  }
}
