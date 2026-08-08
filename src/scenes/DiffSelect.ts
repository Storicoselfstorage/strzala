/**
 * Wybór trudności (aneks 8.7): ŁATWY / NORMALNY / TRUDNY z opisem jednym
 * zdaniem; domyślnie NORMALNY. Zapis w save → start poziomu 1-1.
 */
import Phaser from 'phaser';
import { DifficultyId, DIFFICULTY } from '../core/balance';
import { loadSave, localStorageAdapter, writeSave } from '../core/save';
import { addSkyBackdrop, Backdrop, COL, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark } from '../dev';

const OPTIONS: Array<{ id: DifficultyId; desc: string }> = [
  { id: 'LATWY', desc: 'Więcej serc, wolniejsze smoki.' },
  { id: 'NORMALNY', desc: 'Tak grają łowczynie.' },
  { id: 'TRUDNY', desc: 'Refleks żmii wymagany.' },
];

export class DiffSelectScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private rows: Phaser.GameObjects.Text[] = [];
  private descs: Phaser.GameObjects.Text[] = [];
  private selected = 1;   // domyślnie NORMALNY

  constructor() {
    super('DiffSelect');
  }

  create() {
    this.backdrop = addSkyBackdrop(this);
    this.rows = [];
    this.descs = [];
    this.selected = 1;

    this.add.text(320, 48, 'POZIOM TRUDNOŚCI', {
      fontFamily: FONT_TITLE, fontSize: '18px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 4,
    }).setOrigin(0.5);
    this.add.nineslice(320, 190, 'ui-panel', undefined, 360, 210, 6, 6, 6, 6);

    for (let i = 0; i < OPTIONS.length; i++) {
      const y = 128 + i * 60;
      const row = this.add.text(320, y, DIFFICULTY[OPTIONS[i].id].label, {
        fontFamily: FONT_UI, fontSize: '21px', color: COL.ink,
        stroke: COL.white, strokeThickness: 0,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const desc = this.add.text(320, y + 22, OPTIONS[i].desc, {
        fontFamily: FONT_UI, fontSize: '12px', color: COL.ink,
      }).setOrigin(0.5).setAlpha(0.75);
      row.on('pointerdown', () => {
        if (this.selected === i) this.confirm();
        else this.select(i);
      });
      this.rows.push(row);
      this.descs.push(desc);
    }

    const hint = this.add.text(320, 330, '[↑↓] wybierz      [SPACJA] start', {
      fontFamily: FONT_UI, fontSize: '14px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.select(this.selected - 1));
    kb.on('keydown-DOWN', () => this.select(this.selected + 1));
    kb.on('keydown-W', () => this.select(this.selected - 1));
    kb.on('keydown-S', () => this.select(this.selected + 1));
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ENTER', () => this.confirm());
    this.refresh();
    devMark({ scene: 'DiffSelect' });
  }

  private select(i: number): void {
    const n = (i + OPTIONS.length) % OPTIONS.length;
    if (n === this.selected) return;
    this.selected = n;
    this.sound.play('sfx-ui-click', { volume: 0.4 });
    this.refresh();
  }

  private refresh(): void {
    for (let i = 0; i < this.rows.length; i++) {
      const sel = i === this.selected;
      const label = DIFFICULTY[OPTIONS[i].id].label;
      this.rows[i].setText(sel ? `► ${label} ◄` : label);
      this.rows[i].setColor(sel ? COL.gold : COL.ink);
      this.rows[i].setStroke(sel ? COL.ink : COL.white, sel ? 4 : 0);
      this.rows[i].setScale(sel ? 1.08 : 1);
    }
  }

  private confirm(): void {
    const id = OPTIONS[this.selected].id;
    const st = localStorageAdapter();
    let introSeen = false;
    if (st) {
      const save = loadSave(st);
      save.difficulty = id;
      writeSave(st, save);
      introSeen = save.interludes_seen.includes('intro');
    }
    this.sound.play('sfx-ui-click', { volume: 0.5 });
    // przepływ 4.3: świeży profil → scenka intro, potem mapa świata
    if (introSeen) {
      this.scene.start('WorldMap');
    } else {
      this.scene.start('Interlude', { id: 'intro', next: 'WorldMap' });
    }
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
