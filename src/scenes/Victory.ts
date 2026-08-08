/**
 * Victory — feta po pokonaniu Obsydiana (PRD 5.3 / aneks 9.4 „Zwycięstwo"):
 * fajerwerki w pętli (kolory 213/226/51), Echo obok bohaterki, wpis imienia
 * do tabeli wyników (3–8 znaków, klawiatura ekranowa A–Z ze strzałkami
 * i dotykiem — prostota). Tekst finałowy pokazał już Interlude('finale').
 * Zapis wyłącznie przez core/save.ts; potem Scores z podświetlonym wpisem.
 */
import Phaser from 'phaser';
import { loadSave, localStorageAdapter, writeSave } from '../core/save';
import { TOSIA_VARIANT } from '../entities/Player';
import { addSkyBackdrop, Backdrop, COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark } from '../dev';

const NAME_MIN = 3;
const NAME_MAX = 8;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** siatka 7×4: 26 liter + ⌫ + OK */
const GRID_COLS = 7;
const KEYS: string[] = [...LETTERS.split(''), '⌫', 'OK'];

const FIREWORK_TINTS = [0xff8ac9, 0xffd23f, 0x35e6ff];   // 213 / 226 / 51

export class VictoryScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private name_ = '';
  private sel = 0;
  private nameText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private cells: Array<{ box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }> = [];
  private emStar!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emSpark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private committed = false;
  private campaignScore = 0;

  constructor() {
    super('Victory');
  }

  create() {
    this.name_ = '';
    this.sel = 0;
    this.cells = [];
    this.committed = false;

    const save = loadSave(
      localStorageAdapter() ?? { getItem: () => null, setItem: () => undefined },
    );
    this.campaignScore = save.campaign_score;

    this.backdrop = addSkyBackdrop(this);
    // noc nad wyspą — fajerwerki mają błyszczeć
    this.add.rectangle(320, 180, 640, 360, COLN.night, 0.52);

    if (this.cache.audio.exists('music-victory')
      && !this.sound.get('music-victory')?.isPlaying) {
      this.sound.play('music-victory', { loop: true, volume: 0.45 });
    }

    // fajerwerki: pętla salw w górnej połowie (aneks 9.4, kolory 213/226/51)
    this.emStar = this.add.particles(0, 0, 'p-star', {
      speed: { min: 50, max: 200 }, gravityY: 90,
      lifespan: { min: 600, max: 1400 }, rotate: { start: 0, end: 360 },
      scale: { start: 0.9, end: 0.15 }, alpha: { start: 1, end: 0 },
      tint: FIREWORK_TINTS, emitting: false,
    }).setDepth(5);
    this.emSpark = this.add.particles(0, 0, 'p-spark', {
      speed: { min: 70, max: 230 }, lifespan: { min: 300, max: 700 },
      scale: { start: 0.6, end: 0 }, alpha: { start: 1, end: 0 },
      tint: FIREWORK_TINTS,
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(5);
    this.time.addEvent({
      delay: 550, loop: true, callback: () => this.firework(),
    });
    this.firework();
    this.firework();

    this.add.text(320, 34, 'ZWYCIĘSTWO!', {
      fontFamily: FONT_TITLE, fontSize: '26px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(320, 62, `Wynik kampanii: ${this.campaignScore}`, {
      fontFamily: FONT_UI, fontSize: '15px', color: COL.white,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);

    // Echo obok bohaterki (aneks 9.4) — kibicują przy wpisie
    const heroKey = save.character === 'VEGA' ? 'vega-idle'
      : TOSIA_VARIANT === 'ranger' ? 'tosia-ranger' : 'tosia-frog-idle';
    const heroAnim = save.character === 'VEGA' ? 'vega-idle'
      : TOSIA_VARIANT === 'ranger' ? 'tosia-idle' : 'tosia-frog-idle';
    const heroScale = save.character === 'VEGA' ? 1.6 : 2;
    this.add.ellipse(76, 344, 96, 12, 0x000000, 0.3);
    this.add.sprite(60, 342, heroKey, 0).setOrigin(0.5, 1).setScale(heroScale)
      .play(heroAnim);
    const echo = this.add.sprite(112, 342, 'echo-idle', 0)
      .setOrigin(0.5, 1).setScale(1.6);
    echo.play('echo-idle');
    this.tweens.add({
      targets: echo, y: 334, duration: 420, yoyo: true, repeat: -1,
      ease: 'Sine.inOut',
    });

    // panel wpisu imienia
    this.add.nineslice(384, 216, 'ui-panel', undefined, 400, 250, 6, 6, 6, 6);
    this.add.text(384, 112, `WPISZ IMIĘ ŁOWCZYNI (${NAME_MIN}–${NAME_MAX} znaków)`, {
      fontFamily: FONT_UI, fontSize: '14px', color: COL.ink,
    }).setOrigin(0.5);
    this.nameText = this.add.text(384, 140, '', {
      fontFamily: FONT_TITLE, fontSize: '18px', color: COL.goldDark,
    }).setOrigin(0.5);
    this.time.addEvent({
      delay: 350, loop: true, callback: () => this.refreshName(),
    });

    // klawiatura ekranowa A–Z + ⌫ + OK (strefy ≥ 40 px — proste kafle)
    const cellW = 46;
    const cellH = 38;
    const x0 = 384 - ((GRID_COLS - 1) * cellW) / 2;
    const y0 = 176;
    for (let i = 0; i < KEYS.length; i++) {
      const cx = x0 + (i % GRID_COLS) * cellW;
      const cy = y0 + Math.floor(i / GRID_COLS) * cellH;
      const box = this.add.rectangle(cx, cy, cellW - 6, cellH - 6, 0xffffff, 0.15)
        .setStrokeStyle(2, COLN.gold, 0)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(cx, cy, KEYS[i], {
        fontFamily: FONT_TITLE, fontSize: KEYS[i].length > 1 ? '11px' : '13px',
        color: COL.ink,
      }).setOrigin(0.5);
      box.on('pointerdown', () => {
        this.sel = i;
        this.refreshGrid();
        this.activate(i);
      });
      this.cells.push({ box, label });
    }

    this.hintText = this.add.text(384, 326,
      '[←→↑↓] wybierz   [SPACJA] wpisz   [ENTER] zatwierdź', {
        fontFamily: FONT_UI, fontSize: '12px', color: COL.dim,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5);

    // klawiatura fizyczna: litery wprost, strzałki po siatce
    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.refreshGrid();
    this.refreshName();
    devMark({ scene: 'Victory', nameLen: 0 });
  }

  private firework(): void {
    const x = 50 + Math.random() * 540;
    const y = 25 + Math.random() * 130;
    this.emStar.explode(16, x, y);
    this.emSpark.explode(20, x, y);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.committed) return;
    const k = e.key;
    if (/^[a-z]$/i.test(k)) {
      this.append(k.toUpperCase());
      return;
    }
    switch (k) {
      case 'Backspace':
        this.name_ = this.name_.slice(0, -1);
        this.refreshName();
        break;
      case 'ArrowLeft':
        this.move(-1);
        break;
      case 'ArrowRight':
        this.move(1);
        break;
      case 'ArrowUp':
        this.move(-GRID_COLS);
        break;
      case 'ArrowDown':
        this.move(GRID_COLS);
        break;
      case ' ':
        this.activate(this.sel);
        break;
      case 'Enter':
        this.commit();
        break;
      default:
        break;
    }
  }

  private move(d: number): void {
    const next = this.sel + d;
    if (next < 0 || next >= KEYS.length) return;
    this.sel = next;
    this.sound.play('sfx-ui-click', { volume: 0.25 });
    this.refreshGrid();
  }

  private activate(i: number): void {
    const key = KEYS[i];
    if (key === 'OK') {
      this.commit();
    } else if (key === '⌫') {
      this.name_ = this.name_.slice(0, -1);
      this.sound.play('sfx-ui-click', { volume: 0.3 });
      this.refreshName();
    } else {
      this.append(key);
    }
  }

  private append(letter: string): void {
    if (this.name_.length >= NAME_MAX) return;
    this.name_ += letter;
    this.sound.play('sfx-ui-click', { volume: 0.3 });
    this.refreshName();
    devMark({ nameLen: this.name_.length });
  }

  private refreshName(): void {
    const cursor = this.name_.length < NAME_MAX
      && Math.floor(this.time.now / 350) % 2 === 0 ? '_' : ' ';
    this.nameText.setText(`${this.name_}${cursor}`);
    this.refreshGrid();   // OK rozjaśnia się od 3 znaków
  }

  private refreshGrid(): void {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const selected = i === this.sel;
      c.box.setFillStyle(0xffffff, selected ? 0.45 : 0.15);
      c.box.setStrokeStyle(2, COLN.gold, selected ? 1 : 0);
      c.label.setColor(selected ? COL.goldDark : COL.ink);
      // OK aktywny dopiero od 3 znaków
      if (KEYS[i] === 'OK') {
        c.label.setAlpha(this.name_.length >= NAME_MIN ? 1 : 0.35);
      }
    }
  }

  /** wpis do highscores (v1 commit_highscore: score = wynik kampanii,
   *  gwiazdki = suma gwiazdek poziomów, top 5) */
  private commit(): void {
    if (this.committed) return;
    if (this.name_.length < NAME_MIN) {
      this.hintText.setText(`Imię musi mieć co najmniej ${NAME_MIN} znaki!`);
      this.hintText.setColor(COL.danger);
      this.tweens.add({
        targets: this.hintText, scale: 1.2, duration: 100, yoyo: true, repeat: 1,
      });
      return;
    }
    this.committed = true;
    const st = localStorageAdapter();
    const save = loadSave(st ?? { getItem: () => null, setItem: () => undefined });
    const stars = Object.values(save.levels)
      .reduce((sum, l) => sum + (l.stars ?? 0), 0);
    const entry = { name: this.name_, score: save.campaign_score, stars };
    save.highscores.push(entry);
    save.highscores.sort((a, b) => b.score - a.score);
    save.highscores = save.highscores.slice(0, 5);
    if (st) writeSave(st, save);
    this.sound.play('sfx-fanfare', { volume: 0.5 });
    this.sound.stopByKey('music-victory');
    devMark({ scene: 'Victory', committed: true, nameLen: this.name_.length });
    this.scene.start('Scores', { highlight: { name: entry.name, score: entry.score } });
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
