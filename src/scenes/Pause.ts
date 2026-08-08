/**
 * Pauza — nakładka na zapauzowany Level: WZNÓW / OD NOWA / MENU / MUTE
 * + zawartość plecaka (aneks 9.4: plecak w pauzie).
 */
import Phaser from 'phaser';
import { loadSave, localStorageAdapter, writeSave } from '../core/save';
import { COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';

interface PauseHudState {
  crystals: number; crystalTotal: number;
  arrows: number; magic: number; diamonds: number;
  hasCake: boolean; echoPresent: boolean;
}

export class PauseScene extends Phaser.Scene {
  private levelKey = 'Level';
  private items: Phaser.GameObjects.Text[] = [];
  private selected = 0;

  constructor() {
    super('Pause');
  }

  init(data: { levelKey?: string }) {
    this.levelKey = data.levelKey ?? 'Level';
    this.selected = 0;
    this.items = [];
  }

  create() {
    const level = this.scene.get(this.levelKey) as Phaser.Scene & {
      getHudState(): PauseHudState;
    };
    const st = level.getHudState();

    this.add.rectangle(320, 180, 640, 360, 0x0b0b14, 0.66);
    this.add.nineslice(320, 172, 'ui-panel-brown', undefined, 300, 236, 6, 6, 6, 6);
    this.add.text(320, 84, 'PAUZA', {
      fontFamily: FONT_TITLE, fontSize: '18px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 4,
    }).setOrigin(0.5);

    const labels = ['WZNÓW', 'OD NOWA', 'MENU', this.muteLabel()];
    for (let i = 0; i < labels.length; i++) {
      const t = this.add.text(320, 124 + i * 28, labels[i], {
        fontFamily: FONT_UI, fontSize: '18px', color: COL.white,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => {
        this.selected = i;
        this.confirm();
      });
      this.items.push(t);
    }

    // plecak
    this.add.text(320, 242, 'PLECAK', {
      fontFamily: FONT_UI, fontSize: '13px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    const row = this.add.container(320, 266);
    const entries: Array<{ tex: string; frame?: number; label: string; tint?: number }> = [
      { tex: 'crystal', frame: 0, label: `${st.crystals}/${st.crystalTotal}` },
      { tex: 'arrow', label: `${st.arrows}` },
      { tex: 'arrow-magic', label: `${st.magic}`, tint: COLN.cyan },
      { tex: 'diamond', frame: 0, label: `${st.diamonds}` },
    ];
    if (st.hasCake) entries.push({ tex: 'placek', label: '1' });
    if (st.echoPresent) entries.push({ tex: 'echo-idle', frame: 0, label: 'Echo' });
    // układ dwuwierszowy (ikona nad licznikiem) — bez nachodzenia tekstów
    const spacing = 46;
    let x = -((entries.length - 1) * spacing) / 2;
    for (const e of entries) {
      const icon = this.add.image(x, -8, e.tex, e.frame);
      if (e.tex.startsWith('arrow')) icon.setRotation(-Math.PI / 4);
      if (e.tint) icon.setTint(e.tint);
      if (e.tex === 'echo-idle') icon.setScale(0.7);
      const label = this.add.text(x, 12, e.label, {
        fontFamily: FONT_UI, fontSize: '12px', color: COL.white,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5);
      row.add([icon, label]);
      x += spacing;
    }

    this.add.text(320, 306, '[↑↓] wybierz   [SPACJA] ok   [P] wznów', {
      fontFamily: FONT_UI, fontSize: '12px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-P', () => this.resumeLevel());
    kb.on('keydown-ESC', () => this.resumeLevel());
    kb.on('keydown-M', () => this.toggleMute());
    this.refresh();
  }

  private muteLabel(): string {
    return `DŹWIĘK: ${this.sound.mute ? 'WYŁ' : 'WŁ'}`;
  }

  private move(d: number): void {
    this.selected = (this.selected + d + this.items.length) % this.items.length;
    this.sound.play('sfx-ui-click', { volume: 0.35 });
    this.refresh();
  }

  private refresh(): void {
    for (let i = 0; i < this.items.length; i++) {
      const t = this.items[i];
      const sel = i === this.selected;
      t.setColor(sel ? COL.gold : COL.white);
      t.setText((sel ? '► ' : '') + this.baseLabel(i) + (sel ? ' ◄' : ''));
      t.setScale(sel ? 1.06 : 1);
    }
  }

  private baseLabel(i: number): string {
    return ['WZNÓW', 'OD NOWA', 'MENU', this.muteLabel()][i];
  }

  private confirm(): void {
    this.sound.play('sfx-ui-click', { volume: 0.4 });
    switch (this.selected) {
      case 0:
        this.resumeLevel();
        break;
      case 1: {
        const level = this.scene.get(this.levelKey);
        this.scene.stop();
        level.scene.restart();
        break;
      }
      case 2:
        this.scene.stop(this.levelKey);
        this.scene.stop('HUD');
        this.scene.stop();
        this.scene.start('Menu');
        break;
      case 3:
        this.toggleMute();
        break;
    }
  }

  private toggleMute(): void {
    this.sound.mute = !this.sound.mute;
    const st = localStorageAdapter();
    if (st) {
      const save = loadSave(st);
      save.muted = this.sound.mute;
      writeSave(st, save);
    }
    this.refresh();
  }

  private resumeLevel(): void {
    this.scene.stop();
    this.scene.resume(this.levelKey);
  }
}
