/**
 * HUD — scena-nakładka (launch równolegle z Level). Pasek 40 px nad polem gry.
 * Aktualizacja wyłącznie przez zdarzenia emitowane przez Level (zero sprzężenia
 * zwrotnego: HUD niczego w Level nie woła poza odczytem stanu na starcie).
 */
import Phaser from 'phaser';
import { COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';

interface HudState {
  levelLabel: string;
  hearts: number; maxHearts: number; lives: number;
  crystals: number; crystalTotal: number;
  arrows: number; magic: number; diamonds: number;
  arena?: { name: string; hp: number; maxHp: number; portraitKey: string } | null;
  runner?: { progress: number } | null;
}

interface FlightEvent {
  texture: string; frame?: number;
  sx: number; sy: number;
  target: 'crystal' | 'diamond' | 'arrow' | 'cake';
}

const BAR_H = 40;

export class HUDScene extends Phaser.Scene {
  private levelKey = 'Level';
  private hearts: Phaser.GameObjects.Image[] = [];
  private livesText!: Phaser.GameObjects.Text;
  private badgeText!: Phaser.GameObjects.Text;
  private crystalIcon!: Phaser.GameObjects.Sprite;
  private crystalText!: Phaser.GameObjects.Text;
  private arrowIcon!: Phaser.GameObjects.Image;
  private arrowText!: Phaser.GameObjects.Text;
  private magicText!: Phaser.GameObjects.Text;
  private diamondIcon!: Phaser.GameObjects.Sprite;
  private diamondText!: Phaser.GameObjects.Text;
  private toastBox!: Phaser.GameObjects.Container;
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  // arena
  private arenaBox!: Phaser.GameObjects.Container;
  private hpSegments: Phaser.GameObjects.Rectangle[] = [];
  private arenaName!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private portrait!: Phaser.GameObjects.Sprite;
  private maxHp = 6;
  // runner: pasek postępu (aneks 9.3 — wiersz 1 w runnerze)
  private runnerBox!: Phaser.GameObjects.Container;
  private runnerFill!: Phaser.GameObjects.Rectangle;
  private runnerHead!: Phaser.GameObjects.Sprite;
  /** chevrony biegu »×1–4 obok paska postępu (spec playtest2) */
  private gearText!: Phaser.GameObjects.Text;

  constructor() {
    super('HUD');
  }

  init(data: { levelKey?: string }) {
    this.levelKey = data.levelKey ?? 'Level';
  }

  create() {
    // instancja sceny żyje przez cały czas gry — pola-tablice z poprzedniego
    // uruchomienia trzymają ZNISZCZONE obiekty (regresja: zwiecha przy
    // drugim starcie poziomu, e2e/repro-freeze.spec.ts)
    this.hearts = [];
    this.hpSegments = [];

    const level = this.scene.get(this.levelKey) as Phaser.Scene & {
      getHudState(): HudState;
    };

    // pasek
    this.add.rectangle(320, BAR_H / 2, 640, BAR_H, 0x191430).setDepth(0);
    this.add.nineslice(320, BAR_H / 2, 'ui-panel-brown', undefined, 644, BAR_H + 6, 6, 6, 6, 6)
      .setDepth(1).setAlpha(0.95);
    this.add.rectangle(320, BAR_H - 1, 640, 2, 0x000000, 0.5).setDepth(2);

    const cy = BAR_H / 2;
    // serca + życia
    for (let i = 0; i < 6; i++) {
      this.hearts.push(
        this.add.image(14 + i * 17, cy, 'ui-heart-full').setDepth(3).setVisible(false),
      );
    }
    this.livesText = this.mono(14 + 3 * 17 + 22, cy, '×4', COL.danger, 11).setDepth(3);
    // plakietka ŚWIAT
    this.badgeText = this.add.text(206, cy, 'ŚWIAT 1-1', {
      fontFamily: FONT_UI, fontSize: '14px', color: COL.gold,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3);
    // kryształy
    this.crystalIcon = this.add.sprite(280, cy, 'crystal', 0).setScale(0.8).setDepth(3);
    this.crystalIcon.play('crystal-spin');
    this.crystalText = this.mono(326, cy, '00/10', COL.cyan, 12);
    // strzały
    this.arrowIcon = this.add.image(376, cy, 'arrow').setRotation(-Math.PI / 4)
      .setScale(1.8).setDepth(3);
    this.arrowText = this.mono(404, cy, '12', COL.gold, 12);
    // magiczne
    this.add.image(432, cy, 'arrow-magic').setRotation(-Math.PI / 4)
      .setScale(1.8).setDepth(3).setTint(COLN.cyan);
    this.magicText = this.mono(454, cy, '0', COL.cyan, 12);
    // diamenty
    this.diamondIcon = this.add.sprite(492, cy, 'diamond', 0).setScale(0.8).setDepth(3);
    this.diamondIcon.play('diamond-spin');
    this.diamondText = this.mono(530, cy, '0000', COL.white, 12);
    // pauza (dotyk/klik)
    const pauseBtn = this.add.image(618, cy, 'ui-button').setDepth(3).setScale(1.4)
      .setInteractive({ useHandCursor: true });
    this.add.text(618, cy - 1, 'II', {
      fontFamily: FONT_TITLE, fontSize: '10px', color: COL.ink,
    }).setOrigin(0.5).setDepth(4);
    pauseBtn.on('pointerdown', () => {
      this.scene.launch('Pause', { levelKey: this.levelKey });
      this.scene.pause(this.levelKey);
    });

    // toast pod paskiem HUD (nie zasłania pola gry przy gruncie)
    this.toastBox = this.add.container(320, 104).setDepth(10).setVisible(false);
    const tb = this.add.nineslice(0, 0, 'ui-panel-brown', undefined, 380, 30, 6, 6, 6, 6);
    this.toastText = this.add.text(0, 0, '', {
      fontFamily: FONT_UI, fontSize: '14px', color: COL.white,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    this.toastBox.add([tb, this.toastText]);

    // panel areny (portret + imię + pasek HP + timer) — chowany poza walką
    this.arenaBox = this.add.container(0, 0).setDepth(5).setVisible(false);
    const pframe = this.add.nineslice(322, 62, 'ui-panel', undefined, 40, 40, 6, 6, 6, 6);
    // portret: klatka lot-przód (48), wykadrowana na głowę/pierś smoka
    this.portrait = this.add.sprite(322, 62, 'dragon-miraz', 48);
    this.applyPortraitCrop();
    this.arenaName = this.add.text(350, 50, 'MIRAŻ', {
      fontFamily: FONT_TITLE, fontSize: '10px', color: COL.gold,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0, 0.5);
    this.timerText = this.add.text(478, 74, '', {
      fontFamily: FONT_UI, fontSize: '12px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0, 0.5);
    this.arenaBox.add([pframe, this.portrait, this.arenaName, this.timerText]);

    // pasek postępu runnera (chowany poza fazą RUNNER)
    this.runnerBox = this.add.container(0, 0).setDepth(5).setVisible(false);
    const rframe = this.add.nineslice(320, 56, 'ui-panel', undefined, 344, 18, 6, 6, 6, 6);
    const rbg = this.add.rectangle(320, 56, 328, 8, 0x191430).setStrokeStyle(1, 0x000000, 0.6);
    this.runnerFill = this.add.rectangle(156, 56, 1, 6, COLN.gold).setOrigin(0, 0.5);
    // znacznik biegnącej bohaterki na pasku (mini-kryształ jako wskaźnik mety)
    const goal = this.add.sprite(484 + 6, 56, 'crystal', 0).setScale(0.6);
    goal.play('crystal-spin');
    this.runnerHead = this.add.sprite(156, 56, 'ui-star', 0).setScale(0.8);
    // wskaźnik biegu: 1–4 chevrony `»` na lewo od paska (spec playtest2)
    this.gearText = this.add.text(142, 56, '»', {
      fontFamily: FONT_TITLE, fontSize: '12px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(1, 0.5);
    this.runnerBox.add([rframe, rbg, this.runnerFill, goal, this.runnerHead,
      this.gearText]);

    // zdarzenia z Level
    const ev = level.events;
    const on = (name: string, fn: (...args: never[]) => void) => {
      ev.on(name, fn);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ev.off(name, fn));
    };
    on('hud:state', (s: HudState) => this.applyState(s));
    on('hud:toast', (d: { text: string; ms: number }) => this.showToast(d.text, d.ms));
    on('hud:flight', (d: FlightEvent) => this.flight(d));
    on('hud:arena', (d: { name: string; hp: number; maxHp: number; portraitKey: string }) =>
      this.showArena(d));
    on('hud:hp', (d: { hp: number }) => this.setHp(d.hp));
    on('hud:timer', (d: { remaining: number; warning: boolean }) => this.setTimer(d));
    on('hud:arena-end', () => this.arenaBox.setVisible(false));
    on('hud:runner-start', () => this.runnerBox.setVisible(true));
    on('hud:runner', (d: { progress: number }) => this.setRunnerProgress(d.progress));
    on('hud:runner-gear', (d: { gear: number }) => this.setGear(d.gear));
    on('hud:runner-end', () => this.runnerBox.setVisible(false));
    on('hud:magic-flash', () => this.flash(this.magicText, COLN.cyan));
    on('hud:steal-flash', () => this.stealFlash());
    on('hud:loot-return', () => {
      this.flash(this.arrowText, COLN.gold);
      this.flash(this.magicText, COLN.gold);
      this.flash(this.diamondText, COLN.gold);
    });
    on('hud:heart-break', () => this.heartBreak());

    const st0 = level.getHudState();
    this.applyState(st0);
    if (st0.arena) this.showArena(st0.arena);   // wejście dev-paramem ?arena=1
    if (st0.runner) {
      this.runnerBox.setVisible(true);
      this.setRunnerProgress(st0.runner.progress);
    }
  }

  /** chevrony biegu: `»`×gear + mignięcie ~1 s przy zmianie (spec playtest2) */
  private setGear(gear: number): void {
    const g = Math.max(1, Math.min(4, Math.round(gear)));
    const colors = [COL.dim, COL.gold, '#ffa040', COL.danger];
    this.gearText.setText('»'.repeat(g));
    this.gearText.setColor(colors[g - 1]);
    this.tweens.killTweensOf(this.gearText);
    this.gearText.setScale(1).setAlpha(1);
    this.tweens.add({
      targets: this.gearText, scale: 1.5, duration: 130, yoyo: true, repeat: 3,
      ease: 'Sine.out',
      onComplete: () => this.gearText.setScale(1),
    });
  }

  /** kradzież całego plecaka: liczniki mrugają fioletem ~2 s + potrząśnięcie */
  private stealFlash(): void {
    for (const t of [this.arrowText, this.magicText, this.diamondText]) {
      t.setTint(COLN.purple);
      this.tweens.add({
        targets: t, scale: 1.4, duration: 160, yoyo: true, repeat: 5,
        ease: 'Sine.out',
        onComplete: () => {
          t.setScale(1);
          t.setTint(0xffffff);
          t.setTintMode(Phaser.TintModes.MULTIPLY);
        },
      });
    }
    this.cameras.main.shake(200, 0.006);
  }

  private mono(x: number, y: number, str: string, color: string, size: number):
  Phaser.GameObjects.Text {
    return this.add.text(x, y, str, {
      fontFamily: FONT_TITLE, fontSize: `${size}px`, color,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3);
  }

  private applyState(s: HudState): void {
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i];
      if (i < s.maxHearts) {
        h.setVisible(true).setTexture(i < s.hearts ? 'ui-heart-full' : 'ui-heart-empty');
      } else {
        h.setVisible(false);
      }
    }
    this.livesText.setText(`×${s.lives}`);
    this.livesText.x = 14 + s.maxHearts * 17 + 8;
    this.badgeText.setText(s.levelLabel);
    this.crystalText.setText(
      `${String(s.crystals).padStart(2, '0')}/${String(s.crystalTotal).padStart(2, '0')}`,
    );
    this.arrowText.setText(String(s.arrows));
    this.magicText.setText(String(s.magic));
    this.diamondText.setText(String(s.diamonds).padStart(4, '0'));
  }

  private heartBreak(): void {
    // pierwsze puste serce pęka: skok skali
    const idx = this.hearts.findIndex((h) => h.visible && h.texture.key === 'ui-heart-empty');
    const h = idx >= 0 ? this.hearts[idx] : this.hearts[0];
    this.tweens.add({
      targets: h, scale: 1.6, duration: 90, yoyo: true, repeat: 1, ease: 'Sine.out',
    });
  }

  private flash(target: Phaser.GameObjects.Text, tint: number): void {
    target.setTint(tint);
    this.tweens.add({
      targets: target, scale: 1.5, duration: 110, yoyo: true, repeat: 2,
      ease: 'Sine.out',
      onComplete: () => {
        target.setScale(1);
        target.setTint(0xffffff);
        target.setTintMode(Phaser.TintModes.MULTIPLY);
      },
    });
  }

  /** sprite pickupu leci łukiem z pola gry do licznika HUD (5.4) */
  private flight(d: FlightEvent): void {
    const targetX = d.target === 'crystal' ? this.crystalIcon.x
      : d.target === 'diamond' ? this.diamondIcon.x
        : this.arrowIcon.x;
    const s = this.add.image(d.sx, d.sy, d.texture, d.frame).setDepth(20);
    // łuk: x liniowo, y najpierw w górę (Quad.in do celu po uniesieniu)
    this.tweens.add({ targets: s, x: targetX, duration: 420, ease: 'Sine.inOut' });
    this.tweens.add({
      targets: s, y: d.sy - 36, duration: 140, ease: 'Sine.out',
      onComplete: () => {
        this.tweens.add({
          targets: s, y: BAR_H / 2, duration: 280, ease: 'Quad.in',
          onComplete: () => {
            s.destroy();
            const icon = d.target === 'crystal' ? this.crystalIcon
              : d.target === 'diamond' ? this.diamondIcon : this.arrowIcon;
            this.tweens.add({
              targets: icon, scale: 1.25, duration: 90, yoyo: true, ease: 'Sine.out',
            });
          },
        });
      },
    });
  }

  private showToast(text: string, ms: number): void {
    this.toastTimer?.remove();
    this.toastText.setText(text);
    const w = Math.max(220, this.toastText.width + 30);
    const nine = this.toastBox.list[0] as Phaser.GameObjects.NineSlice;
    nine.setSize(w, 30);
    this.toastBox.setVisible(true).setAlpha(1);
    this.toastTimer = this.time.delayedCall(ms, () => {
      this.tweens.add({
        targets: this.toastBox, alpha: 0, duration: 250,
        onComplete: () => this.toastBox.setVisible(false),
      });
    });
  }

  /** kadr portretu: głowa/pierś w klatce 48 (arkusz smoków 113×64) */
  private applyPortraitCrop(): void {
    const cx = 42;
    const cy = 0;
    const cw = 32;
    const ch = 32;
    this.portrait.setOrigin((cx + cw / 2) / 113, (cy + ch / 2) / 64);
    this.portrait.setCrop(cx, cy, cw, ch);
    this.portrait.setScale(1.0);
  }

  private showArena(d: { name: string; hp: number; maxHp: number; portraitKey: string }): void {
    this.maxHp = d.maxHp;
    this.arenaName.setText(d.name);
    this.portrait.setTexture(d.portraitKey, 48);
    this.applyPortraitCrop();
    for (const seg of this.hpSegments) seg.destroy();
    this.hpSegments = [];
    const segW = Math.min(14, Math.floor(180 / d.maxHp));
    for (let i = 0; i < d.maxHp; i++) {
      const seg = this.add.rectangle(350 + i * (segW + 2), 66, segW, 10, 0xe33030)
        .setOrigin(0, 0).setStrokeStyle(1, 0x000000, 0.6);
      this.hpSegments.push(seg);
      this.arenaBox.add(seg);
    }
    this.timerText.setText('');
    this.timerText.x = 350 + d.maxHp * (segW + 2) + 10;
    this.timerText.y = 71;
    this.arenaBox.setVisible(true);
    this.setHp(d.hp);
  }

  /** segmenty HP gasną z opóźnieniem (5.4: segment gaśnie z opóźnieniem) */
  private setHp(hp: number): void {
    for (let i = 0; i < this.hpSegments.length; i++) {
      const seg = this.hpSegments[i];
      if (i < hp) {
        seg.setFillStyle(0xe33030, 1);
        seg.setAlpha(1);
      } else if (seg.alpha === 1 && seg.fillColor === 0xe33030) {
        this.tweens.add({
          targets: seg, alpha: 0.25, delay: 150, duration: 220,
          onComplete: () => seg.setFillStyle(0x54141c, 1),
        });
      }
    }
    if (hp <= this.maxHp * 0.25) {
      for (let i = 0; i < hp; i++) {
        this.tweens.add({
          targets: this.hpSegments[i], alpha: 0.55, duration: 220, yoyo: true, repeat: 3,
        });
      }
    }
  }

  /** pasek postępu runnera: wypełnienie + znacznik bohaterki */
  private setRunnerProgress(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const w = Math.max(1, Math.round(328 * p));
    this.runnerFill.width = w;
    this.runnerHead.x = 156 + w;
  }

  private setTimer(d: { remaining: number; warning: boolean }): void {
    this.timerText.setText(`ucieczka: ${d.remaining}s`);
    this.timerText.setColor(d.warning ? COL.danger : COL.dim);
    if (d.warning && d.remaining % 2 === 0) {
      this.tweens.add({
        targets: this.timerText, scale: 1.25, duration: 120, yoyo: true,
      });
    }
  }
}
