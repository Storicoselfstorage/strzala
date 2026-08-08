/**
 * Level — fazy PLATFORM i ARENA (pionowy wycinek: 1-1, 1-2).
 *
 * Zasada architektury (PRD 2.0 §10): logika decyzyjna w core/ (thief, monkey,
 * combat, mapParser) — ta scena buduje świat z ParsedMap, renderuje i woła core.
 * Hitboksy z balance; pooling pocisków i particles; localStorage tylko przez
 * core/save.ts.
 */
import Phaser from 'phaser';
import {
  ARROW_RANGE, ARROW_SPEED, ARROWS_MAX, CharacterId, CharacterStats,
  CHARACTERS, DIFFICULTY, DifficultyId, DifficultySettings, HURT_KNOCKBACK,
  MAGIC_MAX, MAGIC_PER_CRYSTALS, PICKUP_RADIUS, SCORE, ENEMY_SCORE, TILE,
  ECHO_MAGNET_R, TRAP_TELEGRAPH,
} from '../core/balance';
import { cellKey, ParsedMap, parseMap, solidAt, standRow, sealWallCells } from '../core/mapParser';
import { ArenaCombat, CombatEvent, Fireball } from '../core/combat';
import { ThiefSpawner } from '../core/thief';
import { pickTrapsToActivate, recordLifeLoss } from '../core/monkey';
import { loadSave, localStorageAdapter, SaveData, writeSave } from '../core/save';
import { LEVEL_DEF, LevelDef, MAPS, THIEF_MAX, DRAGONS } from '../data/levels';
import { EVENT_MESSAGES, GAME_OVER, LEVEL_INTROS, LOSS_MESSAGES, WIN_MESSAGES } from '../data/texts';
import { Player } from '../entities/Player';
import { Toczek, Skoczka } from '../entities/enemies';
import { ThiefEntity } from '../entities/ThiefEntity';
import { EchoEntity } from '../entities/EchoEntity';
import { DragonEntity } from '../entities/DragonEntity';
import { COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark, devParam } from '../dev';

const GAME_FIELD_Y = 40;    // wiersz HUD 40 px NAD polem gry 320 px
const FIELD_H = 320;

type Phase = 'PLATFORM' | 'ARENA' | 'VICTORY';

interface PickupEntity {
  kind: 'crystal' | 'diamond' | 'arrow' | 'cake' | 'heart';
  x: number; y: number;
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  taken: boolean;
}

interface ArrowShot {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  traveled: number;
  magic: boolean;
  alive: boolean;
}

interface TrapEntity {
  c: number; x: number;
  state: 'hidden' | 'telegraph' | 'active';
  t: number;
  sprite: Phaser.GameObjects.Image;
}

interface LootDrop {
  kind: 'cake' | 'arrow' | 'diamond';
  count: number;
  x: number; y: number; ttl: number;
  sprite: Phaser.GameObjects.Image;
}

export class LevelScene extends Phaser.Scene {
  // ── konfiguracja poziomu ────────────────────────────────────────────────
  private levelId = '1-1';
  private def!: LevelDef;
  private map!: ParsedMap;
  private save!: SaveData;
  private charId!: CharacterId;
  private char!: CharacterStats;
  private diffId!: DifficultyId;
  private diff!: DifficultySettings;

  // ── stan rozgrywki ──────────────────────────────────────────────────────
  private phase: Phase = 'PLATFORM';
  private lives = 4;
  private hearts = 3;
  private maxHearts = 3;
  private crystals = 0;
  private magic = 0;
  private arrows = 10;
  private hasCake = false;
  private diamondsTotal = 0;
  private diamondsLevel = 0;
  private score = 0;
  private levelTime = 0;
  private lostLifeThisLevel = false;
  private lossTimes: number[] = [];
  private snapshot!: { arrows: number; hasCake: boolean; diamondsTotal: number; score: number };
  private frozen = false;
  private hitStopT = 0;
  private slowmoActive = false;

  // ── świat ───────────────────────────────────────────────────────────────
  private player!: Player;
  private solidRects: Phaser.GameObjects.Rectangle[] = [];
  private sealRects: Phaser.GameObjects.Rectangle[] = [];
  private sealTiles: Phaser.GameObjects.Image[] = [];
  private extraSolid = new Set<number>();
  private pickups: PickupEntity[] = [];
  private traps: TrapEntity[] = [];
  private trapCells = new Set<number>();
  private hazardXs: number[] = [];
  private snails: Toczek[] = [];
  private bunnies: Skoczka[] = [];
  private echoE: EchoEntity | null = null;
  private thiefE: ThiefEntity | null = null;
  private thiefSpawner = new ThiefSpawner();
  private lootDrops: LootDrop[] = [];
  private arrowPool: ArrowShot[] = [];
  private warnArrow!: Phaser.GameObjects.Image;
  private warnT = 0;
  private warnSide: -1 | 1 = 1;
  private skyLayers: Array<{ ts: Phaser.GameObjects.TileSprite; factor: number; drift: number }> = [];

  // ── arena ───────────────────────────────────────────────────────────────
  private combat: ArenaCombat | null = null;
  private dragonE: DragonEntity | null = null;
  private fireballSprites: Phaser.GameObjects.Image[] = [];
  private shieldPickupSprites: Phaser.GameObjects.Sprite[] = [];
  private checkpointX = 0;
  private checkpointFeetY = 304;
  private dragonWarn = false;
  private lastTimerEmit = -1;
  private dragonHits = 0;

  // ── efekty ──────────────────────────────────────────────────────────────
  private emDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emSpark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emFire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emHitSpark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emHitDot!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emBoom!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emSmoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private musicWorld: Phaser.Sound.BaseSound | null = null;
  private musicDragon: Phaser.Sound.BaseSound | null = null;

