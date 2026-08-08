/**
 * Wybór bohaterki — dwie karty (panele Kenney): animowany sprite + imię
 * + statystyki paskami symboli (aneks 9.4). Strzałki + SPACJA lub tap.
 * Wybór zapisywany w save (core/save.ts).
 */
import Phaser from 'phaser';
import { CharacterId } from '../core/balance';
import { loadSave, localStorageAdapter, writeSave } from '../core/save';
import { addSkyBackdrop, Backdrop, COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';
import { TOSIA_VARIANT } from '../entities/Player';
import { devMark } from '../dev';

interface Card {
  id: CharacterId;
  frame: Phaser.GameObjects.Rectangle;
  panel: Phaser.GameObjects.NineSlice;
  sprite: Phaser.GameObjects.Sprite;
  bounce: Phaser.Tweens.Tween;
}

export class CharSelectScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private cards: Card[] = [];
  private selected = 0;

  constructor() {
    super('CharSelect');
  }

  create() {
    this.backdrop = addSkyBackdrop(this);
    this.cards = [];
    this.selected = 0;

    this.add.text(320, 36, 'WYBIERZ ŁOWCZYNIĘ', {
      fontFamily: FONT_TITLE, fontSize: '18px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 4,
    }).setOrigin(0.5);

    this.buildCard('TOSIA', 176, [
      ['szybkość', '►►►►►', COL.gold],
      ['skok', '▲▲▲▲', COL.cyan],
      ['życia', '4', COL.danger],
      ['plecak', 'zwykły', COL.dim],
    ], 'Patrz i ucz się.');
    this.buildCard('VEGA', 464, [
      ['szybkość', '►►►', COL.gold],
      ['skok', '▲▲▲', COL.cyan],
      ['życia', '6', COL.danger],
      ['plecak', 'z zamkiem Θ', COL.dim],
    ], 'Plan B? Ja jestem planem B.');

    const hint = this.add.text(320, 342, '[← →] wybierz      [SPACJA] gotowe', {
      fontFamily: FONT_UI, fontSize: '14px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.select(0));
    kb.on('keydown-RIGHT', () => this.select(1));
    kb.on('keydown-A', () => this.select(0));
    kb.on('keydown-D', () => this.select(1));
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ENTER', () => this.confirm());
    this.refresh();
    devMark({ scene: 'CharSelect' });
  }

  private buildCard(
    id: CharacterId, x: number,
    stats: Array<[string, string, string]>, quote: string,
  ): void {
    const y = 192;
    const frame = this.add.rectangle(x, y, 252, 244)
      .setStrokeStyle(3, COLN.gold, 1).setVisible(false);
    const panel = this.add.nineslice(x, y, 'ui-panel', undefined, 244, 236, 6, 6, 6, 6);
    this.add.text(x, y - 98, id, {
      fontFamily: FONT_TITLE, fontSize: '15px',
      color: id === 'TOSIA' ? COL.pink : COL.cyan,
      stroke: COL.ink, strokeThickness: 4,
    }).setOrigin(0.5);
    // cień + animowany sprite
    this.add.ellipse(x, y - 22, 52, 10, 0x000000, 0.25);
    let sprite: Phaser.GameObjects.Sprite;
    if (id === 'TOSIA') {
      sprite = this.add.sprite(x, y - 24, 'tosia-ranger', 0).setOrigin(0.5, 1).setScale(2);
      sprite.play(TOSIA_VARIANT === 'ranger' ? 'tosia-idle' : 'tosia-frog-idle');
    } else {
      sprite = this.add.sprite(x, y - 22, 'vega-idle', 0).setOrigin(0.5, 1).setScale(1.6);
      sprite.play('vega-idle');
    }
    let sy = y + 4;
    for (const [label, bar, color] of stats) {
      this.add.text(x - 104, sy, label, {
        fontFamily: FONT_UI, fontSize: '14px', color: COL.ink,
      }).setOrigin(0, 0.5);
      this.add.text(x + 104, sy, bar, {
        fontFamily: FONT_UI, fontSize: '14px', color,
        stroke: COL.ink, strokeThickness: 2,
      }).setOrigin(1, 0.5);
      sy += 21;
    }
    this.add.text(x, y + 100, `„${quote}"`, {
      fontFamily: FONT_UI, fontSize: '12px', color: COL.ink,
      fontStyle: 'italic',
    }).setOrigin(0.5);

    const bounce = this.tweens.add({
      targets: sprite, y: sprite.y - 6, duration: 400, yoyo: true, repeat: -1,
      ease: 'Sine.inOut', paused: true,
    });
    const idx = this.cards.length;
    panel.setInteractive({ useHandCursor: true });
    panel.on('pointerdown', () => {
      if (this.selected === idx) this.confirm();
      else this.select(idx);
    });
    this.cards.push({ id, frame, panel, sprite, bounce });
  }

  private select(i: number): void {
    if (this.selected === i) return;
    this.selected = i;
    this.sound.play('sfx-ui-click', { volume: 0.4 });
    this.refresh();
  }

  private refresh(): void {
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const sel = i === this.selected;
      c.frame.setVisible(sel);
      c.panel.setAlpha(sel ? 1 : 0.75);
      c.sprite.setAlpha(sel ? 1 : 0.8);
      if (sel) {
        c.bounce.resume();
      } else {
        c.bounce.pause();
      }
    }
  }

  private confirm(): void {
    const id = this.cards[this.selected].id;
    const st = localStorageAdapter();
    if (st) {
      const save = loadSave(st);
      save.character = id;
      writeSave(st, save);
    }
    this.sound.play('sfx-ui-click', { volume: 0.5 });
    this.scene.start('DiffSelect');
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
