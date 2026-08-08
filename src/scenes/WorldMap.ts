/**
 * Mapa świata (PRD 5.3, aneks 9.4): ścieżka węzłów 1-1 → BOSS na trzech
 * wyspach-regionach nad morzem chmur. Kompozycja WYŁĄCZNIE z posiadanych
 * assetów: niebo/chmury (theme), wyspy z kafli terrain-sand (pustynia),
 * terrain-pa trawa (dżungla) i terrain-pa kamień z tintem (wulkan), palmy.
 * Węzły: ukończony = 'ui-star', dostępny = pulsujący, zamknięty = 'ui-lock'.
 * Smocza Eskadra: rządek portretów smoków u dołu (klatka lot-przód 48;
 * pokonane kolorowe, niepokonane jako ciemne sylwetki przez tint).
 * Start poziomu: scene.start('Level', { levelId }) — kontrakt Level.
 */
import Phaser from 'phaser';
import { loadSave, localStorageAdapter, SaveData } from '../core/save';
import { DragonId, DRAGONS, LEVEL_DEF, LEVEL_ORDER, MAPS } from '../data/levels';
import { addSkyBackdrop, Backdrop, COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark } from '../dev';

interface NodeDef {
  id: string;
  x: number;
  y: number;
}

/** pozycje węzłów na wyspach (piksele sceny 640×360) */
const NODES: NodeDef[] = [
  { id: '1-1', x: 56, y: 128 },
  { id: '1-2', x: 104, y: 128 },
  { id: '1-3', x: 152, y: 128 },
  { id: '2-1', x: 280, y: 164 },
  { id: '2-2', x: 328, y: 164 },
  { id: '2-3', x: 376, y: 164 },
  { id: '3-1', x: 488, y: 134 },
  { id: '3-2', x: 528, y: 134 },
  { id: '3-3', x: 564, y: 134 },
  { id: 'BOSS', x: 608, y: 116 },
];

/** poziomy ze smokami w kolejności kampanii (Eskadra) */
const DRAGON_NODES: Array<{ level: string; dragon: DragonId }> = LEVEL_ORDER
  .filter((id) => LEVEL_DEF[id].dragon !== null)
  .map((id) => ({ level: id, dragon: LEVEL_DEF[id].dragon as DragonId }));

interface NodeView {
  def: NodeDef;
  disc: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image | null;
  pulse: Phaser.Tweens.Tween | null;
}

