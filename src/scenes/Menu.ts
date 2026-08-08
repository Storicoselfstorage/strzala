/**
 * Menu główne (aneks 9.4): GRAJ / TRYB SKRZAT / WYNIKI / AUTORZY — wszystkie
 * aktywne. GRAJ: świeży profil → wybór bohaterki; rozpoczęta kampania
 * (intro obejrzane) → od razu mapa świata. TRYB SKRZAT: przełącznik
 * zapisywany w save (aneks 8.7). Uruchamia też nakładkę TouchControls.
 */
import Phaser from 'phaser';
import { loadSave, localStorageAdapter, SaveData, writeSave } from '../core/save';
import { addSkyBackdrop, Backdrop, COL, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark } from '../dev';

export class MenuScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private items: Phaser.GameObjects.Text[] = [];
  private selected = 0;
  private save!: SaveData;
  private tosia!: Phaser.GameObjects.Sprite;

  constructor() {
    super('Menu');
  }

  create() {
    this.backdrop = addSkyBackdrop(this);
    this.items = [];
    this.selected = 0;
    this.save = loadSave(
      localStorageAdapter() ?? { getItem: () => null, setItem: () => undefined },
    );
    this.sound.mute = this.save.muted;
    if (this.cache.audio.exists('music-menu') && !this.sound.get('music-menu')?.isPlaying) {
      this.sound.play('music-menu', { loop: true, volume: 0.6 });
    }

    // nakładka dotykowa żyje przez całą sesję (pokazuje się tylko w Level)
    if (!this.scene.isActive('TouchControls')) this.scene.launch('TouchControls');

    this.add.text(320, 64, 'STRZA/ŁA', {
      fontFamily: FONT_TITLE, fontSize: '34px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(320, 96, 'Łowczynie Smoków', {
      fontFamily: FONT_UI, fontSize: '16px', color: COL.white,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.nineslice(320, 208, 'ui-panel', undefined, 280, 172, 6, 6, 6, 6);

    for (let i = 0; i < 4; i++) {
      const y = 154 + i * 36;
      const text = this.add.text(320, y, this.baseLabel(i), {
        fontFamily: FONT_UI, fontSize: '19px', color: COL.ink,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => {
        this.selected = i;
        this.refresh();
        this.confirm();
      });
      this.items.push(text);
    }

    // maskotki: Tosia biegnie w miejscu, Echo kibicuje
    this.tosia = this.add.sprite(160, 292, 'tosia-ranger', 0).setOrigin(0.5, 1).setScale(2);
    this.tosia.play('tosia-run');
    this.add.sprite(488, 296, 'echo-idle', 0).setOrigin(0.5, 1).setScale(1.6).play('echo-idle');

    const hint = this.add.text(320, 330, '[↑↓] wybierz      [SPACJA] ok', {
      fontFamily: FONT_UI, fontSize: '14px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ENTER', () => this.confirm());
    this.refresh();
    devMark({ scene: 'Menu' });
  }

  private baseLabel(i: number): string {
    return [
      'GRAJ',
      `TRYB SKRZAT: ${this.save.skrzat ? 'WŁ' : 'WYŁ'}`,
      'WYNIKI',
      'AUTORZY',
    ][i];
  }

  private move(d: number): void {
    this.selected = (this.selected + d + this.items.length) % this.items.length;
    this.sound.play('sfx-ui-click', { volume: 0.35 });
    this.refresh();
  }

  private refresh(): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const sel = i === this.selected;
      it.setText(sel ? `► ${this.baseLabel(i)} ◄` : this.baseLabel(i));
      it.setColor(sel ? COL.gold : COL.ink);
      it.setStroke(COL.ink, sel ? 4 : 0);
    }
    devMark({ menuSel: this.selected });
  }

  private confirm(): void {
    this.sound.play('sfx-ui-click', { volume: 0.5 });
    switch (this.selected) {
      case 0:
        this.startGame();
        break;
      case 1:
        this.toggleSkrzat();
        break;
      case 2:
        this.scene.start('Scores');
        break;
      case 3:
        this.scene.start('Credits');
        break;
    }
  }

  /** kampania rozpoczęta (intro obejrzane) → prosto na mapę świata */
  private startGame(): void {
    if (this.save.interludes_seen.includes('intro')) {
      this.scene.start('WorldMap');
    } else {
      this.scene.start('CharSelect');
    }
  }

  private toggleSkrzat(): void {
    this.save.skrzat = !this.save.skrzat;
    const st = localStorageAdapter();
    if (st) writeSave(st, this.save);
    const it = this.items[1];
    this.tweens.add({ targets: it, scale: 1.15, duration: 90, yoyo: true });
    this.refresh();
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