  // ── input ───────────────────────────────────────────────────────────────
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'A' | 'D' | 'S' | 'W' | 'X' | 'Z' | 'E' | 'P' | 'M' | 'ESC', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Level');
  }

  init(data: { levelId?: string }) {
    this.levelId = data.levelId ?? '1-1';
    const qLevel = devParam('level');
    if (qLevel && MAPS[qLevel]) this.levelId = qLevel;
  }

  create() {
    // stan świeży przy każdym create (restart sceny reużywa instancji!)
    this.resetSceneState();
    this.save = loadSave(localStorageAdapter() ?? { getItem: () => null, setItem: () => undefined });
    this.charId = this.save.character;
    this.char = CHARACTERS[this.charId];
    this.diffId = this.save.difficulty;
    this.diff = DIFFICULTY[this.diffId];
    this.sound.mute = this.save.muted;
    this.def = LEVEL_DEF[this.levelId];
    this.map = parseMap(MAPS[this.levelId], this.levelId);

    this.lives = this.diff.lives[this.charId];
    this.maxHearts = this.diff.outHearts > 0 ? this.diff.outHearts : this.diff.arenaHearts[this.charId];
    this.hearts = this.maxHearts;
    this.arrows = this.save.arrows;
    this.hasCake = this.save.has_cake;
    this.diamondsTotal = this.save.total_diamonds;
    this.snapshot = {
      arrows: this.arrows, hasCake: this.hasCake,
      diamondsTotal: this.diamondsTotal, score: 0,
    };

    this.physics.world.setBounds(0, -512, this.map.widthPx, 4096);
    this.buildBackdrop();
    this.buildTerrain();
    this.buildPickups();
    this.buildTraps();
    this.buildEnemies();
    this.buildEcho();
    this.buildExit();
    this.buildPlayer();
    this.buildParticles();
    this.buildWarnArrow();
    this.setupCamera();
    this.setupInput();
    this.setupMusic();

    // HUD — osobna scena-nakładka (restartowana razem z Level)
    if (this.scene.isActive('HUD') || this.scene.isPaused('HUD')) this.scene.stop('HUD');
    this.scene.launch('HUD', { levelKey: 'Level' });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.musicWorld?.stop();
      this.musicDragon?.stop();
    });

    this.time.delayedCall(150, () => {
      if (this.phase === 'PLATFORM') this.toast(LEVEL_INTROS[this.levelId] ?? '', 2600);
    });

    // dev: ?arena=1 → skok prosto do areny; ?thief=1 → złodziej od razu
    if (devParam('thief')) this.levelTime = 25;
    if (devParam('arena') && this.map.trigger) {
      const t = this.map.trigger;
      this.player.respawn(t.x + 24, (standRow(this.map, t.c) + 1) * TILE);
      this.startArena(true);
    }
    devMark({ scene: 'Level', level: this.levelId, phase: this.phase, dragonHits: 0 });
  }

  private resetSceneState(): void {
    this.phase = 'PLATFORM';
    this.crystals = 0;
    this.magic = 0;
    this.diamondsLevel = 0;
    this.score = 0;
    this.levelTime = 0;
    this.lostLifeThisLevel = false;
    this.lossTimes = [];
    this.frozen = false;
    this.hitStopT = 0;
    this.slowmoActive = false;
    this.solidRects = [];
    this.sealRects = [];
    this.sealTiles = [];
    this.extraSolid = new Set();
    this.pickups = [];
    this.traps = [];
    this.trapCells = new Set();
    this.hazardXs = [];
    this.snails = [];
    this.bunnies = [];
    this.echoE = null;
    this.thiefE = null;
    this.thiefSpawner = new ThiefSpawner();
    this.lootDrops = [];
    this.arrowPool = [];
    this.skyLayers = [];
    this.combat = null;
    this.dragonE = null;
    this.fireballSprites = [];
    this.shieldPickupSprites = [];
    this.dragonWarn = false;
    this.lastTimerEmit = -1;
    this.dragonHits = 0;
    this.warnT = 0;
    this.musicWorld = null;
    this.musicDragon = null;
  }

  // ════════════════════════ BUDOWA ŚWIATA ════════════════════════════════

  private buildBackdrop(): void {
    // niebo: okno źródła 90–128 px wygładzonego assetu (linia lawendowej
    // poświaty pod HUD + czysty błękit) — strefa przejścia pasm (wiersze
    // 79–89: dither + szarość) rozciągnięta na pół ekranu wygląda jak glitch
    const sky = this.add.tileSprite(0, 0, 640, FIELD_H, 'world1-sky')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
    sky.tileScaleX = FIELD_H / 38;
    sky.tileScaleY = FIELD_H / 38;
    sky.tilePositionY = 90;
    const small = this.add.tileSprite(0, 56, 640, 48, 'world1-clouds-small')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-95);
    const big = this.add.tileSprite(0, 148, 640, 101, 'world1-clouds-big')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-90);
    this.skyLayers = [
      { ts: sky, factor: 0, drift: 0 },
      { ts: big, factor: 0.2, drift: 3 },
      { ts: small, factor: 0.45, drift: 7 },
    ];
  }

  /** autotiling 'terrain-sand' (siatka 17 kolumn; frame = wiersz·17 + kolumna) */
  private sandFrame(r: number, c: number): number {
    const S = (rr: number, cc: number): boolean => {
      if (cc < 0 || cc >= this.map.widthTiles) return true;
      if (rr >= this.map.heightTiles) return true;   // pod mapą: ciągłość gruntu
      if (rr < 0) return false;
      return this.map.solidSet.has(cellKey(rr, cc));
    };
    const up = S(r - 1, c), down = S(r + 1, c), left = S(r, c - 1), right = S(r, c + 1);
    if (!up && !down) {   // platforma 1-kratkowa: wiersz 4
      if (left && right) return 4 * 17 + 1;
      if (left) return 4 * 17 + 2;
      if (right) return 4 * 17 + 0;
      return 4 * 17 + 4;  // solo
    }
    if (!up && down) {    // góra
      if (left && right) return 1;
      if (right) return 0;
      if (left) return 2;
      return 4;           // kolumna góra (4,0)
    }
    if (up && down) {     // środek
      if (left && right) return 17 + 1;
      if (right) return 17 + 0;
      if (left) return 17 + 2;
      return 17 + 4;      // kolumna środek
    }
    // dół
    if (left && right) return 2 * 17 + 1;
    if (right) return 2 * 17 + 0;
    if (left) return 2 * 17 + 2;
    return 2 * 17 + 4;    // kolumna dół
  }

  private buildTerrain(): void {
    // widoczne kafle
    for (const t of this.map.solidTiles) {
      this.add.image(t.x + 8, t.y + 8, 'terrain-sand', this.sandFrame(t.r, t.c)).setDepth(-50);
    }
    // scalone kolizje: poziome przebiegi kratek per wiersz → mało ciał statycznych
    for (let r = 0; r < this.map.heightTiles; r++) {
      let c = 0;
      while (c < this.map.widthTiles) {
        if (!this.map.solidSet.has(cellKey(r, c))) { c++; continue; }
        const c0 = c;
        while (c < this.map.widthTiles && this.map.solidSet.has(cellKey(r, c))) c++;
        const w = (c - c0) * TILE;
        const rect = this.add
          .rectangle(c0 * TILE + w / 2, r * TILE + 8, w, TILE)
          .setVisible(false);
        this.physics.add.existing(rect, true);
        this.solidRects.push(rect);
      }
    }
    // ściana domykająca arenę + niewidzialna ściana prawej krawędzi areny
    // (ciała istnieją od startu, włączane przy wejściu do areny)
    if (this.def.wallCol !== undefined && this.def.arenaX !== undefined) {
      for (const [r, c] of sealWallCells(this.def.wallCol)) {
        const img = this.add
          .image(c * TILE + 8, r * TILE + 8, 'terrain-sand', 17 + 4)
          .setDepth(-49).setVisible(false);
        this.sealTiles.push(img);
        const rect = this.add.rectangle(c * TILE + 8, r * TILE + 8, TILE, TILE).setVisible(false);
        this.physics.add.existing(rect, true);
        (rect.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        this.sealRects.push(rect);
      }
      const rightX = (this.def.arenaX + 80) * TILE;
      const rWall = this.add.rectangle(rightX + 8, FIELD_H / 2, TILE, FIELD_H).setVisible(false);
      this.physics.add.existing(rWall, true);
      (rWall.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.sealRects.push(rWall);
    }
    // dekoracje: palmy na wierzchołkach gruntu (deterministycznie co ~13 kolumn)
    let placed = 0;
    for (const t of this.map.solidTiles) {
      if (t.kind !== 'ground') continue;
      if (this.map.solidSet.has(cellKey(t.r - 1, t.c))) continue;
      if (t.c % 13 !== 5) continue;
      const frame = placed % 3 === 2 ? 4 : 0;
      const palm = this.add.sprite(t.x + 8, t.y + 1, 'palms', frame)
        .setOrigin(0.5, 1).setDepth(-60);
      if (frame === 0) palm.play({ key: 'palm-sway', startFrame: placed % 4 });
      placed++;
    }
    // kaktusy i kolce (pułapki statyczne)
    for (const k of this.map.cacti) {
      this.add.image(k.x + 8, k.y + TILE, 'cactus-big').setOrigin(0.5, 1).setDepth(-40);
      this.hazardXs.push(k.x + 8);
    }
    for (const s of this.map.spikes) {
      this.add.image(s.x + 8, s.y + TILE, 'spikes').setOrigin(0.5, 1).setDepth(-40);
      this.hazardXs.push(s.x + 8);
    }
  }

  private pickupTexture(kind: PickupEntity['kind']): { key: string; anim?: string } {
    switch (kind) {
      case 'crystal': return { key: 'crystal', anim: 'crystal-spin' };
      case 'diamond': return { key: 'diamond', anim: 'diamond-spin' };
      case 'arrow': return { key: 'arrow' };
      case 'cake': return { key: 'placek' };
      case 'heart': return { key: 'heart-pickup' };
    }
  }

  private buildPickups(): void {
    for (const p of this.map.pickups) {
      if (p.kind === 'pw_shield' || p.kind === 'pw_magnet') continue;  // brak w świecie 1
      const { key, anim } = this.pickupTexture(p.kind);
      const x = p.x + 8;
      const y = p.y + 8;
      let sprite: PickupEntity['sprite'];
      if (anim) {
        const s = this.add.sprite(x, y, key, 0);
        s.play({ key: anim, startFrame: (p.c % 4) });
        sprite = s;
      } else {
        sprite = this.add.image(x, y, key);
        if (p.kind === 'arrow') sprite.setRotation(-Math.PI / 4);
        if (p.kind === 'cake') {
          // złota poświata placka
          this.tweens.add({
            targets: sprite, scale: 1.15, duration: 500, yoyo: true, repeat: -1,
            ease: 'Sine.inOut',
          });
        }
      }
      sprite.setDepth(-30);
      this.tweens.add({
        targets: sprite, y: y - 3, duration: 700 + (p.c % 5) * 60,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
      this.pickups.push({ kind: p.kind, x, y, sprite, taken: false });
    }
  }

  private buildTraps(): void {
    for (const t of this.map.traps) {
      const sprite = this.add
        .image(t.x + 8, 19 * TILE, 'spikes')
        .setOrigin(0.5, 1).setDepth(-40).setVisible(false);
      this.traps.push({ c: t.c, x: t.x + 8, state: 'hidden', t: 0, sprite });
      this.hazardXs.push(t.x + 8);
    }
  }

  private buildEnemies(): void {
    for (const e of this.map.enemies) {
      if (e.kind === 'toczek') this.snails.push(new Toczek(this, e.r, e.c));
      else this.bunnies.push(new Skoczka(this, e.r, e.c));
    }
  }

  private buildEcho(): void {
    const mode = this.def.echo;
    if (mode === 'join' && this.map.echoMarker) {
      const m = this.map.echoMarker;
      const feet = (standRow(this.map, m.c) + 1) * TILE;
      this.echoE = new EchoEntity(this, m.x + 8, feet, true);
    } else if (mode === 'start') {
      const feet = (standRow(this.map, this.map.playerStart.c) + 1) * TILE;
      this.echoE = new EchoEntity(this, this.map.playerStart.x - 24, feet, false);
    }
  }

  private buildExit(): void {
    const e = this.map.exit;
    const x = e.x + 8;
    const feet = (e.r + 1) * TILE;
    const beam = this.add.rectangle(x, feet - 32, 22, 64, COLN.gold, 0.28)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(-45);
    this.tweens.add({
      targets: beam, alpha: 0.55, scaleX: 1.25, duration: 600,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    const star = this.add.image(x, feet - 64, 'ui-star').setDepth(-44);
    this.tweens.add({
      targets: star, y: feet - 70, angle: 8, duration: 800,
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }

  private buildPlayer(): void {
    const start = this.map.playerStart;
    const feetY = (start.r + 2) * TILE;   // P: wiersz stóp = r+1, dół stóp px
    this.player = new Player(this, start.x + 8, feetY, this.charId, {
      onJump: () => {
        this.sfx('sfx-jump', 0.45, true);
        this.emDust.explode(4, this.player.cx, this.player.feetY);
      },
      onLand: () => {
        this.sfx('sfx-land', 0.3, true);
        this.emDust.explode(5, this.player.cx, this.player.feetY);
      },
      onRunDust: (x, y) => this.emDust.explode(4, x, y - 2),
      solidAt: (r, c) => this.isSolid(r, c),
    });
    this.physics.add.collider(this.player.carrier, this.solidRects);
    this.physics.add.collider(this.player.carrier, this.sealRects);
    // pooling strzał: 12 sprite'ów tworzonych raz
    for (let i = 0; i < 12; i++) {
      const s = this.add.image(0, 0, 'arrow').setDepth(5).setVisible(false);
      this.arrowPool.push({ sprite: s, vx: 0, traveled: 0, magic: false, alive: false });
    }
  }

  private buildParticles(): void {
    this.emDust = this.add.particles(0, 0, 'p-dirt', {
      speed: { min: 16, max: 55 }, angle: { min: 200, max: 340 },
      gravityY: 130, lifespan: { min: 260, max: 480 },
      scale: { start: 0.75, end: 0.1 }, alpha: { start: 1, end: 0 },
      tint: [0xf3e9cf, COLN.dust], emitting: false,
    }).setDepth(10);
    this.emSpark = this.add.particles(0, 0, 'p-spark', {
      speed: { min: 60, max: 160 }, lifespan: { min: 200, max: 450 },
      scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 },
      tint: [0xfff2a0, 0x8ef6ff], blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(10);
    this.emTrail = this.add.particles(0, 0, 'p-circle-small', {
      speed: 8, lifespan: 260, scale: { start: 0.5, end: 0 },
      alpha: { start: 0.9, end: 0 }, tint: COLN.cyan,
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(4);
    this.emFire = this.add.particles(0, 0, 'p-circle-small', {
      speed: { min: 5, max: 30 }, lifespan: 300, scale: { start: 0.6, end: 0 },
      alpha: { start: 0.85, end: 0 }, tint: [0xff8030, 0xffd23f],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(5);
    // uderzenie strzały w smoka: białe iskry + drobinki W PUNKCIE trafienia
    this.emHitSpark = this.add.particles(0, 0, 'p-spark', {
      speed: { min: 70, max: 190 }, lifespan: { min: 180, max: 360 },
      scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 },
      tint: 0xffffff, blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(11);
    this.emHitDot = this.add.particles(0, 0, 'p-circle-small', {
      speed: { min: 40, max: 130 }, lifespan: { min: 160, max: 320 },
      scale: { start: 0.45, end: 0 }, alpha: { start: 1, end: 0 },
      tint: 0xffffff, blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(11);
    this.emBoom = this.add.particles(0, 0, 'p-circle-big', {
      speed: { min: 40, max: 220 }, lifespan: { min: 500, max: 1100 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
      gravityY: 60, tint: [COLN.gold, 0xffffff, 0xffa040],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(12);
    this.emSmoke = this.add.particles(0, 0, 'p-smoke', {
      speed: { min: 10, max: 40 }, lifespan: { min: 300, max: 600 },
      scale: { start: 0.6, end: 0.1 }, alpha: { start: 0.7, end: 0 },
      tint: 0xbbaadd, emitting: false,
    }).setDepth(11);
  }

  private buildWarnArrow(): void {
    this.warnArrow = this.add.image(616, 150, 'ui-arrows', 1)
      .setScrollFactor(0).setDepth(50).setTint(COLN.purple).setScale(1.5)
      .setVisible(false);
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setViewport(0, GAME_FIELD_Y, 640, FIELD_H);
    cam.setBounds(0, 0, this.map.widthPx, FIELD_H);
    cam.startFollow(this.player.carrier, true, 0.14, 0.14);
    cam.setDeadzone(110, 60);
    cam.setBackgroundColor(COLN.night);
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('A,D,S,W,X,Z,E,P,M,ESC') as LevelScene['keys'];
  }

  private setupMusic(): void {
    this.sound.stopByKey('music-menu');
    if (this.cache.audio.exists('music-world1')) {
      this.musicWorld = this.sound.add('music-world1', { loop: true, volume: 0.5 });
      this.musicWorld.play();
    }
  }

  // ════════════════════════ POMOCNICZE ═══════════════════════════════════

  private isSolid(r: number, c: number): boolean {
    return solidAt(this.map, r, c, (rr, cc) => this.extraSolid.has(cellKey(rr, cc)));
  }

  private sfx(key: string, volume = 0.5, pitchRandom = false): void {
    if (!this.cache.audio.exists(key)) return;
    this.sound.play(key, {
      volume,
      rate: pitchRandom ? 1 + (Math.random() * 0.1 - 0.05) : 1,
    });
  }

  private toast(text: string, ms = 2000): void {
    if (text) this.events.emit('hud:toast', { text, ms });
  }

  private emitHud(): void {
    this.events.emit('hud:state', {
      levelLabel: `ŚWIAT ${this.levelId}`,
      hearts: this.hearts, maxHearts: this.maxHearts, lives: this.lives,
      crystals: this.crystals, crystalTotal: this.map.crystalTotal,
      arrows: this.arrows, magic: this.magic, diamonds: this.diamondsTotal,
    });
  }

  /** stan dla HUD/Pauzy (wołane bezpośrednio przy starcie nakładek) */
  getHudState() {
    return {
      levelLabel: `ŚWIAT ${this.levelId}`,
      hearts: this.hearts, maxHearts: this.maxHearts, lives: this.lives,
      crystals: this.crystals, crystalTotal: this.map.crystalTotal,
      arrows: this.arrows, magic: this.magic, diamonds: this.diamondsTotal,
      hasCake: this.hasCake, echoPresent: this.echoPresent(),
      arena: this.combat && this.phase === 'ARENA' && this.def.dragon
        ? {
          name: DRAGONS[this.def.dragon].name,
          hp: this.combat.dragon.hp, maxHp: this.combat.dragon.maxHp,
          portraitKey: `dragon-${this.def.dragon.toLowerCase()}`,
        }
        : null,
    };
  }

  private echoPresent(): boolean {
    return !!this.echoE && !this.echoE.waiting && this.echoE.logic.present();
  }

  private floatText(x: number, y: number, str: string, color: string, size = 11): void {
    const t = this.add.text(x, y, str, {
      fontFamily: FONT_TITLE, fontSize: `${size}px`, color,
      stroke: COL.ink, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: t, y: y - 26, alpha: 0, duration: 700, ease: 'Sine.out',
      onComplete: () => t.destroy(),
    });
  }

  /** przelicznik świat → ekran (dla lotu pickupu do HUD w scenie-nakładce) */
  private toScreen(x: number, y: number): { sx: number; sy: number } {
    const cam = this.cameras.main;
    return { sx: x - cam.scrollX, sy: y - cam.scrollY + GAME_FIELD_Y };
  }

  private hitStop(ms: number): void {
    this.hitStopT = ms / 1000;
    this.physics.world.pause();
    this.anims.pauseAll();
  }

  private slowmo(): void {
    if (this.slowmoActive) return;
    this.slowmoActive = true;
    this.physics.world.timeScale = 2;      // Arcade: 2 = połowa prędkości
    this.anims.globalTimeScale = 0.5;
    this.tweens.timeScale = 0.5;
    this.time.delayedCall(500, () => {
      this.slowmoActive = false;
      this.physics.world.timeScale = 1;
      this.anims.globalTimeScale = 1;
      this.tweens.timeScale = 1;
    });
  }

  // ════════════════════════ UPDATE ═══════════════════════════════════════

  update(_time: number, delta: number) {
    let dt = Math.min(delta / 1000, 0.05);
    for (const l of this.skyLayers) {
      l.ts.tilePositionX = this.cameras.main.scrollX * l.factor + this.time.now / 1000 * l.drift;
    }
    if (this.hitStopT > 0) {
      this.hitStopT -= delta / 1000;
      if (this.hitStopT <= 0) {
        this.physics.world.resume();
        this.anims.resumeAll();
      }
      return;
    }
    if (this.slowmoActive) dt *= 0.5;

    // klawisze globalne
    if (Phaser.Input.Keyboard.JustDown(this.keys.M)) this.toggleMute();
    if (!this.frozen && (Phaser.Input.Keyboard.JustDown(this.keys.P)
      || Phaser.Input.Keyboard.JustDown(this.keys.ESC))) {
      this.openPause();
      return;
    }
    if (this.frozen) return;

    this.levelTime += dt;

    // ── gracz ────────────────────────────────────────────────────────────
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const move: -1 | 0 | 1 = left && !right ? -1 : right && !left ? 1 : 0;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.space)
      || Phaser.Input.Keyboard.JustDown(this.cursors.up)
      || Phaser.Input.Keyboard.JustDown(this.keys.W);
    const downHeld = this.cursors.down.isDown || this.keys.S.isDown;
    this.player.update(dt, { move, jumpPressed, downHeld });

    if (Phaser.Input.Keyboard.JustDown(this.keys.X)) this.shoot(false);
    if (Phaser.Input.Keyboard.JustDown(this.keys.Z)) this.shoot(true);
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.useCake();

    // upadek poza mapę
    if (this.player.body.y > FIELD_H + 24) {
      this.loseLife();
      return;
    }

    this.updateArrows(dt);
    this.updatePickups();
    this.updateTraps(dt);
    this.updateHazards();
    this.updateEnemies(dt);
    this.updateEcho(dt);
    this.updateLoot(dt);

    if (this.phase === 'PLATFORM') {
      this.updateThief(dt);
      // trigger areny
      if (this.map.trigger && this.def.kind === 'ARENA'
        && this.player.cx >= this.map.trigger.x) {
        this.startArena(false);
      }
      // wyjście z poziomu
      const e = this.map.exit;
      if (Math.abs(this.player.cx - (e.x + 8)) < 14
        && Math.abs(this.player.feetY - (e.r + 1) * TILE) < 24) {
        this.levelComplete(false);
        return;
      }
    } else if (this.phase === 'ARENA') {
      this.updateArena(dt);
    }

    devMark({
      scene: 'Level', level: this.levelId, phase: this.phase,
      playerX: Math.round(this.player.cx), crystals: this.crystals,
      thiefActive: !!this.thiefE, thiefX: this.thiefE ? Math.round(this.thiefE.logic.x) : -1,
      dragonState: this.combat?.dragon.state ?? '',
      dragonX: this.combat ? Math.round(this.combat.dragon.x) : -1,
      dragonHits: this.dragonHits,
    });
  }

  // ── strzały ──────────────────────────────────────────────────────────────

  private shoot(magic: boolean): void {
    if (magic ? this.magic <= 0 : this.arrows <= 0) return;
    if (!this.player.tryShoot()) return;
    const shot = this.arrowPool.find((a) => !a.alive);
    if (!shot) return;
    if (magic) this.magic--;
    else this.arrows--;
    this.emitHud();
    shot.alive = true;
    shot.magic = magic;
    shot.vx = this.player.facing * ARROW_SPEED;
    shot.traveled = 0;
    shot.sprite
      .setTexture(magic ? 'arrow-magic' : 'arrow')
      .setPosition(this.player.cx + this.player.facing * 10, this.player.headY + 5)
      .setFlipX(this.player.facing < 0)
      .setVisible(true);
    this.sfx(magic ? 'sfx-shoot-magic' : 'sfx-shoot', 0.45, true);
  }

  private killArrow(a: ArrowShot): void {
    a.alive = false;
    a.sprite.setVisible(false);
  }

  private updateArrows(dt: number): void {
    for (const a of this.arrowPool) {
      if (!a.alive) continue;
      const step = a.vx * dt;
      a.sprite.x += step;
      a.traveled += Math.abs(step);
      if (a.magic) this.emTrail.emitParticleAt(a.sprite.x - Math.sign(a.vx) * 6, a.sprite.y, 1);
      const ax = a.sprite.x;
      const ay = a.sprite.y;
      const r = Math.floor(ay / TILE);
      const c = Math.floor(ax / TILE);
      if (a.traveled > ARROW_RANGE || this.isSolid(r, c)) {
        this.killArrow(a);
        continue;
      }
      if (this.map.cactusCells.has(cellKey(r, c))) {
        this.emDust.explode(3, ax, ay);
        this.killArrow(a);   // strzała wbija się w kaktus i przepada
        continue;
      }
      // złodziej
      if (this.thiefE && this.thiefE.logic.alive) {
        const tr = this.thiefE.rect();
        if (ax > tr.x - 4 && ax < tr.x + tr.w + 4 && ay > tr.y && ay < tr.y + tr.h) {
          this.killArrow(a);
          this.thiefCaught();
          continue;
        }
      }
      // przeciwnicy
      let consumed = false;
      for (const sn of this.snails) {
        if (!sn.alive || sn.dying) continue;
        const rr = sn.rect();
        if (ax > rr.x && ax < rr.x + rr.w && ay > rr.y - 4 && ay < rr.y + rr.h + 4) {
          sn.kill('snail-hit');
          this.addScore(ENEMY_SCORE.toczek, rr.x + rr.w / 2, rr.y);
          this.maybeDrop(rr.x + rr.w / 2, rr.y);
          this.killArrow(a);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      for (const b of this.bunnies) {
        if (!b.alive || b.dying) continue;
        const rr = b.rect();
        if (ax > rr.x && ax < rr.x + rr.w && ay > rr.y - 4 && ay < rr.y + rr.h + 4) {
          b.kill('bunny-hit');
          this.addScore(ENEMY_SCORE.skoczka, rr.x + rr.w / 2, rr.y);
          this.killArrow(a);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      // smok
      if (this.combat && this.phase === 'ARENA') {
        const dmg = a.magic ? this.char.dmgMagic : this.char.dmg;
        const ev = this.combat.tryArrowHit(ax, ay, dmg, a.magic);
        if (ev.length > 0) {
          this.killArrow(a);
          this.handleCombatEvents(ev, { x: ax, y: ay });
        }
      }
    }
  }

  private addScore(points: number, x: number, y: number, color: string = COL.gold): void {
    this.score += points;
    this.floatText(x, y - 10, `+${points}`, color);
  }

  private maybeDrop(x: number, y: number): void {
    if (Math.random() >= 0.3) return;   // aneks 6.3: drop 30% kryształ
    const s = this.add.sprite(x, y - 8, 'crystal', 0);
    s.play('crystal-spin');
    s.setDepth(-30);
    this.pickups.push({ kind: 'crystal', x, y: y - 8, sprite: s, taken: false });
    this.map.crystalTotal += 1;
    this.emitHud();
  }

  // ── pickupy ─────────────────────────────────────────────────────────────

  private updatePickups(): void {
    const px = this.player.cx;
    const py = this.player.cy;
    const ex = this.echoE && this.echoPresent() ? this.echoE.logic.x : null;
    const ey = this.echoE && this.echoPresent() ? this.echoE.logic.y - TILE : null;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const dp = Phaser.Math.Distance.Between(px, py, p.x, p.y);
      let byEcho = false;
      if (dp > PICKUP_RADIUS) {
        // magnes Echo: kryształy i diamenty w promieniu 3 kratek (aneks 6.1)
        if (ex !== null && ey !== null && (p.kind === 'crystal' || p.kind === 'diamond')
          && Phaser.Math.Distance.Between(ex, ey, p.x, p.y) <= ECHO_MAGNET_R) {
          byEcho = true;
        } else {
          continue;
        }
      }
      p.taken = true;
      p.sprite.setVisible(false);
      this.collect(p.kind, p.x, p.y, byEcho);
    }
  }

  private collect(kind: PickupEntity['kind'], x: number, y: number, byEcho: boolean): void {
    const { sx, sy } = this.toScreen(x, y);
    switch (kind) {
      case 'crystal': {
        this.crystals++;
        this.score += SCORE.crystal;
        this.floatText(x, y, '+10', COL.cyan);
        this.events.emit('hud:flight', { texture: 'crystal', frame: 0, sx, sy, target: 'crystal' });
        this.sfx('sfx-crystal', 0.5, true);
        this.emSpark.explode(4, x, y);
        if (this.crystals % MAGIC_PER_CRYSTALS === 0 && this.magic < MAGIC_MAX) {
          this.magic++;
          this.toast(EVENT_MESSAGES.arrowsCharged, 2200);
          this.events.emit('hud:magic-flash');
          this.sfx('sfx-shoot-magic', 0.5);
        }
        break;
      }
      case 'diamond':
        this.diamondsLevel++;
        this.diamondsTotal++;
        this.score += SCORE.diamond;
        this.floatText(x, y, '+100', COL.white);
        this.events.emit('hud:flight', { texture: 'diamond', frame: 0, sx, sy, target: 'diamond' });
        this.sfx('sfx-diamond', 0.55);
        this.emSpark.explode(6, x, y);
        break;
      case 'arrow':
        this.arrows = Math.min(this.arrows + 3, ARROWS_MAX);
        this.score += SCORE.arrowPack;
        this.floatText(x, y, '+3', COL.gold);
        this.events.emit('hud:flight', { texture: 'arrow', sx, sy, target: 'arrow' });
        this.sfx('sfx-crystal', 0.4, true);
        break;
      case 'cake':
        this.hasCake = true;
        this.floatText(x, y, 'PLACEK!', COL.gold, 9);
        this.events.emit('hud:flight', { texture: 'placek', sx, sy, target: 'crystal' });
        this.sfx('sfx-gate-open', 0.4);
        this.toast('Legendarny Placek w plecaku. Pilnuj go!', 2200);
        break;
      case 'heart':
        this.lives++;
        this.floatText(x, y, '+1 ŻYCIE', COL.danger, 9);
        this.sfx('sfx-fanfare', 0.25);
        break;
    }
    if (byEcho) this.floatText(x, y - 14, 'ECHO!', COL.gold, 7);
    this.emitHud();
  }

  private useCake(): void {
    if (!this.hasCake) return;
    if (this.echoE && this.echoE.logic.canRetameWithCake(this.player.cx)) {
      this.hasCake = false;
      this.echoE.logic.comeBack();
      this.toast('Echo wraca za placek!', 2200);
      this.sfx('sfx-echo-whistle', 0.5);
    } else if (this.hearts < this.maxHearts) {
      this.hasCake = false;
      this.hearts++;
      this.toast(EVENT_MESSAGES.placekPiece, 2200);
      this.sfx('sfx-gate-open', 0.4);
    } else {
      this.toast('Placek zostaw na gorsze czasy (pełne serca).', 1800);
      return;
    }
    this.emitHud();
  }

  // ── pułapki / zagrożenia ────────────────────────────────────────────────

  private activateTrap(i: number): void {
    const t = this.traps[i];
    if (!t || t.state !== 'hidden') return;
    t.state = 'telegraph';
    t.t = TRAP_TELEGRAPH;
    t.sprite.setVisible(true).setTint(COLN.danger).setAlpha(0.4);
    this.tweens.add({ targets: t.sprite, y: 19 * TILE, duration: 250, ease: 'Sine.out' });
  }

  private activateAllTraps(): void {
    for (let i = 0; i < this.traps.length; i++) this.activateTrap(i);
  }

  private updateTraps(dt: number): void {
    for (const t of this.traps) {
      if (t.state === 'telegraph') {
        t.t -= dt;
        t.sprite.setAlpha(Math.floor(this.time.now / 120) % 2 === 0 ? 0.85 : 0.3);
        if (t.t <= 0) {
          t.state = 'active';
          t.sprite.setAlpha(1).setTint(0xffffff);
          this.trapCells.add(cellKey(18, t.c));
        }
      }
    }
  }

  private updateHazards(): void {
    if (this.player.iframes > 0) return;
    const b = this.player.body;
    const c0 = Math.floor(b.x / TILE);
    const c1 = Math.floor((b.x + b.width - 0.01) / TILE);
    const r0 = Math.floor(b.y / TILE);
    const r1 = Math.floor((b.y + b.height - 0.01) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = cellKey(r, c);
        if (this.map.cactusCells.has(k) || this.map.spikeCells.has(k) || this.trapCells.has(k)) {
          this.hurtPlayer((c + 0.5) * TILE);
          return;
        }
      }
    }
  }

  private hurtPlayer(sourceX: number): void {
    if (this.player.iframes > 0 || this.frozen) return;
    const dir: -1 | 1 = this.player.cx < sourceX ? -1 : 1;
    this.hearts--;
    this.sfx('sfx-heart-loss', 0.6);
    this.player.hurt(dir, this.diff.iframes);
    this.player.body.setVelocityX(dir * HURT_KNOCKBACK * 6);
    const cam = this.cameras.main;
    cam.flash(100, 255, 60, 60);
    cam.shake(150, 0.008);
    this.hitStop(60);
    this.events.emit('hud:heart-break');
    this.emitHud();
    if (this.hearts <= 0) this.loseLife();
  }

  // ── życia / śmierć / reset (aneks 8.5) ──────────────────────────────────

  private loseLife(): void {
    if (this.frozen) return;
    this.frozen = true;
    this.lives--;
    this.lostLifeThisLevel = true;
    this.physics.world.pause();
    this.sfx('sfx-heart-loss', 0.7);
    this.cameras.main.flash(120, 255, 60, 60);
    this.cameras.main.shake(180, 0.01);
    this.emitHud();
    const res = recordLifeLoss(this.lossTimes, this.levelTime);
    this.lossTimes = res.times;
    if (res.echoShouldFlee) this.echoFlee();
    if (this.lives <= 0) {
      this.gameOverOverlay();
      return;
    }
    this.deathOverlay();
  }

  private overlayBox(lines: Array<{ text: string; size: number; color: string }>):
  Phaser.GameObjects.Container {
    const cont = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
    const dim = this.add.rectangle(320, FIELD_H / 2, 640, FIELD_H, 0x0b0b14, 0.62);
    const box = this.add.nineslice(320, FIELD_H / 2, 'ui-panel-brown', undefined, 340, 150, 6, 6, 6, 6);
    cont.add([dim, box]);
    let y = FIELD_H / 2 - 42;
    for (const l of lines) {
      const t = this.add.text(320, y, l.text, {
        fontFamily: l.size >= 14 ? FONT_TITLE : FONT_UI,
        fontSize: `${l.size}px`, color: l.color,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5);
      cont.add(t);
      y += l.size + 16;
    }
    return cont;
  }

  private deathOverlay(): void {
    const msg = LOSS_MESSAGES[Math.floor(Math.random() * LOSS_MESSAGES.length)];
    const heartsRow = '♥ '.repeat(Math.max(0, this.lives)).trim() || '♡';
    const cont = this.overlayBox([
      { text: msg.header, size: 15, color: COL.danger },
      { text: heartsRow, size: 16, color: COL.danger },
      { text: msg.line, size: 15, color: COL.white },
      { text: '► [SPACJA] ◄', size: 13, color: COL.dim },
    ]);
    const go = () => {
      cont.destroy();
      this.respawnAfterDeath();
    };
    const timer = this.time.delayedCall(2000, go);
    this.input.keyboard!.once('keydown-SPACE', () => {
      timer.remove();
      go();
    });
  }

  private gameOverOverlay(): void {
    this.musicWorld?.stop();
    this.musicDragon?.stop();
    const cont = this.overlayBox([
      { text: GAME_OVER.header, size: 16, color: COL.gold },
      { text: GAME_OVER.line, size: 15, color: COL.white },
      { text: `${GAME_OVER.button}  [SPACJA]`, size: 14, color: COL.cyan },
    ]);
    this.input.keyboard!.once('keydown-SPACE', () => {
      cont.destroy();
      this.scene.stop('HUD');
      this.scene.start('Menu');
    });
  }

  private respawnAfterDeath(): void {
    this.physics.world.resume();
    this.frozen = false;
    if (this.phase === 'ARENA' && this.combat) {
      // checkpoint areny: HP smoka zachowane, timer ucieczki od nowa
      this.combat.restart();
      this.hearts = this.diff.arenaHearts[this.charId];
      this.maxHearts = this.hearts;
      this.player.respawn(this.checkpointX, this.checkpointFeetY);
      this.player.iframes = 1.0;
      this.dragonWarn = false;
      this.dragonE?.warnBlink(false);
      this.events.emit('hud:hp', { hp: this.combat.dragon.hp });
    } else {
      this.snapshotReset();
    }
    this.emitHud();
  }

  /** pełny reset poziomu (reguła córki: −1 życie + reset; snapshot z 8.5) */
  private snapshotReset(): void {
    this.arrows = this.snapshot.arrows;
    this.hasCake = this.snapshot.hasCake;
    this.diamondsTotal = this.snapshot.diamondsTotal;
    this.diamondsLevel = 0;
    this.score = this.snapshot.score;
    this.crystals = 0;
    this.magic = 0;
    this.hearts = this.maxHearts;
    for (const p of this.pickups) {
      p.taken = false;
      p.sprite.setVisible(true);
    }
    for (const t of this.traps) {
      t.state = 'hidden';
      t.t = 0;
      t.sprite.setVisible(false).setAlpha(1).setTint(0xffffff);
    }
    this.trapCells.clear();
    if (this.thiefE) {
      this.thiefE.destroy();
      this.thiefE = null;
    }
    this.thiefSpawner.reset();
    for (const l of this.lootDrops) l.sprite.destroy();
    this.lootDrops = [];
    if (this.echoE) {
      this.echoE.destroy();
      this.echoE = null;
      this.buildEcho();
    }
    const start = this.map.playerStart;
    this.player.respawn(start.x + 8, (start.r + 2) * TILE);
    this.player.iframes = 1.0;
    this.emitHud();
  }

  // ── przeciwnicy ─────────────────────────────────────────────────────────

  private updateEnemies(dt: number): void {
    const env = { solidAt: (r: number, c: number) => this.isSolid(r, c), playerX: this.player.cx };
    const pb = this.player.body;
    for (const sn of this.snails) {
      sn.update(dt, env);
      if (!sn.alive || sn.dying) continue;
      const r = sn.rect();
      const overlapX = pb.x < r.x + r.w && r.x < pb.x + pb.width;
      const pFeet = pb.y + pb.height;
      if (overlapX && pb.velocity.y > 40 && pFeet > r.y - 6 && pFeet < r.y + 12) {
        // skok na grzbiet pokonuje Toczka (aneks 6.3)
        sn.kill('snail-hit');
        this.player.body.setVelocityY(-this.char.jumpV0 * 0.55);
        this.addScore(ENEMY_SCORE.toczek, r.x + r.w / 2, r.y);
        this.emDust.explode(5, r.x + r.w / 2, r.y + r.h);
        this.sfx('sfx-hit', 0.4, true);
        this.maybeDrop(r.x + r.w / 2, r.y);
        continue;
      }
      if (overlapX && pb.y < r.y + r.h && r.y < pb.y + pb.height) {
        this.hurtPlayer(r.x + r.w / 2);
      }
    }
    for (const b of this.bunnies) {
      b.update(dt, env);
      if (!b.alive || b.dying) continue;
      const r = b.rect();
      const overlapX = pb.x < r.x + r.w && r.x < pb.x + pb.width;
      const pFeet = pb.y + pb.height;
      if (overlapX && b.grounded && pb.velocity.y > 40 && pFeet > r.y - 6 && pFeet < r.y + 14) {
        b.kill('bunny-hit');
        this.player.body.setVelocityY(-this.char.jumpV0 * 0.55);
        this.addScore(ENEMY_SCORE.skoczka, r.x + r.w / 2, r.y);
        this.sfx('sfx-hit', 0.4, true);
        continue;
      }
      if (overlapX && pb.y < r.y + r.h && r.y < pb.y + pb.height) {
        this.hurtPlayer(r.x + r.w / 2);
      }
    }
  }

  // ── Echo ────────────────────────────────────────────────────────────────

  private echoEnv() {
    return {
      playerX: this.player.cx,
      playerY: this.player.cy,
      playerFacing: this.player.facing,
      playerOnGround: this.player.onGround,
      standY: (c: number) => (standRow(this.map, c,
        (rr, cc) => this.extraSolid.has(cellKey(rr, cc))) + 1) * TILE,
      hideoutX: this.map.hideout ? this.map.hideout.x + 8 : null,
      levelWidthPx: this.map.widthPx,
    };
  }

  private updateEcho(dt: number): void {
    if (!this.echoE) return;
    if (this.echoE.waiting) {
      this.echoE.update(dt, this.echoEnv());
      if (Math.abs(this.player.cx - this.echoE.logic.x) < 3 * TILE) {
        this.echoE.waiting = false;
        this.toast('Echo z tobą. Gwiżdże przed pułapkami.', 2600);
        this.sfx('sfx-echo-whistle', 0.5);
      }
      return;
    }
    const env = this.echoEnv();
    const events = this.echoE.update(dt, env);
    for (const ev of events) {
      if (ev.type === 'returned') this.toast('Echo wróciła do drużyny!', 2000);
    }
    const whistles = this.echoE.logic.checkWhistle(this.hazardXs, env);
    for (const w of whistles) {
      if (w.type !== 'whistle') continue;
      this.echoE.hop(this);
      this.sfx('sfx-echo-whistle', w.first ? 0.55 : 0.35);
    }
  }

  private echoFlee(): void {
    if (!this.echoE || !this.echoPresent()) return;
    this.echoE.logic.flee();
    this.toast(EVENT_MESSAGES.echoGone, 2600);
    const idx = pickTrapsToActivate(
      this.traps.map((t) => ({ x: t.x, hidden: t.state === 'hidden' })),
      this.echoE.logic.x,
    );
    for (const i of idx) this.activateTrap(i);
    this.emitHud();
  }

  // ── złodziejaszek ───────────────────────────────────────────────────────

  private thiefEnv() {
    return {
      levelWidthPx: this.map.widthPx,
      solidAt: (r: number, c: number) => this.isSolid(r, c),
      isCactus: (r: number, c: number) => this.map.cactusCells.has(cellKey(r, c)),
      playerX: this.player.body.x,
      playerY: this.player.body.y,
    };
  }

  private updateThief(dt: number): void {
    // spawner (core/thief.ts decyduje)
    const spawn = this.thiefSpawner.update(dt, {
      levelTime: this.levelTime,
      playerX: this.player.cx,
      thiefPoints: this.map.thiefPoints.map((p) => ({ x: p.x, y: p.y })),
      echoPresent: this.echoPresent(),
      limit: THIEF_MAX[this.levelId] ?? 0,
      cooldownAfterDespawn: this.def.thiefCd ?? this.diff.thiefCd,
      anyThiefActive: !!this.thiefE,
    });
    if (spawn) {
      this.thiefE = new ThiefEntity(this, spawn.thief);
      this.warnT = spawn.warnTime;
      this.warnSide = spawn.warnSide;
      this.sfx('sfx-theft-alarm', 0.55);
    }
    // wskaźnik-strzałka na krawędzi ekranu (kolor złodzieja)
    this.warnT = Math.max(0, this.warnT - dt);
    let showWarn = false;
    let side: -1 | 1 = this.warnSide;
    if (this.thiefE && this.thiefE.logic.alive) {
      const sx = this.thiefE.logic.x - this.cameras.main.scrollX;
      if (sx < -8) { showWarn = true; side = -1; }
      else if (sx > 648) { showWarn = true; side = 1; }
      else if (this.warnT > 0) { showWarn = true; }
    } else if (this.warnT > 0 && this.thiefE) {
      showWarn = true;
    }
    this.warnArrow.setVisible(showWarn
      && Math.floor(this.time.now / 160) % 3 !== 2);
    if (showWarn) {
      this.warnArrow.setFrame(side > 0 ? 1 : 3);
      this.warnArrow.x = side > 0 ? 616 : 24;
      this.warnArrow.y = 140;
    }

    if (!this.thiefE) return;
    const events = this.thiefE.update(dt, this.thiefEnv());
    for (const ev of events) {
      if (ev.type === 'escaped') {
        if (ev.loot) this.toast('Złodziej uciekł z łupem...', 2200);
        this.emSmoke.explode(6, this.thiefE.logic.x + 8, this.thiefE.logic.y + 16);
        this.thiefE.destroy();
        this.thiefE = null;
        this.thiefSpawner.noteDespawn({ cooldownAfterDespawn: this.def.thiefCd ?? this.diff.thiefCd });
        return;
      }
    }
    // dotknięcie gracza
    const tr = this.thiefE.rect();
    const pb = this.player.body;
    const overlap = pb.x < tr.x + tr.w && tr.x < pb.x + pb.width
      && pb.y < tr.y + tr.h && tr.y < pb.y + pb.height;
    if (overlap) {
      const logic = this.thiefE.logic;
      if (logic.state === 'approach') {
        const bp = { arrows: this.arrows, hasCake: this.hasCake, diamondsLevel: this.diamondsLevel };
        const ev = logic.steal(bp, this.char.protectedBackpack, this.map.widthPx);
        const stolenDiamond = this.diamondsLevel - bp.diamondsLevel;
        this.arrows = bp.arrows;
        this.hasCake = bp.hasCake;
        this.diamondsLevel = bp.diamondsLevel;
        this.diamondsTotal -= stolenDiamond;
        if (ev.type === 'stole' && ev.loot) {
          this.thiefE.showLoot(ev.loot.kind);
          this.toast(ev.cakeStolen ? EVENT_MESSAGES.theftPlacek : 'ŁAP GO!', 2400);
          this.events.emit('hud:steal-flash');
          this.sfx('sfx-theft-alarm', 0.6);
          if (ev.cakeStolen) this.echoFlee();
        } else {
          this.toast('Pusty plecak — złodziej zmyka.', 1800);
        }
        this.emitHud();
      } else {
        this.thiefCaught();
      }
    }
  }

  private thiefCaught(): void {
    if (!this.thiefE) return;
    const logic = this.thiefE.logic;
    const ev = logic.caught();
    if (ev.type === 'caught') {
      this.addScore(ev.score, logic.x + 8, logic.y, COL.purple);
      if (ev.drop) {
        const img = this.add
          .image(ev.drop.x + 8, ev.drop.y + TILE, this.lootTexture(ev.drop.kind))
          .setDepth(-30);
        if (ev.drop.kind === 'arrow') img.setRotation(-Math.PI / 4);
        this.lootDrops.push({
          kind: ev.drop.kind, count: ev.drop.count,
          x: ev.drop.x + 8, y: ev.drop.y + TILE, ttl: ev.drop.ttl, sprite: img,
        });
      }
    }
    this.emSmoke.explode(8, logic.x + 8, logic.y + 16);
    this.sfx('sfx-hit', 0.5);
    this.thiefE.destroy();
    this.thiefE = null;
    this.thiefSpawner.noteDespawn({ cooldownAfterDespawn: this.def.thiefCd ?? this.diff.thiefCd });
  }

  private lootTexture(kind: 'cake' | 'arrow' | 'diamond'): string {
    return kind === 'cake' ? 'placek' : kind === 'arrow' ? 'arrow' : 'diamond';
  }

  private updateLoot(dt: number): void {
    for (const l of this.lootDrops) {
      l.ttl -= dt;
      if (l.ttl <= 0) {
        l.sprite.destroy();
        continue;
      }
      l.sprite.setAlpha(l.ttl < 2 ? (Math.floor(this.time.now / 120) % 2 === 0 ? 0.3 : 1) : 1);
      if (Phaser.Math.Distance.Between(this.player.cx, this.player.cy, l.x, l.y) <= PICKUP_RADIUS) {
        l.ttl = 0;
        l.sprite.destroy();
        if (l.kind === 'cake') this.hasCake = true;
        else if (l.kind === 'arrow') this.arrows = Math.min(this.arrows + l.count, ARROWS_MAX);
        else {
          this.diamondsLevel += l.count;
          this.diamondsTotal += l.count;
        }
        this.toast('Łup odzyskany!', 1600);
        this.sfx('sfx-crystal', 0.5, true);
        const { sx, sy } = this.toScreen(l.x, l.y);
        this.events.emit('hud:flight', { texture: this.lootTexture(l.kind), sx, sy, target: 'arrow' });
        this.emitHud();
      }
    }
    this.lootDrops = this.lootDrops.filter((l) => l.ttl > 0);
  }

  // ════════════════════════ ARENA ════════════════════════════════════════

  private startArena(instant: boolean): void {
    if (this.phase !== 'PLATFORM' || !this.def.dragon || this.def.arenaX === undefined) return;
    this.phase = 'ARENA';
    const arenaX0 = this.def.arenaX * TILE;
    // uszczelnienie ściany za graczem + prawa krawędź areny
    for (const rect of this.sealRects) {
      (rect.body as Phaser.Physics.Arcade.StaticBody).enable = true;
    }
    for (const img of this.sealTiles) img.setVisible(true);
    if (this.def.wallCol !== undefined) {
      for (const [r, c] of sealWallCells(this.def.wallCol)) this.extraSolid.add(cellKey(r, c));
    }
    // combat core — checkpoint z zachowanym HP przy kolejnych wejściach
    if (!this.combat) {
      const oPts = this.map.oPoints.map((o) => ({ x: o.x + 8, y: o.y + 8 }));
      this.combat = new ArenaCombat(this.def.dragon, this.diffId, arenaX0, oPts,
        this.map.dragonSpawn
          ? { spawnPos: { x: this.map.dragonSpawn.x, y: this.map.dragonSpawn.y } }
          : {});
    }
    this.dragonE = new DragonEntity(this, this.def.dragon.toLowerCase());
    // pooling fireballi
    for (let i = 0; i < 8; i++) {
      const s = this.add.image(0, 0, 'p-circle-big')
        .setTint(0xff8030).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.8).setDepth(6).setVisible(false);
      this.fireballSprites.push(s);
    }
    // checkpoint
    this.checkpointX = arenaX0 + 3 * TILE;
    this.checkpointFeetY = (standRow(this.map, this.def.arenaX + 3) + 1) * TILE;
    this.hearts = this.diff.arenaHearts[this.charId];
    this.maxHearts = this.hearts;
    // kamera: dojazd + LOCK na 80 kratek
    const cam = this.cameras.main;
    cam.stopFollow();
    const lock = () => {
      cam.setBounds(arenaX0, 0, 80 * TILE, FIELD_H);
      cam.startFollow(this.player.carrier, true, 0.14, 0.14);
      cam.setDeadzone(110, 60);
    };
    if (instant) {
      cam.setScroll(arenaX0, 0);
      lock();
    } else {
      this.tweens.add({
        targets: cam, scrollX: arenaX0, duration: 700, ease: 'Sine.inOut',
        onComplete: lock,
      });
    }
    // crossfade muzyki 0,5 s + ryk Miraża
    if (this.musicWorld) {
      this.tweens.add({
        targets: this.musicWorld, volume: 0, duration: 500,
        onComplete: () => this.musicWorld?.stop(),
      });
    }
    if (this.cache.audio.exists('music-dragon')) {
      this.musicDragon = this.sound.add('music-dragon', { loop: true, volume: 0 });
      this.musicDragon.play();
      this.tweens.add({ targets: this.musicDragon, volume: 0.55, duration: 500 });
    }
    this.dragonE.playRoar();
    this.sfx('sfx-dragon-roar', 0.7);
    cam.shake(350, 0.007);
    const name = DRAGONS[this.def.dragon].name;
    this.events.emit('hud:arena', {
      name, hp: this.combat.dragon.hp, maxHp: this.combat.dragon.maxHp,
      portraitKey: `dragon-${this.def.dragon.toLowerCase()}`,
    });
    this.toast(`Smok ${name}! Uważaj na ogień, strzelaj [X]!`, 2600);
    this.emitHud();
  }

  private updateArena(dt: number): void {
    if (!this.combat || !this.dragonE) return;
    const ev = this.combat.update(dt, this.player.cx, this.player.headY);
    this.handleCombatEvents(ev);
    this.dragonE.update(dt, this.combat.dragon, this.player.cx);
    if (this.dragonWarn) {
      this.dragonE.warnBlink(Math.floor(this.time.now / 150) % 2 === 0);
    }
    // pociski: sync poola sprite'ów ze stanem core
    const fbs = this.combat.fireballs;
    for (let i = 0; i < this.fireballSprites.length; i++) {
      const s = this.fireballSprites[i];
      const fb: Fireball | undefined = fbs[i];
      if (fb && fb.alive) {
        s.setVisible(true).setPosition(fb.x, fb.y);
        s.setScale(0.7 + 0.15 * Math.sin(this.time.now / 60 + i));
        if (Math.floor(this.time.now / 90) % 3 === 0) this.emFire.emitParticleAt(fb.x, fb.y, 1);
        // trafienie gracza
        const pb = this.player.body;
        if (this.player.iframes <= 0
          && fb.x > pb.x - 6 && fb.x < pb.x + pb.width + 6
          && fb.y > pb.y - 6 && fb.y < pb.y + pb.height + 6) {
          fb.alive = false;
          s.setVisible(false);
          this.hurtPlayer(fb.x - Math.sign(fb.vx) * 8);
        }
      } else {
        s.setVisible(false);
      }
    }
    // kryształy tarczowe (punkty `o`)
    const pk = this.combat.shieldPickups;
    while (this.shieldPickupSprites.length < pk.length) {
      const s = this.add.sprite(0, 0, 'crystal', 0).setDepth(-30);
      s.play('crystal-spin');
      this.shieldPickupSprites.push(s);
    }
    for (let i = 0; i < this.shieldPickupSprites.length; i++) {
      const s = this.shieldPickupSprites[i];
      const p = pk[i];
      if (p && p.alive) {
        s.setVisible(true).setPosition(p.x, p.y + Math.sin(this.time.now / 250 + i) * 3);
        if (Phaser.Math.Distance.Between(this.player.cx, this.player.cy, p.x, p.y) <= PICKUP_RADIUS) {
          const evs = this.combat.collectShieldPickup(i);
          this.addScore(SCORE.crystal, p.x, p.y, COL.cyan);
          this.sfx('sfx-crystal', 0.5, true);
          this.emSpark.explode(4, p.x, p.y);
          this.handleCombatEvents(evs);
        }
      } else {
        s.setVisible(false);
      }
    }
    // timer ucieczki w HUD (+ ostrzeżenie 30 s)
    const remaining = Math.max(0, Math.ceil(this.diff.dragonFlee - this.combat.arenaTime));
    if (remaining !== this.lastTimerEmit) {
      this.lastTimerEmit = remaining;
      this.events.emit('hud:timer', { remaining, warning: remaining <= 30 });
    }
  }

  private handleCombatEvents(
    events: CombatEvent[], impact?: { x: number; y: number },
  ): void {
    if (!this.combat || !this.dragonE) return;
    const d = this.combat.dragon;
    for (const ev of events) {
      switch (ev.type) {
        case 'attack': {
          const m = this.dragonE.mouthXY(d, this.player.cx);
          this.emFire.explode(8, m.x, m.y);
          this.sfx('sfx-shoot', 0.25, true);
          break;
        }
        case 'deflect':
          this.emSpark.explode(10, ev.x, ev.y);
          this.sfx('sfx-shield-clink', 0.55);
          break;
        case 'hit': {
          this.dragonHits++;
          const hx = impact?.x ?? d.x + d.w / 2;
          const hy = impact?.y ?? d.y + d.h / 2;
          this.dragonE.hitReact();
          this.emHitSpark.explode(10, hx, hy);
          this.emHitDot.explode(7, hx, hy);
          this.hitStop(60);
          this.floatText(hx, hy - 16, 'TRAF!', COL.gold, 12);
          this.sfx('sfx-hit', 0.6, true);
          this.events.emit('hud:hp', { hp: ev.hp });
          break;
        }
        case 'stunned':
          this.floatText(d.x + d.w / 2, d.y - 20, '* * *', COL.cyan, 10);
          break;
        case 'shieldDown':
          this.emSpark.explode(24, d.x + d.w / 2, d.y + d.h / 2);
          this.sfx('sfx-shield-explode', 0.6);
          this.toast('Tarcza zbita! Strzelaj!', 1800);
          break;
        case 'shieldUp':
          this.sfx('sfx-shield-clink', 0.35);
          break;
        case 'fleeWarning':
          this.dragonWarn = true;
          this.toast(EVENT_MESSAGES.dragonEscaping, 2600);
          break;
        case 'fleeStart':
          this.dragonWarn = false;
          this.dragonE.warnBlink(false);
          this.toast(EVENT_MESSAGES.dragonFlees, 2600);
          break;
        case 'fled':
          this.onDragonFled();
          break;
        case 'dying':
          this.dragonWarn = false;
          this.dragonE.warnBlink(false);
          this.slowmo();
          break;
        case 'defeated':
          this.onDragonDefeated();
          break;
        default:
          break;
      }
    }
  }

  private onDragonFled(): void {
    this.phase = 'PLATFORM';
    this.dragonE?.hide();
    this.activateAllTraps();
    for (const rect of this.sealRects) {
      (rect.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    }
    for (const img of this.sealTiles) img.setVisible(false);
    this.extraSolid.clear();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.widthPx, FIELD_H);
    this.events.emit('hud:arena-end');
    if (this.musicDragon) {
      this.tweens.add({
        targets: this.musicDragon, volume: 0, duration: 500,
        onComplete: () => this.musicDragon?.stop(),
      });
    }
    if (this.musicWorld) {
      (this.musicWorld as Phaser.Sound.WebAudioSound).setVolume(0.5);
      this.musicWorld.play();
    }
  }

  private onDragonDefeated(): void {
    if (!this.combat || !this.dragonE || !this.def.dragon) return;
    this.phase = 'VICTORY';
    const d = this.combat.dragon;
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    this.dragonE.hide();
    this.emBoom.explode(46, cx, cy);
    this.emSpark.explode(24, cx, cy);
    this.addScore(SCORE.dragon, cx, cy - 10);
    this.sfx('sfx-fanfare', 0.7);
    this.musicDragon?.stop();
    if (this.cache.audio.exists('music-victory')) {
      this.sound.play('music-victory', { volume: 0.55 });
    }
    this.events.emit('hud:arena-end');
    const name = DRAGONS[this.def.dragon].name;
    const msg = WIN_MESSAGES[0];
    const cont = this.overlayBox([
      { text: `${name} WOLNY!`, size: 15, color: COL.gold },
      { text: msg, size: 15, color: COL.white },
    ]);
    this.time.delayedCall(2400, () => {
      cont.destroy();
      this.levelComplete(true);
    });
  }

  // ── koniec poziomu ──────────────────────────────────────────────────────

  private levelComplete(dragonDefeated: boolean): void {
    if (this.frozen) return;
    this.frozen = true;
    this.score += SCORE.level;
    const bonus = Math.max(0, Math.round(this.def.par - this.levelTime)) * SCORE.timeBonusMult;
    this.score += bonus;
    const stars = 1
      + (this.crystals >= this.map.crystalTotal ? 1 : 0)
      + (this.lostLifeThisLevel ? 0 : 1);
    this.musicWorld?.stop();
    this.musicDragon?.stop();
    this.scene.stop('HUD');
    this.scene.start('Summary', {
      levelId: this.levelId,
      score: this.score,
      time: this.levelTime,
      stars,
      crystals: this.crystals,
      crystalTotal: this.map.crystalTotal,
      diamonds: this.diamondsLevel,
      arrows: this.arrows,
      hasCake: this.hasCake,
      diamondsTotal: this.diamondsTotal,
      dragonDefeated,
      dragonId: dragonDefeated ? this.def.dragon : null,
    });
  }

  // ── pauza / mute ────────────────────────────────────────────────────────

  private openPause(): void {
    this.sfx('sfx-ui-click', 0.4);
    devMark({ pauseOpened: true });
    this.scene.launch('Pause', { levelKey: 'Level' });
    this.scene.pause();
  }

  private toggleMute(): void {
    this.save.muted = !this.save.muted;
    this.sound.mute = this.save.muted;
    const st = localStorageAdapter();
    if (st) writeSave(st, this.save);
    this.toast(this.save.muted ? 'Dźwięk: WYŁ [M]' : 'Dźwięk: WŁ [M]', 1200);
  }
}
