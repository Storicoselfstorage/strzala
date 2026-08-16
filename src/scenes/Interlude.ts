/**
 * Interlude — scenki fabularne (PRD 5.3): INTRO_LINES / WORLD_TRANSITIONS /
 * FINALE_LINES z texts.ts w dymku-panelu, litery pojawiają się po jednej
 * (maszyna do pisania), SPACJA/tap = dokończ linię / następna linia.
 * Portret mówiącego (wycinek sprite'a ×3) wg prefiksu linii (Vega:/Tosia:/
 * Vabank), narratorem jest Echo. Obejrzane scenki → save.interludes_seen.
 */
import Phaser from 'phaser';
import { loadSave, localStorageAdapter, writeSave } from '../core/save';
import { FINALE_LINES, INTRO_LINES, WORLD_TRANSITIONS } from '../data/texts';
import { addSkyBackdrop, Backdrop, COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';
import { speakText, stopSpeech } from '../ui/speak';
import { devMark } from '../dev';
import { applyHiRes } from '../ui/hiRes';

export type InterludeId = 'intro' | 'after-1-3' | 'after-2-3' | 'finale';

export interface InterludeData {
  id?: InterludeId;
  /** scena po scence (domyślnie WorldMap) */
  next?: string;
}

type Speaker = 'TOSIA' | 'VEGA' | 'ECHO' | 'VABANK';

const HEADERS: Record<InterludeId, string> = {
  intro: 'JAK TO SIĘ ZACZĘŁO',
  'after-1-3': 'PRZED WAMI: DŻUNGLA ECH',
  'after-2-3': 'PRZED WAMI: OBSYDIANOWA GÓRA',
  finale: 'KONIEC PRZYGODY',
};

interface PortraitDef {
  texture: string;
  frame: number;
  anim: string;
  scale: number;
}

const PORTRAITS: Record<Speaker, PortraitDef> = {
  TOSIA: { texture: 'tosia-ranger', frame: 0, anim: 'tosia-idle', scale: 3 },
  VEGA: { texture: 'vega-idle', frame: 0, anim: 'vega-idle', scale: 2 },
  ECHO: { texture: 'echo-idle', frame: 0, anim: 'echo-idle', scale: 3 },
  VABANK: { texture: 'vabank-idle', frame: 0, anim: 'vabank-idle', scale: 3 },
};

function speakerOf(line: string): Speaker {
  if (line.startsWith('Vega:')) return 'VEGA';
  if (line.startsWith('Tosia:')) return 'TOSIA';
  if (line.startsWith('Vabank')) return 'VABANK';
  return 'ECHO';   // narratorka-zwiadowczyni
}

export class InterludeScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private id: InterludeId = 'intro';
  private next = 'WorldMap';
  private lines: string[] = [];
  private lineIdx = 0;
  private shown = 0;
  private typing = false;
  private lineText!: Phaser.GameObjects.Text;
  private portraits!: Record<Speaker, Phaser.GameObjects.Sprite>;
  private dots: Phaser.GameObjects.Image[] = [];
  private typeTimer: Phaser.Time.TimerEvent | null = null;
  private finished = false;

  constructor() {
    super('Interlude');
  }

  init(data: InterludeData) {
    this.id = data.id ?? 'intro';
    this.next = data.next ?? 'WorldMap';
  }

  create() {
    applyHiRes(this);
    this.lineIdx = 0;
    this.shown = 0;
    this.typing = false;
    this.finished = false;
    this.dots = [];

    this.backdrop = addSkyBackdrop(this);
    // przyciemnienie — nastrój opowieści
    this.add.rectangle(320, 180, 640, 360, COLN.night, 0.38);

    this.add.text(320, 52, HEADERS[this.id], {
      fontFamily: FONT_TITLE, fontSize: '14px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 4,
    }).setOrigin(0.5);

    this.lines = this.id === 'intro' ? INTRO_LINES
      : this.id === 'finale' ? FINALE_LINES
        : WORLD_TRANSITIONS[this.id] ?? [];

    // kropki postępu linii
    for (let i = 0; i < this.lines.length; i++) {
      const dot = this.add.image(320 + (i - (this.lines.length - 1) / 2) * 18, 78, 'p-circle-small')
        .setScale(0.35).setTint(COLN.gold).setAlpha(0.3);
      this.dots.push(dot);
    }

    // dymek + portret
    this.add.nineslice(376, 302, 'ui-panel-brown', undefined, 460, 96, 6, 6, 6, 6);
    this.add.ellipse(86, 348, 60, 10, 0x000000, 0.3);
    this.portraits = {} as Record<Speaker, Phaser.GameObjects.Sprite>;
    for (const key of Object.keys(PORTRAITS) as Speaker[]) {
      const p = PORTRAITS[key];
      const s = this.add.sprite(86, 348, p.texture, p.frame)
        .setOrigin(0.5, 1).setScale(p.scale).setVisible(false);
      s.play(p.anim);
      this.portraits[key] = s;
    }

    this.lineText = this.add.text(170, 268, '', {
      fontFamily: FONT_UI, fontSize: '16px', color: COL.white,
      stroke: COL.ink, strokeThickness: 3,
      wordWrap: { width: 412 }, lineSpacing: 5,
    }).setOrigin(0, 0);

    const hint = this.add.text(596, 338, '[SPACJA] dalej ▸', {
      fontFamily: FONT_UI, fontSize: '12px', color: COL.cyan,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(1, 0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 550, yoyo: true, repeat: -1 });

    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.advance());
    kb.on('keydown-ENTER', () => this.advance());
    this.input.on('pointerdown', () => this.advance());

    if (this.lines.length === 0) {
      this.finish();
      return;
    }
    this.startLine(0);
  }

  private startLine(i: number): void {
    this.lineIdx = i;
    this.shown = 0;
    this.typing = true;
    this.lineText.setText('');
    speakText(this, this.lines[i]);   // lektor czyta równolegle z maszyną
    const speaker = speakerOf(this.lines[i]);
    for (const key of Object.keys(this.portraits) as Speaker[]) {
      this.portraits[key].setVisible(key === speaker);
    }
    for (let d = 0; d < this.dots.length; d++) {
      this.dots[d].setAlpha(d <= i ? 0.95 : 0.3);
      this.dots[d].setScale(d === i ? 0.5 : 0.35);
    }
    this.typeTimer?.remove();
    this.typeTimer = this.time.addEvent({
      delay: 30, loop: true, callback: () => this.tick(),
    });
    devMark({ scene: 'Interlude', interludeId: this.id, line: i });
  }

  private tick(): void {
    const line = this.lines[this.lineIdx];
    if (this.shown < line.length) {
      this.shown++;
      this.lineText.setText(line.slice(0, this.shown));
    } else {
      this.typing = false;
      this.typeTimer?.remove();
      this.typeTimer = null;
    }
  }

  private advance(): void {
    if (this.finished) return;
    const line = this.lines[this.lineIdx];
    if (this.typing) {
      // dokończ linię
      this.typing = false;
      this.typeTimer?.remove();
      this.typeTimer = null;
      this.shown = line.length;
      this.lineText.setText(line);
      return;
    }
    if (this.lineIdx + 1 < this.lines.length) {
      this.sound.play('sfx-ui-click', { volume: 0.3 });
      this.startLine(this.lineIdx + 1);
    } else {
      this.finish();
    }
  }

  private finish(): void {
    this.finished = true;
    stopSpeech();
    const st = localStorageAdapter();
    if (st) {
      const save = loadSave(st);
      if (!save.interludes_seen.includes(this.id)) {
        save.interludes_seen.push(this.id);
        writeSave(st, save);
      }
    }
    this.sound.play('sfx-ui-click', { volume: 0.5 });
    this.scene.start(this.next);
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
