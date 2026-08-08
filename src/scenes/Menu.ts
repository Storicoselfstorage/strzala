/**
 * Menu główne (aneks 9.4): 4 pozycje z ikonami; w wycinku B1 aktywne GRAJ,
 * reszta zamknięta kłódką. Tło z dryfującymi chmurami, panel Kenney.
 */
import Phaser from 'phaser';
import { addSkyBackdrop, Backdrop, COL, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark } from '../dev';

interface MenuItem {
  label: string;
  enabled: boolean;
  text: Phaser.GameObjects.Text;
  lock?: Phaser.GameObjects.Image;
}

export class MenuScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private items: MenuItem[] = [];
  private selected = 0;
  private tosia!: Phaser.GameObjects.Sprite;

  constructor() {
    super('Menu');
  }

  create() {
    this.backdrop = addSkyBackdrop(this);
    this.items = [];
    this.selected = 0;

    this.add.text(320, 64, 'STRZA/ŁA', {
      fontFamily: FONT_TITLE, fontSize: '34px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(320, 96, 'Łowczynie Smoków', {
      fontFamily: FONT_UI, fontSize: '16px', color: COL.white,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.nineslice(320, 208, 'ui-panel', undefined, 260, 172, 6, 6, 6, 6);

    const defs: Array<{ label: string; enabled: boolean }> = [
      { label: 'GRAJ', enabled: true },
      { label: 'TRYB SKRZAT', enabled: false },
      { label: 'WYNIKI', enabled: false },
      { label: 'AUTORZY', enabled: false },
    ];
    for (let i = 0; i < defs.length; i++) {
      const y = 154 + i * 36;
      const text = this.add.text(320, y, defs[i].label, {
        fontFamily: FONT_UI, fontSize: '19px',
        color: defs[i].enabled ? COL.ink : '#8a8398',
      }).setOrigin(0.5);
      let lock: Phaser.GameObjects.Image | undefined;
      if (!defs[i].enabled) {
        lock = this.add.image(320 + text.width / 2 + 16, y, 'ui-lock').setAlpha(0.7);
      } else {
        text.setInteractive({ useHandCursor: true });
        text.on('pointerdown', () => this.startGame());
      }
      this.items.push({ label: defs[i].label, enabled: defs[i].enabled, text, lock });
    }

    // maskotka: Tosia biegnie w miejscu przy panelu
    this.tosia = this.add.sprite(160, 292, 'tosia-ranger', 0).setOrigin(0.5, 1).setScale(2);
    this.tosia.play('tosia-run');
    this.add.sprite(488, 296, 'echo-idle', 0).setOrigin(0.5, 1).setScale(1.6).play('echo-idle');

    const hint = this.add.text(320, 330, '[SPACJA] start', {
      fontFamily: FONT_UI, fontSize: '14px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    this.refresh();
    const kb = this.input.keyboard!;
    kb.once('keydown-SPACE', () => this.startGame());
    kb.once('keydown-ENTER', () => this.startGame());
    devMark({ scene: 'Menu' });
  }

  private refresh(): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const sel = i === this.selected && it.enabled;
      it.text.setText(sel ? `► ${it.label} ◄` : it.label);
      it.text.setColor(sel ? COL.gold : it.enabled ? COL.ink : '#8a8398');
      it.text.setStroke(COL.ink, sel ? 4 : 0);
    }
  }

  private startGame() {
    this.sound.play('sfx-ui-click', { volume: 0.5 });
    this.scene.start('CharSelect');
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
