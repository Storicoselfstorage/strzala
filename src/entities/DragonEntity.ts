/**
 * Smok — render nad core/combat.Dragon (FSM decyduje TAM, tu tylko obraz):
 * animacje arkusza dragon-*, telegraf (poświata + miganie + `!`), tarcza
 * (pulsujący owal), reakcja na trafienie (animacja 'hurt' + miganie alpha;
 * iskry w punkcie trafienia sypie scena), rozpad na particles przy zwycięstwie.
 */
import Phaser from 'phaser';
import { Dragon, DragonState } from '../core/combat';
import { COL, COLN, FONT_TITLE } from '../ui/theme';

export interface DragonEntityOpts {
  /** skala sprite'a (BOSS: ×1,5–2 — PRD 5.3; hitbox ZAWSZE z core) */
  scale?: number;
  /** złote rogi Obsydiana — overlay dorysowany do głowy (v1: `^^`) */
  horns?: boolean;
  /** tint bazowy (Obsydian: przygaszenie recoloru do czerni+złota) */
  baseTint?: number;
}

const BASE_SCALE = 1.35;

export class DragonEntity {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly glow: Phaser.GameObjects.Ellipse;
  private readonly shield: Phaser.GameObjects.Ellipse;
  private readonly bang: Phaser.GameObjects.Text;
  private readonly horns: Phaser.GameObjects.Image[] = [];
  private readonly texKey: string;
  private readonly scene: Phaser.Scene;
  private readonly scaleK: number;
  private readonly baseTint: number;
  private hurtT = 0;
  private telegraphOn = false;
  private shieldPulse?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, dragonKey: string, opts: DragonEntityOpts = {}) {
    this.scene = scene;
    this.texKey = `dragon-${dragonKey}`;
    const scale = opts.scale ?? BASE_SCALE;
    this.scaleK = scale / BASE_SCALE;
    this.baseTint = opts.baseTint ?? 0xffffff;
    // klatka 113×64, smok logicznie 96×48 → skala dobrana wizualnie
    this.sprite = scene.add
      .sprite(0, 0, this.texKey, 9)
      .setOrigin(0.5, 0.62)
      .setScale(scale)
      .setDepth(-10);
    if (this.baseTint !== 0xffffff) this.sprite.setTint(this.baseTint);
    this.glow = scene.add
      .ellipse(0, 0, 116 * this.scaleK, 72 * this.scaleK, COLN.gold, 0.16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-11)
      .setVisible(false);
    // tarcza: przy dużym bossie ADD-owy owal robi się „jajem" — przygaś
    this.shield = scene.add
      .ellipse(0, 0, 150 * this.scaleK, 96 * this.scaleK, 0x8ef6ff,
        this.scaleK > 1 ? 0.14 : 0.28)
      .setStrokeStyle(2, 0xcffcff, this.scaleK > 1 ? 0.45 : 0.8)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-9)
      .setVisible(false);
    this.bang = scene.add
      .text(0, 0, '!', {
        fontFamily: FONT_TITLE, fontSize: '18px', color: COL.danger,
        stroke: COL.ink, strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);
    if (opts.horns) {
      DragonEntity.ensureHornTexture(scene);
      for (let i = 0; i < 2; i++) {
        this.horns.push(
          scene.add.image(0, 0, 'boss-horn').setOrigin(0.5, 1).setDepth(-9.5),
        );
      }
    }
  }

  /** róg 12×10 px generowany Graphics (bez pliku — rekomendacja pipeline'u F0) */
  private static ensureHornTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists('boss-horn')) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    // złoty róg: ciemna podstawa, jaśniejszy trzon, rozświetlony czubek
    g.fillStyle(0xb8860b, 1);
    g.fillTriangle(0, 10, 12, 10, 7, 0);
    g.fillStyle(0xffd23f, 1);
    g.fillTriangle(2, 10, 10, 10, 7, 1);
    g.fillStyle(0xfff2a0, 1);
    g.fillTriangle(5, 5, 8, 5, 7, 0);
    g.generateTexture('boss-horn', 12, 10);
    g.destroy();
  }

  /** kotwica „jeźdźca" (Vabank siedzi na łbie — aneks 8.4.3) */
  riderXY(d: Dragon, playerX: number): { x: number; y: number } {
    const cx = d.x + d.w / 2;
    const facing = playerX < cx ? -1 : 1;
    const top = this.sprite.y - this.sprite.displayHeight * 0.62;
    return { x: cx + facing * 6 * this.scaleK, y: top + 26 * this.scaleK };
  }

  /** pozycja pyska (do błysku wystrzału) */
  mouthXY(d: Dragon, playerX: number): { x: number; y: number } {
    const cx = d.x + d.w / 2;
    const facing = playerX < cx ? -1 : 1;
    return { x: cx + facing * d.w * 0.55, y: d.y + d.h * 0.45 };
  }

  update(dt: number, d: Dragon, playerX: number): void {
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    this.sprite.x = cx;
    this.sprite.y = cy;
    const facing = playerX < cx ? -1 : 1;
    this.sprite.setFlipX(facing < 0);

    // animacja wg stanu FSM (arkusz: walk 24-29, attack 30-32, fly 72-74,
    // roar 81-83, hurt 33-35 — animations.ts); trafienie nadpisuje na chwilę
    const st: DragonState = d.state;
    if (this.hurtT > 0) this.play('hurt');
    else if (st === 'IDLE' || st === 'COOLDOWN') this.play('walk');
    else if (st === 'TELEGRAPH') this.play('roar');
    else if (st === 'ATTACK' || st === 'CHARGE') this.play('attack');
    else if (st === 'STUNNED') this.play('hurt');
    else if (st === 'FLEE') this.play('fly');

    // złote rogi: zakotwiczone do głowy (przód sprite'a po stronie gracza),
    // wygięte do tyłu jak korona — czerń+złoto (checklista B1)
    if (this.horns.length > 0) {
      const top = this.sprite.y - this.sprite.displayHeight * 0.62;
      const hx = cx + facing * this.sprite.displayWidth * 0.26;
      const hy = top + this.sprite.displayHeight * 0.34;
      this.horns[0].setPosition(hx, hy).setFlipX(facing < 0)
        .setScale(1.8).setRotation(-facing * 0.35).setVisible(this.sprite.visible);
      this.horns[1].setPosition(hx - facing * 11, hy - 1).setFlipX(facing < 0)
        .setScale(1.45).setRotation(-facing * 0.6).setVisible(this.sprite.visible);
      for (const h of this.horns) h.setAlpha(this.sprite.alpha);
    }

    // telegraf ≥ 0,7 s: poświata + miganie + `!` (PRD 5.5)
    const tele = st === 'TELEGRAPH';
    if (tele !== this.telegraphOn) {
      this.telegraphOn = tele;
      this.glow.setVisible(tele);
      this.bang.setVisible(tele);
      if (!tele) this.sprite.setAlpha(1);
    }
    if (tele) {
      const blink = Math.floor(this.scene.time.now / 90) % 2 === 0;
      this.sprite.setAlpha(blink ? 1 : 0.55);
      this.glow.x = cx;
      this.glow.y = cy;
      this.glow.setAlpha(0.09 + 0.09 * Math.sin(this.scene.time.now / 60));
      this.bang.x = cx;
      this.bang.y = d.y - 16 + Math.sin(this.scene.time.now / 100) * 2;
    }

    // tarcza: pulsujący półprzezroczysty owal
    const shieldOn = d.shieldUp && d.aliveFighting();
    if (shieldOn !== this.shield.visible) {
      this.shield.setVisible(shieldOn);
      if (shieldOn) {
        this.shieldPulse?.stop();
        this.shield.setScale(1);
        this.shieldPulse = this.scene.tweens.add({
          targets: this.shield, scaleX: 1.07, scaleY: 1.1,
          duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        });
      } else {
        this.shieldPulse?.stop();
      }
    }
    if (shieldOn) {
      this.shield.x = cx;
      this.shield.y = cy;
    }

    // reakcja na trafienie: miganie alpha 3 × ~40 ms (bez wielkiej nakładki)
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      const elapsed = 0.35 - this.hurtT;
      if (elapsed < 0.24) {
        this.sprite.setAlpha(Math.floor(elapsed / 0.04) % 2 === 0 ? 0.35 : 1);
      } else if (!tele) {
        this.sprite.setAlpha(1);
      }
      if (this.hurtT <= 0 && !tele) this.sprite.setAlpha(1);
    }
  }

  private play(kind: string): void {
    this.sprite.play(`${this.texKey}-${kind}`, true);
  }

  playRoar(): void {
    this.sprite.play(`${this.texKey}-roar`, true);
  }

  /** trafiony: animacja 'hurt' + miganie alpha (iskry w punkcie — scena) */
  hitReact(): void {
    this.hurtT = 0.35;
    this.sprite.stop();   // restart animacji hurt od pierwszej klatki
  }

  /** miganie na żółto (ostrzeżenie przed ucieczką) */
  warnBlink(on: boolean): void {
    if (on) this.sprite.setTint(COLN.gold);
    else {
      this.sprite.setTint(this.baseTint);
      this.sprite.setTintMode(Phaser.TintModes.MULTIPLY);
    }
  }

  hide(): void {
    this.sprite.setVisible(false);
    this.glow.setVisible(false);
    this.shield.setVisible(false);
    this.bang.setVisible(false);
    for (const h of this.horns) h.setVisible(false);
    this.shieldPulse?.stop();
  }

  destroy(): void {
    this.shieldPulse?.stop();
    this.sprite.destroy();
    this.glow.destroy();
    this.shield.destroy();
    this.bang.destroy();
    for (const h of this.horns) h.destroy();
  }
}
