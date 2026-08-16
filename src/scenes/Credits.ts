/**
 * AUTORZY — przewijana lista kredytów (CREDITS_DATA z texts.ts, przepisane
 * z CREDITS.md). Auto-scroll + [↑↓] ręcznie; powrót ESC / tap.
 * Przycięcie listy do okna panelu: osobna kamera z viewportem (maski
 * geometryczne nie działają w WebGL Phasera 4) — treść leży poza kadrem
 * kamery głównej (offset świata +2000 px) i widzi ją tylko kamera okna.
 */
import Phaser from 'phaser';
import { CREDITS_DATA, CREDITS_THANKS } from '../data/texts';
import { addSkyBackdrop, Backdrop, COL, FONT_TITLE, FONT_UI } from '../ui/theme';
import { applyHiRes, RENDER_SCALE } from '../ui/hiRes';
import { devMark } from '../dev';

const VIEW_TOP = 78;
const VIEW_H = 234;
const VIEW_X = 96;
const VIEW_W = 448;
/** offset świata treści — poza kadrem kamery głównej */
const OFF_X = 2000;
const PAD = 12;
/** zoom ×2 (hi-res): scroll kamery ma semantykę „środek minus pół viewportu",
 *  więc scrollY = górna krawędź okna − VIEW_H/2 (analogicznie X) */
const LIST_SCROLL_OFF_Y = VIEW_H / 2;

export class CreditsScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private listCam!: Phaser.Cameras.Scene2D.Camera;
  private contentH = 0;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private autoDelay = 0;

  constructor() {
    super('Credits');
  }

  create() {
    applyHiRes(this);
    this.backdrop = addSkyBackdrop(this);

    this.add.text(320, 40, 'AUTORZY', {
      fontFamily: FONT_TITLE, fontSize: '20px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.nineslice(320, VIEW_TOP + VIEW_H / 2, 'ui-panel', undefined,
      VIEW_W + 12, VIEW_H + 20, 6, 6, 6, 6);

    // treść w świecie na x = OFF_X (kamera główna jej nie widzi)
    const cx = OFF_X + VIEW_W / 2;
    let y = 0;
    for (const section of CREDITS_DATA) {
      this.add.text(cx, y, section.header, {
        fontFamily: FONT_TITLE, fontSize: '12px', color: COL.goldDark,
      }).setOrigin(0.5, 0);
      y += 24;
      for (const e of section.entries) {
        this.add.text(cx, y, e.name, {
          fontFamily: FONT_UI, fontSize: '16px', color: COL.ink,
        }).setOrigin(0.5, 0);
        y += 19;
        this.add.text(cx, y, `${e.author} · ${e.license}`, {
          fontFamily: FONT_UI, fontSize: '12px', color: COL.ink,
        }).setOrigin(0.5, 0).setAlpha(0.65);
        y += 22;
      }
      y += 12;
    }
    this.add.text(cx, y, `♥ ${CREDITS_THANKS} ♥`, {
      fontFamily: FONT_UI, fontSize: '15px', color: COL.goldDark,
    }).setOrigin(0.5, 0);
    y += 26;
    this.contentH = y;

    // kamera-okno: widzi tylko obszar treści (viewport w px canvasa = ×2)
    this.listCam = this.cameras.add(
      VIEW_X * RENDER_SCALE, VIEW_TOP * RENDER_SCALE,
      VIEW_W * RENDER_SCALE, VIEW_H * RENDER_SCALE,
    );
    this.listCam.setZoom(RENDER_SCALE);
    this.listCam.setScroll(OFF_X - VIEW_W / 2, -PAD - LIST_SCROLL_OFF_Y);

    const hint = this.add.text(320, 344, '[↑↓] przewiń      [ESC] powrót', {
      fontFamily: FONT_UI, fontSize: '12px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });

    const back = () => {
      this.sound.play('sfx-ui-click', { volume: 0.4 });
      this.scene.start('Menu');
    };
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    kb.once('keydown-ESC', back);
    kb.once('keydown-ENTER', back);
    this.input.once('pointerdown', back);
    this.autoDelay = 1200;
    devMark({ scene: 'Credits' });
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
    const minScroll = -PAD - LIST_SCROLL_OFF_Y;
    const maxScroll = Math.max(minScroll, this.contentH - VIEW_H + PAD - LIST_SCROLL_OFF_Y);
    if (this.cursors.up.isDown) {
      this.listCam.scrollY = Math.max(minScroll, this.listCam.scrollY - (90 * delta) / 1000);
      this.autoDelay = 2000;
    } else if (this.cursors.down.isDown) {
      this.listCam.scrollY = Math.min(maxScroll, this.listCam.scrollY + (90 * delta) / 1000);
      this.autoDelay = 2000;
    } else if (this.autoDelay > 0) {
      this.autoDelay -= delta;
    } else {
      // powolny auto-scroll do końca listy
      this.listCam.scrollY = Math.min(maxScroll, this.listCam.scrollY + (14 * delta) / 1000);
    }
  }
}