export class WorldMapScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private save!: SaveData;
  private nodes: NodeView[] = [];
  private selIdx = 0;
  private ring!: Phaser.GameObjects.Image;
  private pawn!: Phaser.GameObjects.Sprite;
  private pawnShadow!: Phaser.GameObjects.Ellipse;
  private toastText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('WorldMap');
  }

  create() {
    this.nodes = [];
    this.toastText = null;
    this.backdrop = addSkyBackdrop(this);
    this.save = loadSave(
      localStorageAdapter() ?? { getItem: () => null, setItem: () => undefined },
    );
    this.sound.mute = this.save.muted;
    this.ensureMusic();

    this.buildHeader();
    this.buildIslands();
    this.buildPath();
    this.buildNodes();
    this.buildEskadra();
    this.buildPawn();
    this.buildHints();
    this.setupInput();

    // start na pierwszym odblokowanym-nieukończonym węźle
    const firstOpen = NODES.findIndex(
      (n) => this.save.unlocked.includes(n.id) && !this.save.levels[n.id]?.completed,
    );
    const lastUnlocked = NODES.reduce(
      (acc, n, i) => (this.save.unlocked.includes(n.id) ? i : acc), 0,
    );
    this.select(firstOpen >= 0 ? firstOpen : lastUnlocked, true);
  }

  private ensureMusic(): void {
    if (this.cache.audio.exists('music-menu') && !this.sound.get('music-menu')?.isPlaying) {
      this.sound.play('music-menu', { loop: true, volume: 0.6 });
    }
  }

  // ── nagłówek ────────────────────────────────────────────────────────────

  private buildHeader(): void {
    this.add.text(320, 24, 'SMOCZA WYSPA', {
      fontFamily: FONT_TITLE, fontSize: '17px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 4,
    }).setOrigin(0.5);

    // diamenty (bank kampanii)
    this.add.sprite(556, 24, 'diamond', 0).setScale(0.8).play('diamond-spin');
    this.add.text(570, 24, String(this.save.total_diamonds).padStart(4, '0'), {
      fontFamily: FONT_TITLE, fontSize: '11px', color: COL.white,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0, 0.5);

    // znacznik Trybu Skrzat (aneks 8.7 — przełącznik w menu)
    if (this.save.skrzat) {
      this.add.nineslice(88, 24, 'ui-panel', undefined, 148, 24, 6, 6, 6, 6).setAlpha(0.92);
      this.add.image(28, 24, 'ui-heart-full');
      this.add.text(40, 24, 'TRYB SKRZAT', {
        fontFamily: FONT_UI, fontSize: '13px', color: COL.ink,
      }).setOrigin(0, 0.5);
    }
  }

  // ── wyspy-regiony ───────────────────────────────────────────────────────

  /** wyspa z kafli: frame(kolumna 0=lewa/1=środek/2=prawa, wiersz) */
  private island(
    x0: number, topY: number, cols: number, rows: number,
    texture: string, frameAt: (edgeC: 0 | 1 | 2, r: number) => number, tint?: number,
  ): void {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const edge: 0 | 1 | 2 = c === 0 ? 0 : c === cols - 1 ? 2 : 1;
        const img = this.add.image(x0 + c * 16 + 8, topY + r * 16 + 8, texture, frameAt(edge, r));
        if (tint !== undefined) img.setTint(tint);
      }
    }
  }

  private regionLabel(x: number, y: number, text: string, color: string): void {
    this.add.text(x, y, text, {
      fontFamily: FONT_UI, fontSize: '12px', color,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
  }

  private buildIslands(): void {
    // PUSTYNIA (terrain-sand, 17 kolumn): góra 0-2, środek 17-19, dół 34-36
    const sandFrame = (e: 0 | 1 | 2, r: number): number =>
      r === 0 ? e : r === 1 ? 17 + e : 34 + e;
    this.island(24, 144, 10, 3, 'terrain-sand', sandFrame);
    this.regionLabel(104, 208, 'PUSTYNIA MIRAŻY', COL.gold);
    // palmy na pustyni i dżungli (klatka 0 kołysze się, 4 statyczna)
    this.add.sprite(40, 145, 'palms', 0).setOrigin(0.5, 1).play('palm-sway');
    this.add.sprite(172, 145, 'palms', 4).setOrigin(0.5, 1);

    // DŻUNGLA (terrain-pa, 22 kolumny): trawa-góra kl. 6-8, ziemia 28-30, dół 50-52
    const grassFrame = (e: 0 | 1 | 2, r: number): number =>
      r === 0 ? 6 + e : r === 1 ? 28 + e : 50 + e;
    this.island(248, 180, 10, 3, 'terrain-pa', grassFrame);
    this.regionLabel(328, 244, 'DŻUNGLA ECH', '#8fe07a');
    this.add.sprite(264, 181, 'palms', 0).setOrigin(0.5, 1).play({ key: 'palm-sway', startFrame: 2 });
    this.add.sprite(392, 181, 'palms', 5).setOrigin(0.5, 1);
    // Echo mieszka w dżungli — siedzi przy palmie
    this.add.sprite(298, 180, 'echo-idle', 0).setOrigin(0.5, 1).setScale(0.9).play('echo-idle');

    // WULKAN: kafle piasku przyciemnione na ciemną skałę z czerwonym żarem
    // (PRD 4.1: świat 3 = recolor terenu na ciemną skałę + czerwone akcenty)
    const rockTint = 0x9a5a50;
    this.island(456, 150, 11, 3, 'terrain-sand', sandFrame, rockTint);
    // szczyt pod węzłem BOSS
    this.island(584, 134, 3, 1, 'terrain-sand', sandFrame, 0x7c4640);
    this.regionLabel(544, 214, 'OBSYDIANOWA GÓRA', COL.danger);
    // żar wulkanu: pulsujące punkty lawy
    for (const [gx, gy] of [[600, 130], [612, 132], [590, 132]] as Array<[number, number]>) {
      const glow = this.add.image(gx, gy, 'p-circle-small')
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff6a30).setScale(0.5).setAlpha(0.7);
      this.tweens.add({
        targets: glow, alpha: 0.25, scale: 0.3,
        duration: 600 + gx % 300, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }

    // dekoracja: smok przelatuje po niebie
    const flyer = this.add.sprite(-60, 66, 'dragon-samum', 72).setScale(0.55).setAlpha(0.9);
    flyer.play('dragon-samum-fly');
    this.tweens.add({
      targets: flyer, x: 720, duration: 26_000, repeat: -1,
      onRepeat: () => {
        flyer.y = 52 + Math.random() * 30;
      },
    });
  }

  // ── ścieżka i węzły ─────────────────────────────────────────────────────

  private buildPath(): void {
    for (let i = 0; i < NODES.length - 1; i++) {
      const a = NODES[i];
      const b = NODES[i + 1];
      const steps = Math.max(4, Math.round(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / 14));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const dx = Phaser.Math.Linear(a.x, b.x, t);
        const dy = Phaser.Math.Linear(a.y, b.y, t) - Math.sin(t * Math.PI) * 6;
        // cień pod kropką — czytelność na jasnym niebie
        this.add.image(dx + 1, dy + 1, 'p-circle-small').setScale(0.32).setAlpha(0.5)
          .setTint(0x3a2504);
        this.add.image(dx, dy, 'p-circle-small').setScale(0.3).setAlpha(0.95)
          .setTint(0xfff3c8);
      }
    }
  }

  private buildNodes(): void {
    for (let i = 0; i < NODES.length; i++) {
      const def = NODES[i];
      const unlocked = this.save.unlocked.includes(def.id);
      const completed = this.save.levels[def.id]?.completed === true;
      const boss = def.id === 'BOSS';

      const disc = this.add.image(def.x, def.y, 'ui-button-round')
        .setScale(boss ? 1.25 : 1);
      let icon: Phaser.GameObjects.Image | null = null;
      let pulse: Phaser.Tweens.Tween | null = null;

      if (completed) {
        icon = this.add.image(def.x, def.y - 1, 'ui-star');
      } else if (unlocked) {
        // dostępny: pulsuje (aneks 9.4: ► miga)
        pulse = this.tweens.add({
          targets: disc, scale: (boss ? 1.25 : 1) * 1.16, alpha: 0.85,
          duration: 460, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        });
      } else {
        disc.setAlpha(0.55);
        icon = this.add.image(def.x, def.y - 1, 'ui-lock').setAlpha(0.9);
      }

      this.add.text(def.x, def.y + 20, boss ? 'BOSS' : def.id, {
        fontFamily: FONT_UI, fontSize: '12px',
        color: completed ? COL.gold : unlocked ? COL.white : COL.dim,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5);

      const zone = this.add.zone(def.x, def.y, 44, 48).setInteractive({ useHandCursor: unlocked });
      zone.on('pointerdown', () => {
        if (!this.save.unlocked.includes(def.id)) return;
        if (this.selIdx === i) this.confirm();
        else this.select(i);
      });

      this.nodes.push({ def, disc, icon, pulse });
    }

    // pierścień podświetlenia wybranego węzła
    this.ring = this.add.image(0, 0, 'p-circle-big')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(COLN.gold).setAlpha(0.5).setScale(1.4);
    this.tweens.add({
      targets: this.ring, alpha: 0.2, scale: 1.7, duration: 600,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }

  // ── Smocza Eskadra ──────────────────────────────────────────────────────

  private buildEskadra(): void {
    this.add.nineslice(320, 316, 'ui-panel-brown', undefined, 604, 58, 6, 6, 6, 6).setAlpha(0.96);
    this.add.text(38, 316, 'SMOCZA\nESKADRA', {
      fontFamily: FONT_UI, fontSize: '13px', color: COL.gold,
      stroke: COL.ink, strokeThickness: 3, align: 'center', lineSpacing: 2,
    }).setOrigin(0.5);

    let x = 150;
    for (const dn of DRAGON_NODES) {
      const defeated = this.save.dragons_defeated.includes(dn.level);
      // portret: klatka lot-przód 48, kadr na głowę (jak HUD)
      const p = this.add.sprite(x, 308, `dragon-${dn.dragon.toLowerCase()}`, 48);
      p.setOrigin((42 + 16) / 113, 16 / 64);
      p.setCrop(42, 0, 32, 32);
      const name = this.add.text(x, 331, defeated ? DRAGONS[dn.dragon].name : '???', {
        fontFamily: FONT_UI, fontSize: '11px',
        color: defeated ? COL.gold : COL.dim,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5);
      if (!defeated) {
        // niepokonany: ciemna sylwetka (tint mnożący)
        p.setTint(0x2a2342);
        name.setAlpha(0.7);
      }
      x += 78;
    }
  }

  // ── pionek bohaterki ────────────────────────────────────────────────────

  private buildPawn(): void {
    this.pawnShadow = this.add.ellipse(0, 0, 26, 6, 0x000000, 0.3);
    if (this.save.character === 'TOSIA') {
      this.pawn = this.add.sprite(0, 0, 'tosia-ranger', 0).setOrigin(0.5, 1);
      this.pawn.play('tosia-idle');
    } else {
      this.pawn = this.add.sprite(0, 0, 'vega-idle', 0).setOrigin(0.5, 1).setScale(0.8);
      this.pawn.play('vega-idle');
    }
    this.pawn.setInteractive({ useHandCursor: true });
    this.pawn.on('pointerdown', () => this.changeCharacter());
  }

  private buildHints(): void {
    const hint = this.add.text(
      320, 352,
      '[← →] wybierz    [SPACJA] graj    [C] bohaterka    [ESC] menu', {
        fontFamily: FONT_UI, fontSize: '12px', color: COL.dim,
        stroke: COL.ink, strokeThickness: 3,
      },
    ).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.55, duration: 700, yoyo: true, repeat: -1 });
  }

  // ── sterowanie ──────────────────────────────────────────────────────────

  private setupInput(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.move(-1));
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-A', () => this.move(-1));
    kb.on('keydown-D', () => this.move(1));
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-ESC', () => {
      this.sound.play('sfx-ui-click', { volume: 0.4 });
      this.scene.start('Menu');
    });
    kb.on('keydown-C', () => this.changeCharacter());
  }

  private move(dir: -1 | 1): void {
    let i = this.selIdx + dir;
    while (i >= 0 && i < NODES.length) {
      if (this.save.unlocked.includes(NODES[i].id)) {
        this.sound.play('sfx-ui-click', { volume: 0.4 });
        this.select(i);
        return;
      }
      i += dir;
    }
  }

  private select(i: number, instant = false): void {
    this.selIdx = i;
    const def = NODES[i];
    this.ring.setPosition(def.x, def.y);
    const px = def.x;
    const py = def.y - 12;
    if (instant) {
      this.pawn.setPosition(px, py);
      this.pawnShadow.setPosition(px, py + 1);
    } else {
      this.tweens.add({
        targets: this.pawn, x: px, y: py, duration: 220, ease: 'Sine.inOut',
      });
      this.tweens.add({
        targets: this.pawnShadow, x: px, y: py + 1, duration: 220, ease: 'Sine.inOut',
      });
    }
    devMark({
      scene: 'WorldMap', selected: def.id,
      unlocked: this.save.unlocked.length,
      defeatedDragons: this.save.dragons_defeated.length,
    });
  }

  private confirm(): void {
    const id = NODES[this.selIdx].id;
    if (!this.save.unlocked.includes(id)) return;
    // kontrakt Level.init: mapa ASCII albo poziom typu RUNNER (pattern)
    if (!MAPS[id] && LEVEL_DEF[id].kind !== 'RUNNER') {
      // dane poziomu jeszcze nie wgrane — bez crasha
      this.cameras.main.shake(120, 0.004);
      this.toast('Ten poziom jeszcze się wykluwa…');
      return;
    }
    this.sound.play('sfx-ui-click', { volume: 0.5 });
    this.scene.start('Level', { levelId: id });
  }

  private changeCharacter(): void {
    this.sound.play('sfx-ui-click', { volume: 0.4 });
    this.scene.start('CharSelect', { returnTo: 'WorldMap' });
  }

  private toast(text: string): void {
    this.toastText?.destroy();
    const t = this.add.text(320, 84, text, {
      fontFamily: FONT_UI, fontSize: '14px', color: COL.white,
      stroke: COL.ink, strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);
    this.toastText = t;
    this.tweens.add({ targets: t, alpha: 1, duration: 120 });
    this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() });
    });
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
