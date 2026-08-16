/**
 * Level — fazy PLATFORM, ARENA i RUNNER (F3/F4: wszystkie światy).
 *
 * Zasada architektury (PRD 2.0 §10): logika decyzyjna w core/ (thief, monkey,
 * combat, runnerPattern, physicsSim, mapParser) — ta scena buduje świat
 * z ParsedMap/RunnerState, renderuje i woła core. Hitboksy z balance;
 * pooling pocisków i particles; localStorage tylko przez core/save.ts.
 */
import Phaser from 'phaser';
import {
  ARROW_RANGE, ARROW_SPEED, ARROWS_MAX, CharacterId, CharacterStats,
  CHARACTERS, DIFFICULTY, DifficultyId, DifficultySettings, HURT_KNOCKBACK,
  MAGIC_MAX, MAGIC_PER_CRYSTALS, PICKUP_RADIUS, SCORE, ENEMY_SCORE, TILE,
  ECHO_MAGNET_R, TRAP_TELEGRAPH,
  BOULDER_FALL_SPEED, BOULDER_HIDDEN_TIME, BOULDER_LIE_TIME, BOULDER_TELEGRAPH,
  ENEMY_DROP_CHANCE, GEYSER_CYCLE, GEYSER_REST, GEYSER_WARN,
  PLAYER_H, POWERUP_MAGNET_R, POWERUP_MAGNET_TIME, POWERUP_SHIELD_TIME,
  RUNNER_GROUND_Y, RUNNER_PLAYER_X, RunnerId,
  VANISH_BLINK_TIME, VANISH_GONE_TIME,
} from '../core/balance';
import {
  cellKey, ParsedMap, parseMap, PickupKind, solidAt, standRow, sealWallCells,
  VanishSegment,
} from '../core/mapParser';
import { ArenaCombat, CombatEvent, Fireball, GroundFlame } from '../core/combat';
import {
  Backpack, Loot, Mound, returnLoot, ThiefEvent, ThiefSpawner,
} from '../core/thief';
import { pickTrapsToActivate, recordLifeLoss } from '../core/monkey';
import { loadSave, localStorageAdapter, SaveData, writeSave } from '../core/save';
import {
  checkObstacleHit, collectRunnerPickups, GateState, gateRequirement,
  runnerArrowHit, runnerGearsFor, RunnerState,
} from '../core/runnerPattern';
import { createSim, SimEnv, simStep, SimState } from '../core/physicsSim';
import {
  BOSS_P2_PLATFORMS, LEVEL_DEF, LevelDef, MAPS, RUNNER_PATTERNS, THIEF_MAX,
  DRAGONS,
} from '../data/levels';
import {
  EVENT_MESSAGES, GAME_OVER, LEVEL_INTROS, LOSS_MESSAGES, VABANK_TAUNTS,
  WIN_MESSAGES,
} from '../data/texts';
import { Player } from '../entities/Player';
import { Toczek, Skoczka, Machacz, ToczekSkin } from '../entities/enemies';
import { RunnerPlayerView } from '../entities/RunnerPlayer';
import { ThiefEntity } from '../entities/ThiefEntity';
import { EchoEntity } from '../entities/EchoEntity';
import { DragonEntity } from '../entities/DragonEntity';
import { COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';
import { RENDER_SCALE } from '../ui/hiRes';
import { devMark, devParam } from '../dev';

const GAME_FIELD_Y = 40;    // wiersz HUD 40 px NAD polem gry 320 px
const FIELD_H = 320;

// ── hi-res (bufor ×2, kamera pola gry z zoom ×2 — patrz ui/hiRes.ts) ──────
// Zoom Phasera skaluje wokół ŚRODKA viewportu, stąd dwie konsekwencje:
//  · scrollX/scrollY to już NIE lewy-górny róg kadru — róg czytaj z
//    cam.worldView.x/y; przy zapisie scrolla celuj w „róg − HIRES_OFF";
//  · obiekty setScrollFactor(0) rysują się o HIRES_OFF za wysoko/w lewo —
//    ich pozycje przesuwamy o +HIRES_OFF (kompensacja stała, bo zoom=2).
const HIRES_OFF_X = 320;          // pół logicznej szerokości kadru (640/2)
const HIRES_OFF_Y = FIELD_H / 2;  // pół logicznej wysokości pola gry

import { SCENE_MESSAGES, THIEF_MESSAGES as THIEF_MSG } from '../data/texts';
import { speakText, speakTexts, stopSpeech } from '../ui/speak';

/** rate muzyki per bieg runnera (spec playtest2: 1.00 / 1.04 / 1.08 / 1.12) */
const GEAR_MUSIC_RATE = [1.0, 1.04, 1.08, 1.12] as const;
/** linie prędkości: kreski na sekundę dla biegów 1–4 (od biegu 2) */
const GEAR_LINES_PER_S = [0, 2, 4, 6] as const;

/** tint wariantów świata 3 (aneks 6.3: ognisty nietoperz / lawowa żabka) */
const WORLD3_ENEMY_TINT = 0xffa080;

/**
 * Meta 3-3 (czysty sprint bez areny): syntetyczna mapa pod fazę po runnerze
 * (parser wymaga P i E; brama bossa zastępuje wyjście — E poza zasięgiem
 * do chwili otwarcia bramy, poziom kończy levelComplete() po bramie).
 */
const RUNNER_FINISH_MAP: string[] = [
  ...Array.from({ length: 18 }, () => ''),
  '          P                                                           E   ',
  '================================================================================',
];

type Phase = 'PLATFORM' | 'ARENA' | 'RUNNER' | 'VICTORY';

interface PickupEntity {
  kind: PickupKind;
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

/** gejzer (aneks 6.4): cykl 4 s = spoczynek 2 → bulgot 1 → erupcja 1 */
interface GeyserEntity {
  c: number; x: number; baseY: number;
  state: 'rest' | 'warn' | 'erupt';
  sprite: Phaser.GameObjects.Image;
}

/** głaz Rock Head (aneks 6.4): telegraf trzęsienia 0,8 s → spada 20 w/s */
interface BoulderEntity {
  x: number; y0: number; y: number;
  /** y (px środka), na którym głaz ląduje (pierwszy solid pod spawnem) */
  restY: number;
  state: 'armed' | 'telegraph' | 'fall' | 'lie' | 'hidden';
  t: number;
  sprite: Phaser.GameObjects.Image;
  bang: Phaser.GameObjects.Text;
}

/** znikająca platforma / most z lian (aneks 6.4): miga 1,2 s → znika 2 s */
interface VanishEntity {
  seg: VanishSegment;
  state: 'idle' | 'blink' | 'gone';
  t: number;
  images: Phaser.GameObjects.Sprite[];
  rect: Phaser.GameObjects.Rectangle;
}

/** power-up (aneks 7): aktywny maks. 1, nowy nadpisuje */
interface PowerupState { kind: 'shield' | 'magnet'; t: number; total: number }

/** stan wejścia dotykowego na klatkę (kontrakt registry — TouchControls.ts) */
interface TouchFrame {
  left: boolean; right: boolean; down: boolean;
  jump: boolean; shoot: boolean; magic: boolean; use: boolean;
}

const TOUCH_EDGE_KEYS = {
  jump: 'touch.jumpPressed',
  shoot: 'touch.shootPressed',
  magic: 'touch.magicPressed',
  use: 'touch.usePressed',
} as const;
type TouchEdgeId = keyof typeof TOUCH_EDGE_KEYS;

export class LevelScene extends Phaser.Scene {
  // ── konfiguracja poziomu ────────────────────────────────────────────────
  private levelId = '1-1';
  private def!: LevelDef;
  private world: 1 | 2 | 3 = 1;
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
  private machacze: Machacz[] = [];
  private machaczFired: boolean[] = [];
  private geysers: GeyserEntity[] = [];
  private bouldersE: BoulderEntity[] = [];
  private vanishE: VanishEntity[] = [];
  private lavaCells = new Set<number>();
  private powerup: PowerupState | null = null;
  private powerupBar: Phaser.GameObjects.Rectangle | null = null;
  private echoE: EchoEntity | null = null;
  private thiefE: ThiefEntity | null = null;
  private thiefSpawner = new ThiefSpawner();
  /** kopczyk z zakopanym łupem (spec playtest2) — maks. 1, bez TTL */
  private mound: Mound | null = null;
  private moundSprite: Phaser.GameObjects.Image | null = null;
  private moundBar: Phaser.GameObjects.Rectangle | null = null;
  private thiefEdgeMsgShown = false;
  private thiefPantT = 0;
  private arrowPool: ArrowShot[] = [];
  private warnArrow!: Phaser.GameObjects.Image;
  private warnDollar: Phaser.GameObjects.Text | null = null;
  private warnT = 0;
  private warnSide: -1 | 1 = 1;
  private skyLayers: Array<{ ts: Phaser.GameObjects.TileSprite; factor: number; drift: number }> = [];

  // ── arena ───────────────────────────────────────────────────────────────
  private combat: ArenaCombat | null = null;
  private dragonE: DragonEntity | null = null;
  private fireballSprites: Phaser.GameObjects.Image[] = [];
  private shieldPickupSprites: Phaser.GameObjects.Sprite[] = [];
  private flameRects: Phaser.GameObjects.Rectangle[] = [];
  private flameShimmer: Phaser.GameObjects.Rectangle | null = null;
  private checkpointX = 0;
  private checkpointFeetY = 304;
  private dragonWarn = false;
  private lastTimerEmit = -1;
  private dragonHits = 0;

  // ── BOSS (aneks 8.4.3) ──────────────────────────────────────────────────
  private vabank: Phaser.GameObjects.Sprite | null = null;
  private vabankHopY = { v: 0 };
  private vabankBubble: Phaser.GameObjects.Container | null = null;
  private vabankBubbleT = 0;
  private weakMark: Phaser.GameObjects.Text | null = null;
  private bossTeleStrip: Phaser.GameObjects.Rectangle | null = null;
  private shockSprites: Phaser.GameObjects.Image[] = [];
  private waveSprites: Phaser.GameObjects.Image[] = [];
  private boulderSprites: Phaser.GameObjects.Image[] = [];
  private bossPlatformsSpawned = false;

  // ── runner (faza RUNNER — core/runnerPattern steruje) ───────────────────
  private rn: RunnerState | null = null;
  private rnSim: SimState | null = null;
  private rnView: RunnerPlayerView | null = null;
  private rnGround: Phaser.GameObjects.Image[] = [];
  private rnObSprites: Phaser.GameObjects.Sprite[] = [];
  private rnObDead: boolean[] = [];
  private rnCrystalSprites: Phaser.GameObjects.Sprite[] = [];
  private rnArrowSprites: Phaser.GameObjects.Image[] = [];
  private rnChaser: Phaser.GameObjects.Sprite | null = null;
  private rnChaserT = 0;
  private rnObSeen: boolean[] = [];
  private rnFinished = false;
  private rnWasGround = true;
  private rnLastProgress = -1;
  /** system biegów (spec playtest2): fanfara / chevrony / rate muzyki / linie */
  private rnLastGear = 1;
  private rnMusicRate = 1;
  private rnLines: Array<{ rect: Phaser.GameObjects.Rectangle; alive: boolean }> = [];
  private rnLineSpawnT = 0;
  private gateLogic: GateState | null = null;
  private gateCont: Phaser.GameObjects.Container | null = null;
  private gateGlow: Phaser.GameObjects.Rectangle | null = null;
  private gateOpening = false;
  /** ponowienie toastu bramy, gdy gracz tkwi pod zamkniętą bramą > 3 s */
  private gateBlockedT = 0;

  // ── dotyk (kontrakt registry — nagłówek TouchControls.ts) ───────────────
  private touchLast: Record<TouchEdgeId, number> = { jump: 0, shoot: 0, magic: 0, use: 0 };
  private touchFrame: TouchFrame = {
    left: false, right: false, down: false,
    jump: false, shoot: false, magic: false, use: false,
  };

  // ── efekty ──────────────────────────────────────────────────────────────
  private emDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emSpark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emFire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emHitSpark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emHitDot!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emBoom!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emSmoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emGeyser!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emConfetti!: Phaser.GameObjects.Particles.ParticleEmitter;
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
    if (qLevel && LEVEL_DEF[qLevel]
      && (MAPS[qLevel] || LEVEL_DEF[qLevel].kind === 'RUNNER')) {
      this.levelId = qLevel;
    }
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
    this.world = this.def.world;
    // runner: mapa fazy po sekcji (arena 1-3/2-3 albo meta 3-3)
    const isRunner = this.def.kind === 'RUNNER';
    if (isRunner && this.def.arenaMap) {
      this.map = parseMap(MAPS[this.def.arenaMap], this.def.arenaMap);
    } else if (isRunner) {
      this.map = parseMap(RUNNER_FINISH_MAP, `${this.levelId}-meta`);
    } else {
      this.map = parseMap(MAPS[this.levelId], this.levelId);
    }
    this.thinStaticHazards();

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
    this.buildParticles();
    this.setupInput();
    this.setupMusic();

    const arenaJump = !!devParam('arena');
    if (isRunner && !(arenaJump && this.def.dragon)) {
      this.phase = 'RUNNER';
      this.buildRunner();
    } else {
      this.buildPlatformWorld();
      if (this.levelId === '2-2') this.activateAllTraps();   // aneks 8.6: `!` aktywne od startu
      if (isRunner) {
        // dev: ?arena=1 na runnerze → prosto do areny smoka-uciekiniera
        this.startRunnerArena();
      }
    }

    // HUD — osobna scena-nakładka (restartowana razem z Level)
    if (this.scene.isActive('HUD') || this.scene.isPaused('HUD')) this.scene.stop('HUD');
    this.scene.launch('HUD', { levelKey: 'Level' });

    // nakładka dotykowa (PRD 7) — jak w Menu; wejście dev-paramem ją pomija
    if (!this.scene.isActive('TouchControls')) this.scene.launch('TouchControls');
    this.readTouch();   // sync liczników edge (bez stale-naciśnięć po restarcie)

    // dev: ?magic=3 → strzały magiczne od startu (e2e bossa)
    const qMagic = devParam('magic');
    if (qMagic) {
      const v = parseInt(qMagic, 10);
      if (Number.isFinite(v)) this.magic = Math.max(0, Math.min(MAGIC_MAX, v));
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.musicWorld?.stop();
      this.musicDragon?.stop();
      stopSpeech();
      this.game.registry.set('touch.runnerMode', false);
      this.game.registry.set('touch.ctxUse', false);
    });

    this.time.delayedCall(150, () => {
      if (this.phase === 'PLATFORM') this.toast(LEVEL_INTROS[this.levelId] ?? '', 2600);
      else if (this.phase === 'RUNNER') {
        this.toast(LEVEL_INTROS[this.levelId] ?? '', 2400);
        this.time.delayedCall(2600, () => {
          if (this.phase === 'RUNNER' && !this.frozen && !this.rnFinished) {
            this.toast('► ► ►  PĘDZIMY!   [SPACJA]=skok  [↓]=ślizg', 2600);
          }
        });
      }
    });

    // dev: ?arena=1 → skok prosto do areny (typ B); ?thief=1 → złodziej od razu
    if (devParam('thief')) this.levelTime = 25;
    if (arenaJump && !isRunner && this.map.trigger) {
      const t = this.map.trigger;
      this.player.respawn(t.x + 24, (standRow(this.map, t.c) + 1) * TILE);
      this.startArena(true);
    }
    // dev: ?px=45 → gracz na kolumnie 45; ?ex=40 → Echo na kolumnie 40
    // (e2e poprawek z playtestu: kadr gęstości kaktusów, skok Echo nad kolcami)
    const qPx = devParam('px');
    if (qPx && !arenaJump && !isRunner && this.phase === 'PLATFORM') {
      const c = parseInt(qPx, 10);
      if (Number.isFinite(c)) {
        this.player.respawn(c * TILE + 8, (standRow(this.map, c) + 1) * TILE);
      }
    }
    const qEx = devParam('ex');
    if (qEx && this.echoE) {
      const c = parseInt(qEx, 10);
      if (Number.isFinite(c)) this.echoE.logic.x = c * TILE + 8;
    }
    devMark({
      scene: 'Level', level: this.levelId, phase: this.phase, dragonHits: 0,
      cacti: this.map.cacti.length, spikes: this.map.spikes.length,
    });
  }

  /** świat platformowy z ParsedMap (fazy PLATFORM/ARENA; też areny po runnerze) */
  private buildPlatformWorld(): void {
    this.buildTerrain();
    this.buildPickups();
    this.buildTraps();
    this.buildEnemies();
    this.buildGeysers();
    this.buildBoulders();
    this.buildVanish();
    this.buildLava();
    this.buildEcho();
    this.buildExit();
    this.buildPlayer();
    this.buildWarnArrow();
    this.setupCamera();
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
    this.machacze = [];
    this.machaczFired = [];
    this.geysers = [];
    this.bouldersE = [];
    this.vanishE = [];
    this.bossPlatformsUp = false;
    this.lavaCells = new Set();
    this.powerup = null;
    this.powerupBar = null;
    this.echoE = null;
    this.thiefE = null;
    this.thiefSpawner = new ThiefSpawner();
    this.mound = null;
    this.moundSprite = null;
    this.moundBar = null;
    this.thiefEdgeMsgShown = false;
    this.thiefPantT = 0;
    this.warnDollar = null;
    this.arrowPool = [];
    this.skyLayers = [];
    this.combat = null;
    this.dragonE = null;
    this.fireballSprites = [];
    this.shieldPickupSprites = [];
    this.flameRects = [];
    this.flameShimmer = null;
    this.dragonWarn = false;
    this.lastTimerEmit = -1;
    this.dragonHits = 0;
    this.vabank = null;
    this.vabankHopY = { v: 0 };
    this.vabankBubble = null;
    this.vabankBubbleT = 0;
    this.weakMark = null;
    this.bossTeleStrip = null;
    this.shockSprites = [];
    this.waveSprites = [];
    this.boulderSprites = [];
    this.bossPlatformsSpawned = false;
    this.gateBlockedT = 0;
    this.touchFrame = {
      left: false, right: false, down: false,
      jump: false, shoot: false, magic: false, use: false,
    };
    this.warnT = 0;
    this.musicWorld = null;
    this.musicDragon = null;
    this.rn = null;
    this.rnSim = null;
    this.rnView = null;
    this.rnGround = [];
    this.rnObSprites = [];
    this.rnObDead = [];
    this.rnCrystalSprites = [];
    this.rnArrowSprites = [];
    this.rnChaser = null;
    this.rnChaserT = 0;
    this.rnObSeen = [];
    this.rnFinished = false;
    this.rnWasGround = true;
    this.rnLastProgress = -1;
    this.rnLastGear = 1;
    this.rnMusicRate = 1;
    this.rnLines = [];
    this.rnLineSpawnT = 0;
    this.gateLogic = null;
    this.gateCont = null;
    this.gateGlow = null;
    this.gateOpening = false;
  }

  // ════════════════════════ BUDOWA ŚWIATA ════════════════════════════════

  private buildBackdrop(): void {
    if (this.world === 1) {
      // niebo: okno źródła 90–128 px wygładzonego assetu (linia lawendowej
      // poświaty pod HUD + czysty błękit) — strefa przejścia pasm (wiersze
      // 79–89: dither + szarość) rozciągnięta na pół ekranu wygląda jak glitch
      const sky = this.add.tileSprite(HIRES_OFF_X, HIRES_OFF_Y, 640, FIELD_H, 'world1-sky')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
      sky.tileScaleX = FIELD_H / 38;
      sky.tileScaleY = FIELD_H / 38;
      sky.tilePositionY = 90;
      const small = this.add.tileSprite(HIRES_OFF_X, HIRES_OFF_Y + 56, 640, 48, 'world1-clouds-small')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(-95);
      const big = this.add.tileSprite(HIRES_OFF_X, HIRES_OFF_Y + 148, 640, 101, 'world1-clouds-big')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(-90);
      this.skyLayers = [
        { ts: sky, factor: 0, drift: 0 },
        { ts: big, factor: 0.2, drift: 3 },
        { ts: small, factor: 0.45, drift: 7 },
      ];
      return;
    }
    // światy 2-3: pionowy gradient nieba + 2 warstwy sylwetek (scroll 0,2/0,45)
    const skyKey = this.world === 2 ? 'world2-sky' : 'world3-sky';
    const farKey = this.world === 2 ? 'world2-far' : 'world3-far';
    const nearKey = this.world === 2 ? 'world2-near' : 'world3-near';
    const farH = this.world === 2 ? 192 : 176;
    const nearH = this.world === 2 ? 144 : 128;
    const sky = this.add.tileSprite(HIRES_OFF_X, HIRES_OFF_Y, 640, FIELD_H, skyKey)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
    const far = this.add.tileSprite(HIRES_OFF_X, HIRES_OFF_Y + FIELD_H - farH, 640, farH, farKey)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-95);
    const near = this.add.tileSprite(HIRES_OFF_X, HIRES_OFF_Y + FIELD_H - nearH, 640, nearH, nearKey)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-90);
    this.skyLayers = [
      { ts: sky, factor: 0, drift: 0 },
      { ts: far, factor: 0.2, drift: this.world === 2 ? 1 : 0 },
      { ts: near, factor: 0.45, drift: 0 },
    ];
  }

  /** tileset terenu per świat (ten sam układ 17×5 co terrain-sand) */
  private terrainTex(): string {
    return this.world === 1 ? 'terrain-sand'
      : this.world === 2 ? 'terrain-jungle' : 'terrain-obsidian';
  }

  /** kaktus / kolczasty krzak / lawowy kaktus (aneks 6.4) */
  private cactusTex(): string {
    return this.world === 1 ? 'cactus-big'
      : this.world === 2 ? 'cactus-bush-big' : 'cactus-lava-big';
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

  /**
   * ŁATWY naprawdę łatwiejszy — zgłoszenie zamawiającej (playtest rodzinny,
   * 7 lat): „jest tam za dużo kaktusów". Sekcja 8.7 różnicuje serca/HP/timery,
   * ale nie gęstość przeszkód na planszach — wyrównujemy to TUTAJ, przy
   * spawnie: na ŁATWYM pomijamy co drugi statyczny hazard mapy (kaktus /
   * kolczasty krzak / lawowy kaktus / pas kolców `^`), w Trybie Skrzat
   * (niezależny przełącznik) usuwamy 2 z 3. Deterministycznie w kolejności
   * czytania mapy — układ stabilny między uruchomieniami. Kolce liczymy pasami
   * (ciągły odcinek `^^^` = jedna przeszkoda, jak w tabeli 8.6).
   * NIE ruszamy: pułapek fabularnych `!` (skrypt Echo/2-2), przeszkód
   * RUNNERÓW (trudność reguluje tam core: tabela biegów runnerGears),
   * lawy (integralna część świata 3), gejzerów i głazów (telegrafowane).
   * Mapy ASCII i walidatory ekonomii zostają nietknięte — przerzedzamy
   * wyłącznie sparsowaną kopię tej sceny.
   */
  private thinStaticHazards(): void {
    const keepEvery = this.save.skrzat ? 3 : this.diffId === 'LATWY' ? 2 : 1;
    if (keepEvery === 1) return;
    const m = this.map;
    m.cacti = m.cacti.filter((_, i) => i % keepEvery === 0);
    m.cactusCells = new Set();
    for (const k of m.cacti) {
      m.cactusCells.add(cellKey(k.r, k.c));
      m.cactusCells.add(cellKey(k.r - 1, k.c));
    }
    // kolce: grupuj przylegające `^` (ten sam wiersz, kolejne kolumny) w pasy
    let strip = -1;
    let prevR = -9;
    let prevC = -9;
    m.spikes = m.spikes.filter((s) => {
      if (s.r !== prevR || s.c !== prevC + 1) strip++;
      prevR = s.r;
      prevC = s.c;
      return strip % keepEvery === 0;
    });
    m.spikeCells = new Set(m.spikes.map((s) => cellKey(s.r, s.c)));
  }

  private buildTerrain(): void {
    const tex = this.terrainTex();
    // widoczne kafle
    for (const t of this.map.solidTiles) {
      this.add.image(t.x + 8, t.y + 8, tex, this.sandFrame(t.r, t.c)).setDepth(-50);
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
          .image(c * TILE + 8, r * TILE + 8, tex, 17 + 4)
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
    // dekoracje na wierzchołkach gruntu (deterministycznie co ~kilkanaście kolumn)
    let placed = 0;
    for (const t of this.map.solidTiles) {
      if (t.kind !== 'ground') continue;
      if (this.map.solidSet.has(cellKey(t.r - 1, t.c))) continue;
      if (this.world === 1) {
        // palmy (świat 1)
        if (t.c % 13 !== 5) continue;
        const frame = placed % 3 === 2 ? 4 : 0;
        const palm = this.add.sprite(t.x + 8, t.y + 1, 'palms', frame)
          .setOrigin(0.5, 1).setDepth(-60);
        if (frame === 0) palm.play({ key: 'palm-sway', startFrame: placed % 4 });
        placed++;
      } else if (this.world === 3) {
        // pochodnie (świat 3 — skarbiec/jaskinie)
        if (t.c % 19 !== 7) continue;
        const torch = this.add.sprite(t.x + 8, t.y + 1, 'torch', 0)
          .setOrigin(0.5, 1).setDepth(-60);
        torch.play({ key: 'torch-flame', startFrame: placed % 4 });
        placed++;
      }
      // świat 2: klimat niosą warstwy tła (sylwetki palm, liany)
    }
    // kaktusy i kolce (pułapki statyczne) — wariant kaktusa per świat
    const cactus = this.cactusTex();
    for (const k of this.map.cacti) {
      this.add.image(k.x + 8, k.y + TILE, cactus).setOrigin(0.5, 1).setDepth(-40);
      this.hazardXs.push(k.x + 8);
    }
    for (const s of this.map.spikes) {
      const img = this.add.image(s.x + 8, s.y + TILE, 'spikes').setOrigin(0.5, 1).setDepth(-40);
      if (this.world === 3) img.setTint(WORLD3_ENEMY_TINT);
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
      case 'pw_shield': return { key: 'powerup-shield' };
      case 'pw_magnet': return { key: 'powerup-magnet' };
    }
  }

  private buildPickups(): void {
    for (const p of this.map.pickups) {
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
    // warianty na świat (aneks 6.3): Skorpionik / Żuk liściowy / Żar-żuk
    const skin: ToczekSkin = this.world === 2 ? 'slime' : 'snail';
    const toczekTint = this.world === 3 ? 0xff7050 : 0xffffff;
    const tint = this.world === 3 ? WORLD3_ENEMY_TINT : 0xffffff;
    for (const e of this.map.enemies) {
      if (e.kind === 'toczek') this.snails.push(new Toczek(this, e.r, e.c, skin, toczekTint));
      else this.bunnies.push(new Skoczka(this, e.r, e.c, tint));
    }
    this.machaczFired = this.map.machaczTriggers.map(() => false);
  }

  private buildGeysers(): void {
    for (const g of this.map.geysers) {
      const baseY = (g.r + 1) * TILE;
      const sprite = this.add.image(g.x + 8, baseY + 1, 'geyser-base')
        .setOrigin(0.5, 1).setDepth(-40);
      this.geysers.push({ c: g.c, x: g.x + 8, baseY, state: 'rest', sprite });
      this.hazardXs.push(g.x + 8);
    }
  }

  private buildBoulders(): void {
    for (const b of this.map.boulders) {
      const x = b.x + 8;
      const y0 = b.y + 8;
      // punkt lądowania: głaz leży NA półce (solid tuż pod spawnem) i spada
      // za nią w dół („nie zatrzymuj się pod półką" — aneks 6.4); ląduje na
      // pierwszym solidzie poniżej półki (albo wpada w przepaść)
      let restY = 20 * TILE + 40;
      for (let rr = b.r + 2; rr < this.map.heightTiles; rr++) {
        if (this.map.solidSet.has(cellKey(rr, b.c))) {
          restY = rr * TILE - 10;
          break;
        }
      }
      const sprite = this.add.image(x, y0, 'boulder').setDepth(-35);
      sprite.setDisplaySize(20, 20);
      const bang = this.add.text(x, y0 - 18, '!', {
        fontFamily: FONT_TITLE, fontSize: '14px', color: COL.danger,
        stroke: COL.ink, strokeThickness: 4,
      }).setOrigin(0.5).setDepth(20).setVisible(false);
      this.bouldersE.push({ x, y0, y: y0, restY, state: 'armed', t: 0, sprite, bang });
      this.hazardXs.push(x);
    }
  }

  private buildVanish(): void {
    const tex = this.world === 2 ? 'platform-liana' : 'platform-falling';
    const anim = this.world === 2 ? 'platform-liana-on' : 'platform-falling-on';
    for (const seg of this.map.vanish) {
      const rect = this.add
        .rectangle(seg.x + seg.widthPx / 2, seg.y + 8, seg.widthPx, TILE)
        .setVisible(false);
      this.physics.add.existing(rect, true);
      const images: Phaser.GameObjects.Sprite[] = [];
      for (let i = 0; i < Math.ceil(seg.widthPx / 32); i++) {
        const s = this.add.sprite(seg.x + i * 32 + 16, seg.y + 6, tex, 0).setDepth(-45);
        s.play({ key: anim, startFrame: i % 4 });
        images.push(s);
      }
      for (let c = seg.c0; c <= seg.c1; c++) this.extraSolid.add(cellKey(seg.r, c));
      this.vanishE.push({ seg, state: 'idle', t: 0, images, rect });
    }
  }

  /** świat 3: pas lawy w przerwach dolnego wiersza (dotyk = jak kolce) */
  private buildLava(): void {
    if (this.world !== 3 || this.def.kind === 'BOSS') return;
    const bottom = this.map.heightTiles - 1;   // wiersz 19
    let c = 0;
    while (c < this.map.widthTiles) {
      if (this.map.solidSet.has(cellKey(bottom, c))) { c++; continue; }
      const c0 = c;
      while (c < this.map.widthTiles && !this.map.solidSet.has(cellKey(bottom, c))) c++;
      const x0 = c0 * TILE;
      const x1 = c * TILE;
      const w = x1 - x0;
      for (let cc = c0; cc < c; cc++) this.lavaCells.add(cellKey(bottom, cc));
      // tafla: baza + jaśniejsza linia powierzchni + żar (particles, nie asset)
      this.add.rectangle(x0 + w / 2, bottom * TILE + 11, w, 10, 0x7a1a10).setDepth(-46);
      this.add.rectangle(x0 + w / 2, bottom * TILE + 5, w, 4, 0xff6a28, 0.95)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(-46);
      this.add.particles(0, 0, 'p-circle-small', {
        x: { min: x0 + 4, max: x1 - 4 }, y: bottom * TILE + 6,
        speedY: { min: -34, max: -10 }, speedX: { min: -6, max: 6 },
        lifespan: { min: 400, max: 900 },
        scale: { start: 0.5, end: 0 }, alpha: { start: 0.9, end: 0 },
        tint: [0xff8030, 0xffd23f, 0xff4020],
        blendMode: Phaser.BlendModes.ADD,
        frequency: Math.max(60, 900 / (w / TILE)), quantity: 1,
      }).setDepth(-44);
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
    this.physics.add.collider(this.player.carrier, this.vanishE.map((v) => v.rect));
    this.ensureArrowPool();
  }

  /** pooling strzał: 12 sprite'ów tworzonych raz (wspólny dla faz) */
  private ensureArrowPool(): void {
    if (this.arrowPool.length > 0) return;
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
    // kolumna gejzeru (świat 3: żar; emitowana punktowo w updateGeysers)
    this.emGeyser = this.add.particles(0, 0, 'p-circle-small', {
      angle: { min: 255, max: 285 }, speed: { min: 90, max: 190 },
      lifespan: { min: 250, max: 450 }, gravityY: 220,
      scale: { start: 0.65, end: 0.1 }, alpha: { start: 0.95, end: 0 },
      tint: [0xff8030, 0xffd23f, 0xff5020],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(6);
    // konfetti 'p-star' — zwycięstwo nad BOSSEM (PRD 5.4: więcej particles);
    // depth NAD nakładką zwycięstwa (200) — feta widoczna też na overlayu
    this.emConfetti = this.add.particles(0, 0, 'p-star', {
      speed: { min: 60, max: 240 }, gravityY: 160,
      lifespan: { min: 700, max: 1500 }, rotate: { start: 0, end: 360 },
      scale: { start: 1.35, end: 0.25 }, alpha: { start: 1, end: 0 },
      tint: [COLN.gold, 0xff8ac9, COLN.cyan, 0xffffff],
      emitting: false,
    }).setDepth(250);
  }

  private buildWarnArrow(): void {
    this.warnArrow = this.add.image(HIRES_OFF_X + 616, HIRES_OFF_Y + 150, 'ui-arrows', 1)
      .setScrollFactor(0).setDepth(50).setTint(COLN.purple).setScale(1.5)
      .setVisible(false);
    // marker `$` przy strzałce: pościg za łupem / kierunek do kopczyka
    this.warnDollar = this.add.text(HIRES_OFF_X + 616, HIRES_OFF_Y + 150, '$', {
      fontFamily: FONT_TITLE, fontSize: '12px', color: COL.gold,
      stroke: COL.ink, strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50).setVisible(false);
    this.ensureThiefBackpackTexture();
  }

  /** mini-plecak 12×14 px nad głową złodzieja (tekstura generowana w locie —
   *  bez nowego assetu; styl PA: kontur + korpus + klapa + złota klamra) */
  private ensureThiefBackpackTexture(): void {
    if (this.textures.exists('thief-backpack')) return;
    const g = this.add.graphics().setVisible(false);
    g.fillStyle(0x3a2504); g.fillRect(2, 0, 2, 3); g.fillRect(8, 0, 2, 3); // szelki
    g.fillStyle(0x22223a); g.fillRect(0, 2, 12, 12);                       // kontur
    g.fillStyle(0x8a5a2c); g.fillRect(1, 3, 10, 10);                       // korpus
    g.fillStyle(0xc08a4a); g.fillRect(1, 3, 10, 4);                        // klapa
    g.fillStyle(0xa87038); g.fillRect(3, 8, 6, 4);                         // kieszeń
    g.fillStyle(0xffd23f); g.fillRect(5, 6, 2, 2);                         // klamra
    g.generateTexture('thief-backpack', 12, 14);
    g.destroy();
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    // viewport w px BUFORA (×2); bounds/follow/deadzone w px logicznych —
    // przy zoomie ×2 klamrowanie idzie po displayWidth, więc kadr bez zmian
    cam.setViewport(0, GAME_FIELD_Y * RENDER_SCALE, 640 * RENDER_SCALE, FIELD_H * RENDER_SCALE);
    cam.setZoom(RENDER_SCALE);
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

  /**
   * Odczyt stanu dotyku z registry (kontrakt w TouchControls.ts) — raz na
   * klatkę. Liczniki *Pressed: wzrost od ostatniej wartości = JustDown.
   * Liczniki są konsumowane zawsze (nawet gdy nakładka nieaktywna), żeby po
   * powrocie nie odpalić zaległych naciśnięć.
   */
  private readTouch(): TouchFrame {
    const reg = this.game.registry;
    const f: TouchFrame = {
      left: false, right: false, down: false,
      jump: false, shoot: false, magic: false, use: false,
    };
    for (const id of Object.keys(TOUCH_EDGE_KEYS) as TouchEdgeId[]) {
      const raw = reg.get(TOUCH_EDGE_KEYS[id]);
      const v = typeof raw === 'number' ? raw : 0;
      if (v > this.touchLast[id]) f[id] = true;
      this.touchLast[id] = v;
    }
    if (reg.get('touch.active') === true) {
      f.left = reg.get('touch.left') === true;
      f.right = reg.get('touch.right') === true;
      f.down = reg.get('touch.down') === true;
    }
    this.touchFrame = f;
    return f;
  }

  /** Level → TouchControls: tryb runnera (przycisk ŚLIZG) i kontekstowe E */
  private syncTouchContext(): void {
    const reg = this.game.registry;
    const runnerMode = this.phase === 'RUNNER';
    if (reg.get('touch.runnerMode') !== runnerMode) {
      reg.set('touch.runnerMode', runnerMode);
    }
    // E robi coś: placek w plecaku + (Echo do ściągnięcia albo brak serca)
    const ctxUse = !runnerMode && !!this.player && this.hasCake
      && (this.hearts < this.maxHearts
        || (this.echoE?.logic.canRetameWithCake(this.player.cx) ?? false));
    if (reg.get('touch.ctxUse') !== ctxUse) reg.set('touch.ctxUse', ctxUse);
  }

  private setupMusic(): void {
    this.sound.stopByKey('music-menu');
    // BOSS: 'music-boss' przez cały poziom (PRD 6) — bez crossfade'u w arenie
    const key = this.def.kind === 'BOSS' ? 'music-boss' : `music-world${this.world}`;
    if (this.cache.audio.exists(key)) {
      this.musicWorld = this.sound.add(key, { loop: true, volume: 0.5 });
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
    if (!text) return;
    this.events.emit('hud:toast', { text, ms });
    speakText(this, text);   // lektor czyta komunikaty mające nagranie
  }

  private hudLabel(): string {
    return this.def.kind === 'BOSS' ? 'OBSYDIAN' : `ŚWIAT ${this.levelId}`;
  }

  private emitHud(): void {
    this.events.emit('hud:state', {
      levelLabel: this.hudLabel(),
      hearts: this.hearts, maxHearts: this.maxHearts, lives: this.lives,
      crystals: this.crystals, crystalTotal: this.map.crystalTotal,
      arrows: this.arrows, magic: this.magic, diamonds: this.diamondsTotal,
    });
  }

  /** stan dla HUD/Pauzy (wołane bezpośrednio przy starcie nakładek) */
  getHudState() {
    return {
      levelLabel: this.hudLabel(),
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
      runner: this.rn && this.phase === 'RUNNER'
        ? { progress: this.rn.progress() }
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

  /** przelicznik świat → ekran (dla lotu pickupu do HUD w scenie-nakładce);
   *  worldView, nie scroll — scroll przy zoomie ×2 nie jest rogiem kadru */
  private toScreen(x: number, y: number): { sx: number; sy: number } {
    const cam = this.cameras.main;
    return { sx: x - cam.worldView.x, sy: y - cam.worldView.y + GAME_FIELD_Y };
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
      l.ts.tilePositionX = this.cameras.main.worldView.x * l.factor + this.time.now / 1000 * l.drift;
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

    // dotyk (PRD 7): registry z TouchControls czytane RAZ na klatkę,
    // łączone z klawiaturą przez OR; kontekst przycisków w drugą stronę
    const touch = this.readTouch();
    this.syncTouchContext();

    // ── faza RUNNER: core/runnerPattern + physicsSim, scena renderuje ────
    if (this.phase === 'RUNNER') {
      this.updateRunner(dt);
      return;
    }

    // ── gracz ────────────────────────────────────────────────────────────
    const left = this.cursors.left.isDown || this.keys.A.isDown || touch.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || touch.right;
    const move: -1 | 0 | 1 = left && !right ? -1 : right && !left ? 1 : 0;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.space)
      || Phaser.Input.Keyboard.JustDown(this.cursors.up)
      || Phaser.Input.Keyboard.JustDown(this.keys.W)
      || touch.jump;
    const downHeld = this.cursors.down.isDown || this.keys.S.isDown || touch.down;
    this.player.update(dt, { move, jumpPressed, downHeld });

    if (Phaser.Input.Keyboard.JustDown(this.keys.X) || touch.shoot) this.shoot(false);
    if (Phaser.Input.Keyboard.JustDown(this.keys.Z) || touch.magic) this.shoot(true);
    if (Phaser.Input.Keyboard.JustDown(this.keys.E) || touch.use) this.useCake();

    // upadek poza mapę
    if (this.player.body.y > FIELD_H + 24) {
      this.loseLife();
      return;
    }

    this.updateArrows(dt);
    this.updatePowerup(dt);
    this.updatePickups();
    this.updateTraps(dt);
    this.updateGeysers();
    this.updateBoulders(dt);
    this.updateVanish(dt);
    this.updateHazards();
    this.updateEnemies(dt);
    this.updateEcho(dt);

    if (this.phase === 'PLATFORM') {
      this.updateThief(dt);
      this.updateMound(dt);
      // trigger areny (typ B i BOSS)
      if (this.map.trigger
        && (this.def.kind === 'ARENA' || this.def.kind === 'BOSS')
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
      playerX: Math.round(this.player.cx),
      playerY: Math.round(this.player.body.y),
      crystals: this.crystals,
      echoJump: this.echoE?.jumping ?? false,
      echoX: this.echoE ? Math.round(this.echoE.logic.x) : -1,
      thiefActive: !!this.thiefE, thiefX: this.thiefE ? Math.round(this.thiefE.logic.x) : -1,
      thiefState: this.thiefE?.logic.state ?? '',
      thiefBounces: this.thiefE?.logic.bounces ?? 0,
      thiefLoot: !!this.thiefE?.logic.loot,
      mound: !!this.mound,
      moundX: this.mound ? Math.round(this.mound.x + 8) : -1,
      arrows: this.arrows,
      dragonState: this.combat?.dragon.state ?? '',
      dragonX: this.combat ? Math.round(this.combat.dragon.x) : -1,
      dragonHits: this.dragonHits,
      dragonHp: this.combat?.dragon.hp ?? -1,
      bossPhase: this.combat?.dragon.pattern === 'boss' ? this.combat.dragon.phase : 0,
      shieldUp: this.combat?.dragon.shieldUp ?? false,
      p2Platforms: this.bossPlatformsSpawned,
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
          sn.die();
          this.addScore(ENEMY_SCORE.toczek, rr.x + rr.w / 2, rr.y);
          this.maybeDrop(rr.x + rr.w / 2, rr.y);
          this.killArrow(a);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      for (const m of this.machacze) {
        if (!m.alive || m.dying) continue;
        const rr = m.rect();
        if (ax > rr.x && ax < rr.x + rr.w && ay > rr.y - 4 && ay < rr.y + rr.h + 4) {
          m.kill('bat-hit');
          this.addScore(ENEMY_SCORE.machacz, rr.x + rr.w / 2, rr.y);
          this.maybeDrop(rr.x + rr.w / 2, rr.y, 'machacz');
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

  /** dropy przeciwników (aneks 6.3): toczek/skoczka 30% kryształ, machacz 20% diament */
  private maybeDrop(x: number, y: number, enemy: keyof typeof ENEMY_DROP_CHANCE = 'toczek'): void {
    if (Math.random() >= ENEMY_DROP_CHANCE[enemy]) return;
    const kind = enemy === 'machacz' ? 'diamond' : 'crystal';
    const s = this.add.sprite(x, y - 8, kind, 0);
    s.play(`${kind}-spin`);
    s.setDepth(-30);
    this.pickups.push({ kind, x, y: y - 8, sprite: s, taken: false });
    if (kind === 'crystal') this.map.crystalTotal += 1;
    this.emitHud();
  }

  // ── pickupy ─────────────────────────────────────────────────────────────

  private updatePickups(): void {
    const px = this.player.cx;
    const py = this.player.cy;
    const ex = this.echoE && this.echoPresent() ? this.echoE.logic.x : null;
    const ey = this.echoE && this.echoPresent() ? this.echoE.logic.y - TILE : null;
    const magnetR = this.powerup?.kind === 'magnet' ? POWERUP_MAGNET_R : 0;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const dp = Phaser.Math.Distance.Between(px, py, p.x, p.y);
      let byEcho = false;
      if (dp > PICKUP_RADIUS) {
        const treasure = p.kind === 'crystal' || p.kind === 'diamond';
        if (treasure && magnetR > 0 && dp <= magnetR) {
          // power-up Magnes (aneks 7): promień 5 kolumn
        } else if (ex !== null && ey !== null && treasure
          && Phaser.Math.Distance.Between(ex, ey, p.x, p.y) <= ECHO_MAGNET_R) {
          // magnes Echo: kryształy i diamenty w promieniu 3 kratek (aneks 6.1)
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
        if (this.def.echo === 'absent' && !this.echoE) {
          // skrypt 2-2 (aneks 8.6): odbity placek ściąga Echo z powrotem
          const feet = (standRow(this.map, Math.floor(this.player.cx / TILE),
            (rr, cc) => this.extraSolid.has(cellKey(rr, cc))) + 1) * TILE;
          this.echoE = new EchoEntity(this, this.player.cx - 32, feet, false);
          this.toast(SCENE_MESSAGES.placekRecovered, 2600);
          this.sfx('sfx-echo-whistle', 0.55);
        } else {
          this.toast('Legendarny Placek w plecaku. Pilnuj go!', 2200);
        }
        break;
      case 'heart':
        this.lives++;
        this.floatText(x, y, '+1 ŻYCIE', COL.danger, 9);
        this.sfx('sfx-fanfare', 0.25);
        break;
      case 'pw_shield':
        this.powerup = { kind: 'shield', t: POWERUP_SHIELD_TIME, total: POWERUP_SHIELD_TIME };
        this.floatText(x, y, 'TARCZA!', COL.cyan, 9);
        this.sfx('sfx-shield-clink', 0.5);
        this.toast('Tarcza: pochłania 1 trafienie (8 s).', 2000);
        break;
      case 'pw_magnet':
        this.powerup = { kind: 'magnet', t: POWERUP_MAGNET_TIME, total: POWERUP_MAGNET_TIME };
        this.floatText(x, y, 'MAGNES!', COL.white, 9);
        this.sfx('sfx-crystal', 0.5);
        this.toast('Magnes: przyciąga skarby (12 s).', 2000);
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
      this.toast(SCENE_MESSAGES.echoReturn, 2200);
      this.sfx('sfx-echo-whistle', 0.5);
    } else if (this.hearts < this.maxHearts) {
      this.hasCake = false;
      this.hearts++;
      this.toast(EVENT_MESSAGES.placekPiece, 2200);
      this.sfx('sfx-gate-open', 0.4);
    } else {
      this.toast(SCENE_MESSAGES.placekLater, 1800);
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

  /** power-up: licznik + pasek nad głową + miganie w ostatnich 2 s (aneks 7) */
  private updatePowerup(dt: number): void {
    if (!this.powerup) {
      this.powerupBar?.setVisible(false);
      return;
    }
    this.powerup.t -= dt;
    if (this.powerup.t <= 0) {
      this.powerup = null;
      this.powerupBar?.setVisible(false);
      return;
    }
    if (!this.powerupBar) {
      this.powerupBar = this.add.rectangle(0, 0, 20, 3, COLN.cyan).setDepth(25);
    }
    const p = this.powerup;
    this.powerupBar.setVisible(true)
      .setFillStyle(p.kind === 'shield' ? COLN.cyan : COLN.white)
      .setPosition(this.player.cx, this.player.headY - 8);
    this.powerupBar.width = Math.max(2, 20 * (p.t / p.total));
    if (p.t < 2 && Math.floor(this.time.now / 120) % 2 === 0) {
      this.player.sprite.setAlpha(0.5);
    }
  }

  /** gejzery (aneks 6.4): cykl globalny 4 s — nauka rytmu */
  private updateGeysers(): void {
    if (this.geysers.length === 0) return;
    const t = this.levelTime % GEYSER_CYCLE;
    const state: GeyserEntity['state'] =
      t < GEYSER_REST ? 'rest' : t < GEYSER_REST + GEYSER_WARN ? 'warn' : 'erupt';
    devMark({ geyser: state });
    const pb = this.player.body;
    for (const g of this.geysers) {
      g.state = state;
      if (state === 'rest') {
        g.sprite.x = g.x;
        continue;
      }
      if (state === 'warn') {
        // bulgot: drganie podstawki + pojedyncze bąble
        g.sprite.x = g.x + (Math.floor(this.time.now / 60) % 2 === 0 ? 0.7 : -0.7);
        if (Math.floor(this.time.now / 140) % 2 === 0) {
          this.emGeyser.emitParticleAt(g.x + (Math.random() * 6 - 3), g.baseY - 6, 1);
        }
        continue;
      }
      // erupcja: kolumna 4 wierszy (particles) + parzy jak kaktus
      g.sprite.x = g.x;
      this.emGeyser.emitParticleAt(g.x + (Math.random() * 8 - 4), g.baseY - 2, 2);
      this.emGeyser.emitParticleAt(g.x + (Math.random() * 6 - 3), g.baseY - 30, 1);
      if (this.player.iframes <= 0 && !this.frozen) {
        const colRect = { x: g.x - 6, y: g.baseY - 4 * TILE, w: 12, h: 4 * TILE };
        if (pb.x < colRect.x + colRect.w && colRect.x < pb.x + pb.width
          && pb.y < colRect.y + colRect.h && colRect.y < pb.y + pb.height) {
          this.hurtPlayer(g.x);
        }
      }
    }
  }

  /** głaz Rock Head (aneks 6.4): trigger ±2 kolumny → telegraf → spada */
  private updateBoulders(dt: number): void {
    const pb = this.player.body;
    for (const b of this.bouldersE) {
      if (b.state === 'armed') {
        if (Math.abs(this.player.cx - b.x) <= 2.5 * TILE && this.player.cy > b.y0 - TILE) {
          b.state = 'telegraph';
          b.t = BOULDER_TELEGRAPH;
          b.bang.setVisible(true);
        }
      } else if (b.state === 'telegraph') {
        b.t -= dt;
        // trzęsienie ±1 px + `!`
        b.sprite.x = b.x + (Math.floor(this.time.now / 50) % 2 === 0 ? 1 : -1);
        if (b.t <= 0) {
          b.state = 'fall';
          b.bang.setVisible(false);
          b.sprite.x = b.x;
        }
      } else if (b.state === 'fall') {
        b.y += BOULDER_FALL_SPEED * dt;
        b.sprite.y = b.y;
        if (this.player.iframes <= 0 && !this.frozen) {
          const r = { x: b.x - 8, y: b.y - 8, w: 16, h: 16 };
          if (pb.x < r.x + r.w && r.x < pb.x + pb.width
            && pb.y < r.y + r.h && r.y < pb.y + pb.height) {
            this.hurtPlayer(b.x);
          }
        }
        if (b.y >= b.restY) {
          b.y = b.restY;
          b.sprite.y = b.y;
          b.state = 'lie';
          b.t = BOULDER_LIE_TIME;
          this.cameras.main.shake(120, 0.006);
          this.emDust.explode(8, b.x, b.y + 8);
          this.sfx('sfx-land', 0.5);
        }
        if (b.y > 21 * TILE) {   // wpadł w przepaść
          b.state = 'hidden';
          b.t = BOULDER_HIDDEN_TIME;
          b.sprite.setVisible(false);
        }
      } else if (b.state === 'lie') {
        b.t -= dt;
        if (b.t <= 0) {
          b.state = 'hidden';
          b.t = BOULDER_HIDDEN_TIME;
          b.sprite.setVisible(false);
        }
      } else {   // hidden → respawn na półce
        b.t -= dt;
        if (b.t <= 0) {
          b.state = 'armed';
          b.y = b.y0;
          b.sprite.setPosition(b.x, b.y0).setVisible(true);
        }
      }
    }
  }

  /** znikające platformy / mosty z lian (aneks 6.4) */
  private updateVanish(dt: number): void {
    const pb = this.player.body;
    for (const v of this.vanishE) {
      if (v.state === 'idle') {
        const feet = pb.y + pb.height;
        const onTop = this.player.onGround
          && Math.abs(feet - v.seg.y) < 3
          && pb.x + pb.width > v.seg.x && pb.x < v.seg.x + v.seg.widthPx;
        if (onTop) {
          v.state = 'blink';
          v.t = VANISH_BLINK_TIME;
        }
      } else if (v.state === 'blink') {
        v.t -= dt;
        const on = Math.floor((VANISH_BLINK_TIME - v.t) / 0.2) % 2 === 0;
        for (const img of v.images) img.setAlpha(on ? 1 : 0.35);
        if (v.t <= 0) {
          v.state = 'gone';
          v.t = VANISH_GONE_TIME;
          (v.rect.body as Phaser.Physics.Arcade.StaticBody).enable = false;
          for (let c = v.seg.c0; c <= v.seg.c1; c++) {
            this.extraSolid.delete(cellKey(v.seg.r, c));
          }
          for (const img of v.images) img.setVisible(false);
        }
      } else {
        v.t -= dt;
        if (v.t <= 0) {
          v.state = 'idle';
          (v.rect.body as Phaser.Physics.Arcade.StaticBody).enable = true;
          for (let c = v.seg.c0; c <= v.seg.c1; c++) {
            this.extraSolid.add(cellKey(v.seg.r, c));
          }
          for (const img of v.images) img.setVisible(true).setAlpha(1);
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
        if (this.map.cactusCells.has(k) || this.map.spikeCells.has(k)
          || this.trapCells.has(k) || this.lavaCells.has(k)) {
          this.hurtPlayer((c + 0.5) * TILE);
          return;
        }
      }
    }
  }

  private hurtPlayer(sourceX: number): void {
    if (this.player.iframes > 0 || this.frozen) return;
    // tarcza (aneks 7): pochłania 1 trafienie — także kaktus/pułapkę
    if (this.powerup?.kind === 'shield') {
      this.powerup = null;
      this.powerupBar?.setVisible(false);
      this.player.iframes = 0.8;
      this.emSpark.explode(14, this.player.cx, this.player.cy);
      this.sfx('sfx-shield-explode', 0.5);
      this.toast('Tarcza pochłonęła trafienie!', 1800);
      return;
    }
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
    const cont = this.add.container(HIRES_OFF_X, HIRES_OFF_Y).setScrollFactor(0).setDepth(200);
    const dim = this.add.rectangle(320, FIELD_H / 2, 640, FIELD_H, 0x0b0b14, 0.62);
    let y = FIELD_H / 2 - 42;
    let maxW = 0;
    const texts: Phaser.GameObjects.Text[] = [];
    for (const l of lines) {
      const t = this.add.text(320, y, l.text, {
        fontFamily: l.size >= 14 ? FONT_TITLE : FONT_UI,
        fontSize: `${l.size}px`, color: l.color,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5);
      texts.push(t);
      maxW = Math.max(maxW, t.width);
      y += l.size + 16;
    }
    const boxW = Math.min(620, Math.max(340, maxW + 44));
    const boxH = Math.max(150, y - (FIELD_H / 2 - 42) + 64);
    const box = this.add.nineslice(320, FIELD_H / 2, 'ui-panel-brown', undefined,
      boxW, boxH, 6, 6, 6, 6);
    cont.add([dim, box, ...texts]);
    return cont;
  }

  private deathOverlay(): void {
    const msg = LOSS_MESSAGES[Math.floor(Math.random() * LOSS_MESSAGES.length)];
    speakTexts(this, [msg.header, msg.line]);
    const heartsRow = '♥ '.repeat(Math.max(0, this.lives)).trim() || '♡';
    const cont = this.overlayBox([
      { text: msg.header, size: 15, color: COL.danger },
      { text: heartsRow, size: 16, color: COL.danger },
      { text: msg.line, size: 15, color: COL.white },
      { text: '► [SPACJA] ◄', size: 13, color: COL.dim },
    ]);
    let done = false;
    const go = () => {
      if (done) return;   // auto-timer + zaległy listener nie respawnują 2×
      done = true;
      timer.remove();
      this.input.keyboard!.off('keydown-SPACE', go);
      this.input.off('pointerdown', go);
      cont.destroy();
      this.respawnAfterDeath();
    };
    const timer = this.time.delayedCall(2000, go);
    this.input.keyboard!.once('keydown-SPACE', go);
    this.input.once('pointerdown', go);   // dotyk: tap = dalej (PRD 7)
  }

  private gameOverOverlay(): void {
    this.musicWorld?.stop();
    this.musicDragon?.stop();
    speakTexts(this, [GAME_OVER.header, GAME_OVER.line]);
    const cont = this.overlayBox([
      { text: GAME_OVER.header, size: 16, color: COL.gold },
      { text: GAME_OVER.line, size: 15, color: COL.white },
      { text: `${GAME_OVER.button}  [SPACJA]`, size: 14, color: COL.cyan },
    ]);
    const back = () => {
      this.input.keyboard!.off('keydown-SPACE', back);
      this.input.off('pointerdown', back);
      cont.destroy();
      this.scene.stop('HUD');
      this.scene.start('Menu');
    };
    this.input.keyboard!.once('keydown-SPACE', back);
    this.input.once('pointerdown', back);   // dotyk: tap = dalej (PRD 7)
  }

  private respawnAfterDeath(): void {
    this.physics.world.resume();
    this.frozen = false;
    this.readTouch();   // konsumpcja naciśnięć dotyku z czasu nakładki śmierci
    if (this.phase === 'RUNNER') {
      // reset sekcji od początku, prędkość startowa (aneks 8.3)
      this.runnerSectionReset();
      this.emitHud();
      return;
    }
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
    // 2-2: pułapki aktywne od startu (aneks 8.6) — wracają po resecie
    if (this.levelId === '2-2') this.activateAllTraps();
    for (const m of this.machacze) m.destroy();
    this.machacze = [];
    this.machaczFired = this.map.machaczTriggers.map(() => false);
    for (const b of this.bouldersE) {
      b.state = 'armed';
      b.t = 0;
      b.y = b.y0;
      b.sprite.setPosition(b.x, b.y0).setVisible(true);
      b.bang.setVisible(false);
    }
    for (const v of this.vanishE) {
      v.state = 'idle';
      v.t = 0;
      (v.rect.body as Phaser.Physics.Arcade.StaticBody).enable = true;
      for (let c = v.seg.c0; c <= v.seg.c1; c++) this.extraSolid.add(cellKey(v.seg.r, c));
      for (const img of v.images) img.setVisible(true).setAlpha(1);
    }
    this.powerup = null;
    this.powerupBar?.setVisible(false);
    if (this.thiefE) {
      this.thiefE.destroy();
      this.thiefE = null;
    }
    this.thiefSpawner.reset();
    // śmierć cofa kradzież (plecak ze snapshotu) — kopczyk znika bez śladu
    this.destroyMound();
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
        sn.die();
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
    // Machacz: spawn na wyzwalaczu `2`, przelot sinusoidą (aneks 6.3)
    for (let i = 0; i < this.map.machaczTriggers.length; i++) {
      if (this.machaczFired[i]) continue;
      const tr = this.map.machaczTriggers[i];
      if (Math.abs(this.player.cx - (tr.x + 8)) < 12 * TILE) {
        this.machaczFired[i] = true;
        const dir: -1 | 1 = this.player.cx < tr.x ? -1 : 1;
        this.machacze.push(new Machacz(
          this, tr.r, tr.c, dir, this.map.widthPx,
          this.world === 3 ? WORLD3_ENEMY_TINT : 0xffffff,
        ));
      }
    }
    for (const m of this.machacze) {
      m.update(dt, env);
      if (!m.alive || m.dying) continue;
      const r = m.rect();
      if (pb.x < r.x + r.w && r.x < pb.x + pb.width
        && pb.y < r.y + r.h && r.y < pb.y + pb.height) {
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
    this.checkEchoJump(dt);
    const whistles = this.echoE.logic.checkWhistle(this.hazardXs, env);
    for (const w of whistles) {
      if (w.type !== 'whistle') continue;
      this.echoE.hop(this);
      this.sfx('sfx-echo-whistle', w.first ? 0.55 : 0.35);
    }
  }

  /**
   * Skok Echo nad hazardem naziemnym — zgłoszenie z playtestu rodzinnego
   * (1-2): Echo „stawała jak słupek" przed kolcami albo przez nie przenikała.
   * Warstwa sceny: core/monkey.ts (cel/podążanie) nietknięty — my tylko
   * wykrywamy hazard w pasie 1–3 kolumn PRZED Echo w kierunku jej ruchu
   * i odpalamy wizualny łuk (EchoEntity.tryJump) + kurz przy lądowaniu.
   * Wymóg ruchu (próg prędkości) + cooldown w EchoEntity = zero nerwowego
   * podskakiwania, gdy Echo stoi przy hazardzie obok celu podążania.
   */
  private checkEchoJump(dt: number): void {
    const e = this.echoE;
    if (!e || e.waiting || e.jumping || dt <= 0) return;
    const l = e.logic;
    if (l.state !== 'follow' && l.state !== 'fleeing') return;
    const v = e.lastStepX / dt;
    if (Math.abs(v) < 40) return;   // stoi / dojeżdża do celu — nie skacz
    const dir = v > 0 ? 1 : -1;
    const ec = Math.floor(l.x / TILE);
    const er = Math.floor(l.y / TILE) - 1;   // wiersz, w którym stoi (l.y = stopy)
    for (let ahead = 1; ahead <= 3; ahead++) {
      if (this.groundHazardAt(er, ec + dir * ahead)) {
        e.tryJump((x, y) => this.emDust.explode(4, x, y - 2));
        return;
      }
    }
  }

  /** hazard naziemny w kolumnie c przy wierszu r (±1 na progi terenu):
   *  kaktus (zwykły/krzak/lawowy), kolce `^`, AKTYWNE kolce pułapek `!` */
  private groundHazardAt(r: number, c: number): boolean {
    for (let rr = r - 1; rr <= r + 1; rr++) {
      const k = cellKey(rr, c);
      if (this.map.cactusCells.has(k) || this.map.spikeCells.has(k)
        || this.trapCells.has(k)) return true;
    }
    return false;
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
    this.updateWarnMarker(dt);

    if (!this.thiefE) return;
    const events = this.thiefE.update(dt, this.thiefEnv());
    for (const ev of events) this.handleThiefEvent(ev);
    if (!this.thiefE) return;   // buried/vanished w tej klatce

    const logic = this.thiefE.logic;
    // zmęczony: sapanie co 2 s (cicho); kopanie: kurz grzebania
    if (logic.state === 'tired') {
      this.thiefPantT -= dt;
      if (this.thiefPantT <= 0) {
        this.thiefPantT = 2;
        if (this.cache.audio.exists('sfx-land')) {
          this.sound.play('sfx-land', { volume: 0.15, rate: 0.6 });
        }
      }
    } else if (logic.state === 'dig') {
      if (Math.floor(this.time.now / 140) % 2 === 0) {
        this.emDust.explode(2, logic.x + 8, logic.y + 30);
      }
    }

    // dotknięcie gracza
    const tr = this.thiefE.rect();
    const pb = this.player.body;
    const overlap = pb.x < tr.x + tr.w && tr.x < pb.x + pb.width
      && pb.y < tr.y + tr.h && tr.y < pb.y + pb.height;
    if (overlap) {
      if (logic.state === 'approach' && this.powerup?.kind === 'shield') {
        // tarcza: 100% ochrony przed kradzieżą (aneks 7) — złodziej zmyka z niczym
        logic.steal({ arrows: 0, magic: 0, hasCake: false, diamondsLevel: 0 },
          false, this.map.widthPx);
        this.toast('Tarcza ochroniła plecak!', 2000);
        this.sfx('sfx-shield-clink', 0.5);
      } else if (logic.state === 'approach') {
        // kradzież CAŁEGO plecaka (Vega: 1 strzała; Skrzat: ≤ 3 strzały)
        const bp: Backpack = {
          arrows: this.arrows, magic: this.magic,
          hasCake: this.hasCake, diamondsLevel: this.diamondsLevel,
        };
        const ev = logic.steal(bp, this.char.protectedBackpack, this.map.widthPx,
          this.save.skrzat);
        const stolenDiamonds = this.diamondsLevel - bp.diamondsLevel;
        this.arrows = bp.arrows;
        this.magic = bp.magic;
        this.hasCake = bp.hasCake;
        this.diamondsLevel = bp.diamondsLevel;
        this.diamondsTotal -= stolenDiamonds;
        if (ev.type === 'stole' && ev.loot) {
          this.thiefE.showLoot(ev.loot);
          this.toast(this.char.protectedBackpack
            ? THIEF_MSG.stoleVega : THIEF_MSG.stoleAll, 2400);
          this.events.emit('hud:steal-flash');
          this.sfx('sfx-theft-alarm', 0.6);
          if (ev.cakeStolen) this.echoFlee();
        } else {
          this.toast('Pusty plecak — złodziej zmyka.', 1800);
        }
        this.emitHud();
      } else if (logic.catchableByTouch()
          && logic.y + 2 * TILE > pb.y + 14) {
        // flee/tired/dig: dotknięcie = złapanie (dig: bezbronny — pełny zwrot).
        // Karencja po kradzieży (kradzież zachodzi w overlapie z graczem) oraz
        // przelot NAD głową (stopy złodzieja powyżej piersi bohaterki) nie
        // łapią — spec: „przeleciał mi nad głową", złapanie wymaga wyczucia
        // (podskoku w niego) albo strzały.
        this.thiefCaught();
      }
    }
  }

  /** wskaźnik-strzałka na krawędzi ekranu: sygnalizacja `!`, pościg za łupem
   *  (`$` przy strzałce) i kierunek do kopczyka poza kadrem (spec playtest2) */
  private updateWarnMarker(dt: number): void {
    this.warnT = Math.max(0, this.warnT - dt);
    let showWarn = false;
    let dollar = false;
    let side: -1 | 1 = this.warnSide;
    const scrollX = this.cameras.main.worldView.x;
    if (this.thiefE && this.thiefE.logic.alive) {
      const sx = this.thiefE.logic.x - scrollX;
      if (sx < -8) { showWarn = true; side = -1; }
      else if (sx > 648) { showWarn = true; side = 1; }
      else if (this.warnT > 0) { showWarn = true; }
      dollar = showWarn && !!this.thiefE.logic.loot && (sx < -8 || sx > 648);
    } else if (this.warnT > 0 && this.thiefE) {
      showWarn = true;
    } else if (this.mound) {
      const sx = this.mound.x + 8 - scrollX;
      if (sx < -8) { showWarn = true; side = -1; dollar = true; }
      else if (sx > 648) { showWarn = true; side = 1; dollar = true; }
    }
    const blink = Math.floor(this.time.now / 160) % 3 !== 2;
    this.warnArrow.setVisible(showWarn && blink);
    if (showWarn) {
      this.warnArrow.setFrame(side > 0 ? 1 : 3);
      this.warnArrow.x = HIRES_OFF_X + (side > 0 ? 616 : 24);
      this.warnArrow.y = HIRES_OFF_Y + 140;
    }
    if (this.warnDollar) {
      this.warnDollar.setVisible(dollar && blink);
      if (dollar) {
        this.warnDollar.setPosition(HIRES_OFF_X + (side > 0 ? 594 : 46), HIRES_OFF_Y + 140);
      }
    }
  }

  /** zdarzenia FSM złodzieja (core/thief.ts) → efekty sceny */
  private handleThiefEvent(ev: ThiefEvent): void {
    if (!this.thiefE) return;
    const logic = this.thiefE.logic;
    switch (ev.type) {
      case 'turned': {
        // zawrotka na krawędzi mapy / ścianie areny: obłoczek poślizgu + skid
        this.emDust.explode(6, logic.x + 8, logic.y + 30);
        if (this.cache.audio.exists('sfx-land')) {
          this.sound.play('sfx-land', { volume: 0.35, rate: 1.4 });
        }
        if (!this.thiefEdgeMsgShown) {
          this.thiefEdgeMsgShown = true;
          this.toast(THIEF_MSG.edge, 2200);
        }
        break;
      }
      case 'tired':
        this.thiefPantT = 0;   // sapanie zaczyna od razu
        break;
      case 'digStart':
        break;   // toast dopiero przy kopczyku (buried)
      case 'buried': {
        this.createMound(ev.mound.x, ev.mound.y, ev.mound.loot);
        this.toast(THIEF_MSG.buried, 2600);
        this.emSmoke.explode(8, logic.x + 8, logic.y + 16);
        this.sfx('sfx-theft-alarm', 0.4);
        this.thiefE.destroy();
        this.thiefE = null;
        this.thiefSpawner.noteDespawn({
          cooldownAfterDespawn: this.def.thiefCd ?? this.diff.thiefCd,
        });
        break;
      }
      case 'vanished': {
        // pusty łup: znika w obłoczku, kopczyk NIE powstaje
        this.emSmoke.explode(6, logic.x + 8, logic.y + 16);
        this.thiefE.destroy();
        this.thiefE = null;
        this.thiefSpawner.noteDespawn({
          cooldownAfterDespawn: this.def.thiefCd ?? this.diff.thiefCd,
        });
        break;
      }
      default:
        break;
    }
  }

  /** złapanie żywego złodzieja: łup wraca PROSTO do plecaka (+50, bez dropu) */
  private thiefCaught(): void {
    if (!this.thiefE) return;
    const logic = this.thiefE.logic;
    const ev = logic.caught();
    if (ev.type === 'caught') {
      this.addScore(ev.score, logic.x + 8, logic.y, COL.purple);
      if (ev.loot) {
        this.applyLootReturn(ev.loot, logic.x + 8, logic.y + 16);
        this.toast(THIEF_MSG.caught, 2200);
      }
    }
    this.emSmoke.explode(8, logic.x + 8, logic.y + 16);
    this.sfx('sfx-hit', 0.5);
    this.thiefE.destroy();
    this.thiefE = null;
    this.thiefSpawner.noteDespawn({ cooldownAfterDespawn: this.def.thiefCd ?? this.diff.thiefCd });
  }

  /** pełny zwrot łupu do plecaka + iskierki lecące do HUD */
  private applyLootReturn(loot: Loot, x: number, y: number): void {
    const bp: Backpack = {
      arrows: this.arrows, magic: this.magic,
      hasCake: this.hasCake, diamondsLevel: this.diamondsLevel,
    };
    returnLoot(loot, bp);
    this.arrows = bp.arrows;
    this.magic = bp.magic;
    this.hasCake = bp.hasCake;
    this.diamondsLevel = bp.diamondsLevel;
    this.diamondsTotal += loot.diamonds;
    this.emSpark.explode(10, x, y);
    const { sx, sy } = this.toScreen(x, y);
    this.events.emit('hud:flight', {
      texture: loot.hasCake ? 'placek' : 'arrow', sx, sy, target: 'arrow',
    });
    this.events.emit('hud:loot-return');
    this.sfx('sfx-crystal', 0.5, true);
    this.emitHud();
  }

  // ── kopczyk (spec playtest2): łup „przepada" do odkopania, bez TTL ──────

  private createMound(x: number, y: number, loot: Loot): void {
    this.destroyMound();
    this.mound = new Mound(x, y, loot);
    const s = this.add.image(x + 8, y, 'mound').setOrigin(0.5, 1).setDepth(-30);
    // miga co 2 s (spec) — krótki błysk alpha z pauzą
    this.tweens.add({
      targets: s, alpha: 0.45, duration: 260, yoyo: true, repeat: -1,
      repeatDelay: 1700, ease: 'Sine.inOut',
    });
    this.moundSprite = s;
  }

  private destroyMound(): void {
    this.moundSprite?.destroy();
    this.moundSprite = null;
    this.mound = null;
    this.moundBar?.setVisible(false);
  }

  /** gracz stoi na kopczyku 0,8 s → odkopuje CAŁY łup (bez +50) */
  private updateMound(dt: number): void {
    const m = this.mound;
    if (!m) {
      this.moundBar?.setVisible(false);
      return;
    }
    // hojna tolerancja jak przy pickupach (PICKUP_RADIUS ~1,2 kratki)
    const onIt = this.player.onGround
      && Math.abs(this.player.cx - (m.x + 8)) < 20
      && Math.abs(this.player.feetY - m.y) < 10;
    const done = m.update(dt, onIt);
    if (onIt && !m.dug) {
      // pasek postępu odkopywania nad bohaterką + kurz grzebania
      if (!this.moundBar) {
        this.moundBar = this.add.rectangle(0, 0, 24, 4, COLN.gold)
          .setStrokeStyle(1, 0x22223a, 0.8).setDepth(25);
      }
      this.moundBar.setVisible(true)
        .setPosition(this.player.cx, this.player.headY - 9);
      this.moundBar.width = Math.max(3, 24 * m.progress());
      if (Math.floor(this.time.now / 150) % 2 === 0) {
        this.emDust.explode(2, m.x + 8, m.y - 4);
      }
    } else {
      this.moundBar?.setVisible(false);
    }
    if (done) {
      const loot = m.loot;
      this.destroyMound();
      this.applyLootReturn(loot, this.player.cx, this.player.cy);
      this.toast(THIEF_MSG.dugUp, 2000);
      this.sfx('sfx-gate-open', 0.45);
    }
  }

  // ════════════════════════ ARENA ════════════════════════════════════════

  private startArena(instant: boolean): void {
    if (this.phase !== 'PLATFORM' || !this.def.dragon || this.def.arenaX === undefined) return;
    // przekroczenie triggera `>` w trakcie pościgu / z kopczykiem w terenie:
    // łup przepada (reguła końca poziomu — spec playtest2); kryształy są
    // bezpieczne z definicji (nigdy nie są kradzione)
    if ((this.thiefE && this.thiefE.logic.loot) || this.mound) {
      this.toast(THIEF_MSG.lootLost, 2400);
    }
    if (this.thiefE) {
      this.emSmoke.explode(6, this.thiefE.logic.x + 8, this.thiefE.logic.y + 16);
      this.thiefE.destroy();
      this.thiefE = null;
    }
    this.destroyMound();
    // uszczelnienie ściany za graczem + prawa krawędź areny
    for (const rect of this.sealRects) {
      (rect.body as Phaser.Physics.Arcade.StaticBody).enable = true;
    }
    for (const img of this.sealTiles) img.setVisible(true);
    if (this.def.wallCol !== undefined) {
      for (const [r, c] of sealWallCells(this.def.wallCol)) this.extraSolid.add(cellKey(r, c));
    }
    this.enterArena(this.def.arenaX * TILE, instant);
  }

  /**
   * Arena po runnerze (1-3 Samum, 2-3 Monsun — aneks 8.3/8.4): osobna mapa
   * 80 kratek, smok „dogoniony" startuje od razu; Monsun z tarczą (core wie).
   */
  private startRunnerArena(): void {
    if (!this.def.dragon) return;
    this.phase = 'PLATFORM';   // wymagane przez enterArena (spójny stan przejścia)
    this.enterArena(0, true);
  }

  private enterArena(arenaX0: number, instant: boolean): void {
    if (!this.def.dragon) return;
    this.phase = 'ARENA';
    const isBoss = this.def.kind === 'BOSS';
    // combat core — checkpoint z zachowanym HP przy kolejnych wejściach
    if (!this.combat) {
      const oPts = this.map.oPoints.map((o) => ({ x: o.x + 8, y: o.y + 8 }));
      this.combat = new ArenaCombat(this.def.dragon, this.diffId, arenaX0, oPts,
        this.map.dragonSpawn
          ? { spawnPos: { x: this.map.dragonSpawn.x, y: this.map.dragonSpawn.y } }
          : {});
      // dev: ?dhp=12 → HP smoka od startu (e2e faz bossa)
      const qHp = devParam('dhp');
      if (qHp) {
        const v = parseInt(qHp, 10);
        if (Number.isFinite(v) && v > 0 && v <= this.combat.dragon.maxHp) {
          this.combat.dragon.hp = v;
        }
      }
    }
    // Obsydian: skala ×1,85 + złote rogi + przygaszony tint (czerń+złoto)
    this.dragonE = new DragonEntity(this, this.def.dragon.toLowerCase(),
      isBoss ? { scale: 1.85, horns: true, baseTint: 0x8a8098 } : {});
    if (isBoss) {
      this.buildVabank();
      // decyzja z playtestu (10.08): platformy dostępne od POCZĄTKU walki,
      // nie dopiero od fazy 2 — gracz od razu widzi, jak sięgnąć smoka
      this.spawnBossPlatforms();
    }
    // pooling fireballi
    for (let i = 0; i < 8; i++) {
      const s = this.add.image(0, 0, 'p-circle-big')
        .setTint(0xff8030).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.8).setDepth(6).setVisible(false);
      this.fireballSprites.push(s);
    }
    // checkpoint
    this.checkpointX = arenaX0 + 3 * TILE;
    this.checkpointFeetY = (standRow(this.map, Math.floor(arenaX0 / TILE) + 3) + 1) * TILE;
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
      // scroll przy zoomie ×2: lewy-górny róg kadru = scroll + HIRES_OFF
      cam.setScroll(arenaX0 - HIRES_OFF_X, -HIRES_OFF_Y);
      lock();
    } else {
      this.tweens.add({
        targets: cam, scrollX: arenaX0 - HIRES_OFF_X, duration: 700, ease: 'Sine.inOut',
        onComplete: lock,
      });
    }
    // crossfade muzyki 0,5 s + ryk (BOSS: 'music-boss' gra od startu poziomu)
    if (!isBoss) {
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
    }
    this.dragonE.playRoar();
    this.sfx('sfx-dragon-roar', isBoss ? 0.85 : 0.7);
    cam.shake(isBoss ? 500 : 350, isBoss ? 0.01 : 0.007);
    const name = DRAGONS[this.def.dragon].name;
    this.events.emit('hud:arena', {
      name, hp: this.combat.dragon.hp, maxHp: this.combat.dragon.maxHp,
      portraitKey: `dragon-${this.def.dragon.toLowerCase()}`,
    });
    this.toast(isBoss
      ? 'Obsydian, Król Smoków! Zbij tarczę i strzelaj!'
      : `Smok ${name}! Uważaj na ogień, strzelaj [X]!`, 2600);
    this.emitHud();
  }

  // ── BOSS: Vabank na łbie + dymki (aneks 8.4.3, Załącznik A) ─────────────

  private buildVabank(): void {
    this.vabank = this.add.sprite(0, -40, 'vabank-idle', 0)
      .setOrigin(0.5, 1).setScale(1.25).setDepth(-8);
    this.vabank.play('vabank-idle');
  }

  /** podskok Vabanka przy zmianie fazy (siedzi na łbie — dekoracja) */
  private vabankHop(): void {
    this.vabankHopY = { v: 0 };
    this.tweens.add({
      targets: this.vabankHopY, v: 16, duration: 170, yoyo: true, repeat: 1,
      ease: 'Sine.out',
    });
  }

  private vabankSay(text: string): void {
    speakText(this, text);
    this.vabankBubble?.destroy();
    const bubble = this.add.container(0, 0).setDepth(40);
    const label = this.add.text(0, 0, text, {
      fontFamily: FONT_UI, fontSize: '13px', color: COL.ink,
      wordWrap: { width: 220 },
    }).setOrigin(0.5);
    const panel = this.add.nineslice(0, 0, 'ui-panel', undefined,
      Math.min(244, label.width + 22), label.height + 14, 6, 6, 6, 6);
    const tail = this.add.triangle(0, panel.height / 2 + 5, 0, 0, 10, 0, 5, 7, 0xffffff)
      .setAlpha(0.95);
    bubble.add([panel, tail, label]);
    this.vabankBubble = bubble;
    this.vabankBubbleT = 3.5;
    devMark({ taunt: text });
  }

  /** pozycja Vabanka + dymka + znacznika słabego punktu (co klatkę areny) */
  private updateBossDecor(dt: number): void {
    if (!this.combat || !this.dragonE) return;
    const d = this.combat.dragon;
    if (this.vabank && d.state !== 'GONE') {
      const r = this.dragonE.riderXY(d, this.player.cx);
      this.vabank.setPosition(r.x, r.y - this.vabankHopY.v);
      this.vabank.setFlipX(this.player.cx < d.x + d.w / 2);
    }
    if (this.vabankBubble) {
      this.vabankBubbleT -= dt;
      if (this.vabankBubbleT <= 0) {
        this.vabankBubble.destroy();
        this.vabankBubble = null;
      } else if (this.vabank) {
        this.vabankBubble.setPosition(
          Phaser.Math.Clamp(this.vabank.x,
            this.cameras.main.worldView.x + 130, this.cameras.main.worldView.x + 510),
          Math.max(this.cameras.main.worldView.y + 30, this.vabank.y - 74),
        );
        this.vabankBubble.setAlpha(this.vabankBubbleT < 0.5 ? this.vabankBubbleT * 2 : 1);
      }
    }
    // słaby punkt po szarży: ♦ miga na sprite (magiczna ×2 — core wie)
    if (d.pattern === 'boss') {
      if (!this.weakMark) {
        this.weakMark = this.add.text(0, 0, '♦', {
          fontFamily: FONT_TITLE, fontSize: '14px', color: COL.white,
          stroke: COL.ink, strokeThickness: 4,
        }).setOrigin(0.5).setDepth(21).setVisible(false);
      }
      const show = d.weak > 0 && d.aliveFighting()
        && Math.floor(this.time.now / 120) % 2 === 0;
      this.weakMark.setVisible(show);
      if (show) this.weakMark.setPosition(d.x + d.w / 2, d.y + d.h / 2 - 4);
    }
  }

  /** Faza 2 „Pogoń": 3 znikające platformy (BOSS_P2_PLATFORMS, v1 przesuwa
   *  o arena_x0 − 60) — z nich strzela się do latającego smoka */
  private bossPlatformsUp = false;

  private spawnBossPlatforms(): void {
    if (this.bossPlatformsUp) return;
    this.bossPlatformsUp = true;
    if (this.bossPlatformsSpawned) return;
    this.bossPlatformsSpawned = true;
    const shift = (this.def.arenaX ?? 60) - 60;
    for (const [r, c0raw, len] of BOSS_P2_PLATFORMS) {
      const c0 = c0raw + shift;
      const c1 = c0 + len - 1;
      const seg: VanishSegment = {
        r, c0, c1, x: c0 * TILE, y: r * TILE, widthPx: len * TILE,
      };
      const rect = this.add
        .rectangle(seg.x + seg.widthPx / 2, seg.y + 8, seg.widthPx, TILE)
        .setVisible(false);
      this.physics.add.existing(rect, true);
      const images: Phaser.GameObjects.Sprite[] = [];
      for (let i = 0; i < Math.ceil(seg.widthPx / 32); i++) {
        const s = this.add
          .sprite(seg.x + i * 32 + 16, seg.y + 6, 'platform-falling', 0)
          .setDepth(-45).setScale(0);
        s.play({ key: 'platform-falling-on', startFrame: i % 4 });
        this.tweens.add({
          targets: s, scale: 1, duration: 260, delay: i * 60, ease: 'Back.out',
        });
        images.push(s);
      }
      for (let c = seg.c0; c <= seg.c1; c++) this.extraSolid.add(cellKey(seg.r, c));
      this.vanishE.push({ seg, state: 'idle', t: 0, images, rect });
      this.physics.add.collider(this.player.carrier, rect);
      this.emSpark.explode(10, seg.x + seg.widthPx / 2, seg.y + 8);
    }
    this.toast('Znikające platformy! Wskakuj i strzelaj do smoka!', 2600);
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
    // zionięcie Piry: pas ziemi płonie (core liczy c0..c1 — 9 kolumn)
    this.renderGroundFlames();
    // BOSS: pociski faz (fala ognia, głaz, fala uderzeniowa) + dekoracje
    this.renderBossProjectiles();
    this.updateBossDecor(dt);
    // telegraf ataku naziemnego: pas ziemi pod graczem miga (aneks 8.4.1)
    const d = this.combat.dragon;
    const flameTele = d.state === 'TELEGRAPH' && d.pattern === 'pira'
      && d.atkA % 2 < 1;
    if (flameTele) {
      if (!this.flameShimmer) {
        this.flameShimmer = this.add.rectangle(0, 0, 9 * TILE, 6, 0xff5a2a, 0.5)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(-39);
      }
      this.flameShimmer.setVisible(Math.floor(this.time.now / 110) % 2 === 0)
        .setPosition(this.player.cx, 19 * TILE - 3);
    } else {
      this.flameShimmer?.setVisible(false);
    }
    // BOSS telegraf flame/charge: pas `~` przy ziemi przez całą arenę (v1)
    const bossTele = d.pattern === 'boss' && d.state === 'TELEGRAPH'
      && (d.telegraphKind === 'flame' || d.telegraphKind === 'charge');
    if (bossTele) {
      if (!this.bossTeleStrip) {
        this.bossTeleStrip = this.add
          .rectangle(0, 0, 80 * TILE, 5, 0xffa040, 0.55)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(-39);
      }
      this.bossTeleStrip
        .setVisible(Math.floor(this.time.now / 110) % 2 === 0)
        .setPosition(this.combat.rect.x0 + 40 * TILE, 19 * TILE - 4);
    } else {
      this.bossTeleStrip?.setVisible(false);
    }
    // timer ucieczki w HUD (+ ostrzeżenie 30 s) — BOSS bez timera (8.4.3)
    if (d.pattern !== 'boss') {
      const remaining = Math.max(0, Math.ceil(this.diff.dragonFlee - this.combat.arenaTime));
      if (remaining !== this.lastTimerEmit) {
        this.lastTimerEmit = remaining;
        this.events.emit('hud:timer', { remaining, warning: remaining <= 30 });
      }
    }
  }

  /** BOSS: sync pooli sprite'ów z core (fale ognia, głazy, fale uderzeniowe)
   *  + kolizje z graczem (w arenie trafienie = −1 serce) */
  private renderBossProjectiles(): void {
    if (!this.combat) return;
    const pb = this.player.body;
    const canHurt = this.player.iframes <= 0 && !this.frozen;
    // pozioma fala ognia przy ziemi (faza 1 atak A — przeskok)
    const waves = this.combat.flamewaves;
    while (this.waveSprites.length < waves.length) {
      this.waveSprites.push(
        this.add.image(0, 0, 'p-circle-big').setTint(0xff7020)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(6).setVisible(false),
      );
    }
    for (let i = 0; i < this.waveSprites.length; i++) {
      const s = this.waveSprites[i];
      const fw = waves[i];
      if (!fw || !fw.alive) {
        s.setVisible(false);
        continue;
      }
      const y = 18 * TILE + 4;
      s.setVisible(true).setPosition(fw.x, y)
        .setScale(1.0 + 0.15 * Math.sin(this.time.now / 50 + i), 1.55);
      this.emFire.emitParticleAt(fw.x - fw.dir * 10, y + Phaser.Math.Between(-8, 6), 1);
      if (canHurt
        && fw.x + 10 > pb.x && fw.x - 10 < pb.x + pb.width
        && pb.y + pb.height > 17 * TILE) {
        fw.alive = false;
        s.setVisible(false);
        this.hurtPlayer(fw.x);
      }
    }
    // głaz O nad kolumną gracza (faza 1 atak B)
    const boulders = this.combat.bossBoulders;
    while (this.boulderSprites.length < boulders.length) {
      this.boulderSprites.push(
        this.add.image(0, 0, 'boulder').setDisplaySize(20, 20)
          .setDepth(6).setVisible(false),
      );
    }
    for (let i = 0; i < this.boulderSprites.length; i++) {
      const s = this.boulderSprites[i];
      const bb = boulders[i];
      if (!bb || !bb.alive) {
        if (s.visible && bb && !bb.alive) {
          this.emDust.explode(8, s.x, 19 * TILE);
          this.cameras.main.shake(90, 0.004);
        }
        s.setVisible(false);
        continue;
      }
      s.setVisible(true).setPosition(bb.x, bb.y)
        .setRotation(this.time.now / 180);
      if (canHurt
        && bb.x + 9 > pb.x && bb.x - 9 < pb.x + pb.width
        && bb.y + 9 > pb.y && bb.y - 9 < pb.y + pb.height) {
        bb.alive = false;
        s.setVisible(false);
        this.hurtPlayer(bb.x);
      }
    }
    // fala uderzeniowa ^ po ziemi w obie strony (faza 3 po szarży — przeskok)
    const shocks = this.combat.shocks;
    while (this.shockSprites.length < shocks.length) {
      this.shockSprites.push(
        this.add.image(0, 0, 'p-circle-small').setTint(COLN.gold)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(6).setVisible(false),
      );
    }
    for (let i = 0; i < this.shockSprites.length; i++) {
      const s = this.shockSprites[i];
      const sh = shocks[i];
      if (!sh || !sh.alive) {
        s.setVisible(false);
        continue;
      }
      const y = 18.6 * TILE;
      s.setVisible(true).setPosition(sh.x, y).setScale(1.6, 0.8);
      if (Math.floor(this.time.now / 70) % 2 === 0) {
        this.emDust.explode(1, sh.x - sh.dir * 6, 19 * TILE);
      }
      if (canHurt
        && sh.x + 8 > pb.x && sh.x - 8 < pb.x + pb.width
        && pb.y + pb.height > 18.1 * TILE) {
        sh.alive = false;
        s.setVisible(false);
        this.hurtPlayer(sh.x);
      }
    }
  }

  /** render + kolizja pasów ognia przy ziemi (Pira; core: ArenaCombat.flames) */
  private renderGroundFlames(): void {
    if (!this.combat) return;
    const flames = this.combat.flames;
    devMark({ flames: flames.filter((f) => f.alive).length });
    while (this.flameRects.length < flames.length) {
      this.flameRects.push(
        this.add.rectangle(0, 0, TILE, TILE, 0xff9a30, 0.85)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(-38).setVisible(false),
      );
    }
    const pb = this.player.body;
    for (let i = 0; i < this.flameRects.length; i++) {
      const rect = this.flameRects[i];
      const fl: GroundFlame | undefined = flames[i];
      if (!fl || !fl.alive) {
        rect.setVisible(false);
        continue;
      }
      const x0 = fl.c0 * TILE;
      const w = (fl.c1 - fl.c0 + 1) * TILE;
      const y = 18 * TILE;   // pas nad podłogą areny (wiersz 18)
      rect.setVisible(true).setPosition(x0 + w / 2, y + 10);
      rect.width = w;
      rect.height = 12;
      rect.setAlpha(0.6 + 0.35 * Math.abs(Math.sin(this.time.now / 90)));
      // płomień particles wzdłuż pasa (gęsto — pas ma buchać ogniem)
      this.emFire.emitParticleAt(x0 + Math.random() * w, y + 12, 2);
      this.emFire.emitParticleAt(x0 + Math.random() * w, y + 6, 1);
      if (Math.floor(this.time.now / 60) % 2 === 0) {
        this.emGeyser.emitParticleAt(x0 + Math.random() * w, y + 12, 1);
      }
      // parzy (w arenie = −1 serce)
      if (this.player.iframes <= 0 && !this.frozen
        && pb.x + pb.width > x0 && pb.x < x0 + w
        && pb.y + pb.height > y - 2) {
        this.hurtPlayer(this.player.cx + 8);
      }
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
        case 'phase': {
          // zmiana fazy bossa: flash + shake + ryk + docinka Vabanka (aneks A)
          const cam = this.cameras.main;
          cam.flash(160, 255, 200, 80);
          cam.shake(380, 0.012);
          this.dragonE.playRoar();
          this.sfx('sfx-dragon-roar', 0.8);
          this.vabankHop();
          this.vabankSay(ev.phase === 2 ? VABANK_TAUNTS.phase2 : VABANK_TAUNTS.phase3);
          // platformy spawnują się już przy wejściu do areny (decyzja z
          // playtestu); wywołanie zostaje jako siatka bezpieczeństwa
          if (ev.phase === 2) this.spawnBossPlatforms();
          break;
        }
        case 'fled':
          this.onDragonFled();
          break;
        case 'dying':
          this.dragonWarn = false;
          this.dragonE.warnBlink(false);
          this.slowmo();
          // BOSS: kamera dojeżdża do konającego smoka (eksplozja w kadrze)
          if (d.pattern === 'boss') {
            const cam = this.cameras.main;
            cam.stopFollow();
            cam.pan(d.x + d.w / 2, FIELD_H / 2, 900, 'Sine.easeInOut');
          }
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
    const isBoss = d.pattern === 'boss';
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    this.dragonE.hide();
    this.emBoom.explode(isBoss ? 80 : 46, cx, cy);
    this.emSpark.explode(isBoss ? 44 : 24, cx, cy);
    this.addScore(isBoss ? SCORE.boss : SCORE.dragon, cx, cy - 10);
    this.sfx('sfx-fanfare', 0.7);
    this.musicDragon?.stop();
    if (isBoss) this.musicWorld?.stop();   // BOSS: musicWorld = 'music-boss'
    if (this.cache.audio.exists('music-victory')) {
      this.sound.play('music-victory', { volume: 0.55 });
    }
    this.events.emit('hud:arena-end');
    if (isBoss) {
      // finał: większy rozpad + konfetti 'p-star' + salwy przez całą arenę
      this.cameras.main.shake(600, 0.012);
      this.cameras.main.flash(260, 255, 214, 90);
      this.emConfetti.explode(56, cx, cy - 30);
      for (let i = 1; i <= 7; i++) {
        this.time.delayedCall(i * 340, () => {
          const bx = this.cameras.main.worldView.x + 80 + Math.random() * 480;
          const by = 50 + Math.random() * 140;
          this.emConfetti.explode(32, bx, by);
          this.emSpark.explode(16, bx, by);
        });
      }
      // Vabank spada z łba na ziemię (walka skończona, docinka w overlayu)
      if (this.vabank) {
        this.tweens.add({
          targets: this.vabank, y: 19 * TILE, x: this.vabank.x + 26,
          duration: 700, ease: 'Bounce.out',
        });
      }
    }
    const name = DRAGONS[this.def.dragon].name;
    const lines = isBoss
      ? [
        { text: `${name} WOLNY! CZAR PĘKŁ!`, size: 15, color: COL.gold },
        { text: WIN_MESSAGES[0], size: 15, color: COL.white },
        { text: VABANK_TAUNTS.afterFight, size: 13, color: COL.purple },
      ]
      : [
        { text: `${name} WOLNY!`, size: 15, color: COL.gold },
        { text: WIN_MESSAGES[0], size: 15, color: COL.white },
      ];
    // BOSS: najpierw sekunda czystej eksplozji + konfetti, potem nakładka
    const overlayDelay = isBoss ? 1000 : 0;
    this.time.delayedCall(overlayDelay, () => {
      const cont = this.overlayBox(lines);
      this.time.delayedCall(isBoss ? 3400 : 2400, () => {
        cont.destroy();
        this.levelComplete(true);
      });
    });
  }

  // ════════════════════════ RUNNER (typ C — aneks 8.3) ═══════════════════

  private buildRunner(): void {
    const pattern = RUNNER_PATTERNS[this.def.pattern ?? ''];
    const useLina = !!this.def.gate && this.save.echo_lina;
    // tabela biegów: trudność × runner (Skrzat: baza ŁATWY × 0.7) — spec playtest2
    const gears = runnerGearsFor(this.diffId, this.levelId as RunnerId, this.save.skrzat);
    this.rn = new RunnerState(pattern, gears, useLina);
    this.rnLastGear = 1;
    this.rnMusicRate = 1;
    this.gateLogic = this.def.gate ? new GateState() : null;
    // licznik kryształów HUD/gwiazdek liczy tor runnera
    this.map.crystalTotal = this.rn.crystalTotal;
    // dev: ?rnff=0.95 → szybkie przewinięcie sekcji (e2e bramy/areny)
    const ff = devParam('rnff');
    if (ff) {
      const f = Math.max(0, Math.min(0.999, parseFloat(ff)));
      if (Number.isFinite(f)) this.rn.traveled = this.rn.trackLen * f;
    }

    // grunt: pula kafli (przewijana), wiersz 19
    const tex = this.terrainTex();
    for (let i = 0; i < 44; i++) {
      this.rnGround.push(
        this.add.image(0, RUNNER_GROUND_Y + 8, tex, 1).setDepth(-50).setVisible(false),
      );
    }
    // przeszkody z patternu: kaktus (1×2) / Machacz-nietoperz (ślizg!)
    const cactus = this.cactusTex();
    for (const o of this.rn.obstacles) {
      let s: Phaser.GameObjects.Sprite;
      if (o.kind === 'K') {
        s = this.add.sprite(0, RUNNER_GROUND_Y, cactus, 0).setOrigin(0.5, 1);
      } else {
        s = this.add.sprite(0, 17 * TILE + 8, 'enemy-bat-flying', 0).setOrigin(0.5, 0.5);
        s.play({ key: 'bat-fly', startFrame: Math.floor(o.x / 100) % 7 });
        if (this.world === 3) s.setTint(WORLD3_ENEMY_TINT);
      }
      s.setDepth(-40).setVisible(false);
      this.rnObSprites.push(s);
      this.rnObDead.push(false);
      this.rnObSeen.push(false);
    }
    // kryształy (wiersz skoku) i pęki strzał (grunt)
    for (const c of this.rn.crystals) {
      const s = this.add.sprite(0, c.y + 8, 'crystal', 0).setDepth(-30).setVisible(false);
      s.play({ key: 'crystal-spin', startFrame: Math.floor(c.x / 16) % 4 });
      this.rnCrystalSprites.push(s);
    }
    for (const a of this.rn.arrowPacks) {
      void a;
      const img = this.add.image(0, RUNNER_GROUND_Y - 6, 'arrow')
        .setRotation(-Math.PI / 4).setDepth(-30).setVisible(false);
      this.rnArrowSprites.push(img);
    }
    // bohaterka na stałej kolumnie ekranu (RUNNER_PLAYER_X)
    this.rnSim = createSim(RUNNER_PLAYER_X, RUNNER_GROUND_Y - PLAYER_H);
    this.rnSim.onGround = true;
    this.rnView = new RunnerPlayerView(
      this, RUNNER_PLAYER_X + 8, RUNNER_GROUND_Y, this.charId,
    );
    this.ensureArrowPool();
    this.buildRunnerChaser();
    // kamera statyczna: świat scrolluje, nie kamera (viewport w px bufora ×2)
    const cam = this.cameras.main;
    cam.setViewport(0, GAME_FIELD_Y * RENDER_SCALE, 640 * RENDER_SCALE, FIELD_H * RENDER_SCALE);
    cam.setZoom(RENDER_SCALE);
    cam.centerOn(320, FIELD_H / 2);
    cam.setBounds(0, 0, 640, FIELD_H);
    cam.setBackgroundColor(COLN.night);
  }

  /** smok pościgu: 1-3 Samum UCIEKA przed tobą (sieje pułapki — aneks 3.5);
   *  2-3 Monsun GONI za plecami; 3-3 lawa idzie od lewej (aneks 8.6) */
  private buildRunnerChaser(): void {
    if (this.levelId === '1-3') {
      this.rnChaser = this.add.sprite(552, 92, 'dragon-samum', 72)
        .setScale(1.15).setDepth(-20);
      this.rnChaser.play('dragon-samum-fly');
    } else if (this.levelId === '2-3') {
      this.rnChaser = this.add.sprite(52, 104, 'dragon-monsun', 72)
        .setScale(1.2).setDepth(-20);
      this.rnChaser.play('dragon-monsun-fly');
    } else {
      // 3-3: ściana lawy za plecami (particle, nie asset)
      this.add.rectangle(9, FIELD_H / 2, 18, FIELD_H, 0x7a1a10, 0.9).setDepth(-22);
      this.add.rectangle(20, FIELD_H / 2, 6, FIELD_H, 0xff6a28, 0.85)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(-22);
      this.add.particles(0, 0, 'p-circle-small', {
        x: { min: 2, max: 22 }, y: { min: 8, max: FIELD_H - 6 },
        speedX: { min: 8, max: 40 }, speedY: { min: -50, max: -10 },
        lifespan: { min: 300, max: 800 },
        scale: { start: 0.55, end: 0 }, alpha: { start: 0.95, end: 0 },
        tint: [0xff8030, 0xffd23f, 0xff4020],
        blendMode: Phaser.BlendModes.ADD, frequency: 70, quantity: 1,
      }).setDepth(-21);
    }
  }

  private updateRunner(dt: number): void {
    const rn = this.rn;
    const sim = this.rnSim;
    const view = this.rnView;
    if (!rn || !sim || !view) return;

    if (!this.gateOpening) rn.update(dt);
    this.updateGearLayer(dt);

    // input: skok edge-triggered, ślizg trzymany (aneks 8.1/8.3) + dotyk (OR)
    const touch = this.touchFrame;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.space)
      || Phaser.Input.Keyboard.JustDown(this.cursors.up)
      || Phaser.Input.Keyboard.JustDown(this.keys.W)
      || touch.jump;
    const down = this.cursors.down.isDown || this.keys.S.isDown || touch.down;
    const absX = rn.traveled + RUNNER_PLAYER_X;
    const env: SimEnv = {
      groundYAt: () => {
        const gx = Math.floor(absX / TILE) * TILE;
        return rn.groundAt(gx) || rn.groundAt(gx + TILE) ? RUNNER_GROUND_Y : null;
      },
    };
    const wasGround = sim.onGround;
    simStep(sim, { move: 0, jumpPressed, down }, this.char, env, dt);
    if (jumpPressed && wasGround && !sim.onGround) {
      this.sfx('sfx-jump', 0.45, true);
      this.emDust.explode(4, RUNNER_PLAYER_X + 8, RUNNER_GROUND_Y);
    }
    if (!this.rnWasGround && sim.onGround) {
      this.sfx('sfx-land', 0.3, true);
      this.emDust.explode(4, RUNNER_PLAYER_X + 8, sim.y + sim.h);
    }
    this.rnWasGround = sim.onGround;
    // kurz sprintu
    if (sim.onGround && Math.floor(this.time.now / 140) % 2 === 0) {
      this.emDust.explode(1, RUNNER_PLAYER_X, sim.y + sim.h);
    }

    // strzały (Machacz 1 HP; kaktus połyka strzałę — core/runnerArrowHit)
    if (Phaser.Input.Keyboard.JustDown(this.keys.X) || touch.shoot) this.runnerShoot(false);
    if (Phaser.Input.Keyboard.JustDown(this.keys.Z) || touch.magic) this.runnerShoot(true);
    this.updateRunnerArrows(dt);

    // zbiórki (core) + efekty na świeżo zebranych
    const takenC = rn.crystals.map((c) => c.taken);
    const takenA = rn.arrowPacks.map((a) => a.taken);
    collectRunnerPickups(rn, sim.y, sim.h);
    for (let i = 0; i < rn.crystals.length; i++) {
      if (!takenC[i] && rn.crystals[i].taken) {
        this.collect('crystal', rn.crystals[i].x - rn.traveled + 8, rn.crystals[i].y + 8, false);
      }
    }
    for (let i = 0; i < rn.arrowPacks.length; i++) {
      if (!takenA[i] && rn.arrowPacks[i].taken) {
        this.collect('arrow', rn.arrowPacks[i].x - rn.traveled + 8, RUNNER_GROUND_Y - 6, false);
      }
    }

    // kolizje (hojny hitbox z core) + dziury
    if (!this.rnFinished && view.iframes <= 0) {
      const hit = checkObstacleHit(rn, sim.y, sim.h);
      if (hit) {
        this.emHitSpark.explode(8, RUNNER_PLAYER_X + 8, sim.y + sim.h / 2);
        this.loseLife();
        return;
      }
    }
    if (sim.y > 20.5 * TILE) {
      this.loseLife();
      return;
    }

    this.renderRunner(dt);

    // pasek postępu (HUD)
    const pct = Math.round(rn.progress() * 100);
    if (pct !== this.rnLastProgress) {
      this.rnLastProgress = pct;
      this.events.emit('hud:runner', { progress: rn.progress() });
    }

    devMark({
      scene: 'Level', level: this.levelId, phase: this.phase,
      progress: Math.round(rn.progress() * 1000) / 1000,
      runnerDone: rn.done, playerY: Math.round(sim.y),
      sliding: sim.crouch, crystals: this.crystals,
      nearestN: this.nearestObstacleSx('n'), nearestK: this.nearestObstacleSx('K'),
      nearestG: this.nearestGapSx(), gear: rn.gear, rnV: Math.round(rn.v),
      gateOpening: this.gateOpening,
    });

    if (rn.done && !this.rnFinished) {
      this.rnFinished = true;
      this.onRunnerDone();
    }
    if (this.rnFinished && this.gateLogic) this.updateGate(dt);
  }

  /**
   * Warstwa AV systemu biegów (spec playtest2): fanfara + chevrony w HUD przy
   * zmianie biegu, rate muzyki 1.00–1.12, linie prędkości od biegu 2.
   */
  private updateGearLayer(dt: number): void {
    const rn = this.rn;
    if (!rn) return;
    const gear = rn.gear;
    if (gear !== this.rnLastGear) {
      const up = gear > this.rnLastGear;
      this.rnLastGear = gear;
      this.events.emit('hud:runner-gear', { gear });
      if (up) this.gearFanfare(gear);
    }
    // muzyka: rate per bieg; wraca do 1.00 przy decel (przed areną/bramą)
    const rate = rn.decel ? 1 : GEAR_MUSIC_RATE[gear - 1];
    if (rate !== this.rnMusicRate) {
      this.rnMusicRate = rate;
      this.setMusicRate(rate);
    }
    // linie prędkości: poziome kreski od prawej krawędzi, 2× prędkość scrolla
    const perSecond = rn.decel ? 0 : GEAR_LINES_PER_S[gear - 1];
    if (perSecond > 0) {
      this.rnLineSpawnT += dt * perSecond;
      while (this.rnLineSpawnT >= 1) {
        this.rnLineSpawnT -= 1;
        this.spawnSpeedLine();
      }
    }
    for (const l of this.rnLines) {
      if (!l.alive) continue;
      l.rect.x -= 2 * rn.v * dt;
      if (l.rect.x < -40) {
        l.alive = false;
        l.rect.setVisible(false);
      }
    }
  }

  private spawnSpeedLine(): void {
    let line = this.rnLines.find((l) => !l.alive);
    if (!line) {
      if (this.rnLines.length >= 14) return;
      // zwykły blend (ADD ginie na jasnym niebie świata 2) + delikatny kontur
      line = {
        rect: this.add.rectangle(0, 0, 30, 2, 0xffffff, 0.7)
          .setStrokeStyle(1, 0x22223a, 0.35).setDepth(-25),
        alive: false,
      };
      this.rnLines.push(line);
    }
    line.alive = true;
    line.rect.setVisible(true)
      .setPosition(660, 24 + Math.random() * 270)
      .setAlpha(0.45 + Math.random() * 0.3);
    line.rect.width = 24 + Math.random() * 20;
  }

  /** fanfara zmiany biegu: arpeggio 3 nut w górę, wyżej z każdym biegiem;
   *  Tryb Skrzat: dźwięk pominięty (bell wyłączony), wizual w HUD zostaje */
  private gearFanfare(gear: number): void {
    if (this.save.skrzat || !this.cache.audio.exists('sfx-crystal')) return;
    const base = 0.85 + gear * 0.15;
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 90, () => {
        this.sound.play('sfx-crystal', { volume: 0.45, rate: base * (1 + i * 0.25) });
      });
    }
  }

  private setMusicRate(rate: number): void {
    const m = this.musicWorld as (Phaser.Sound.BaseSound & {
      setRate?: (r: number) => void;
    }) | null;
    m?.setRate?.(rate);
  }

  /** ekranowe x najbliższej dziury (dev/e2e — bot skoków) */
  private nearestGapSx(): number {
    const rn = this.rn;
    if (!rn) return 9999;
    let best = 9999;
    for (const g of rn.gaps) {
      const sx = g.x - rn.traveled - RUNNER_PLAYER_X;
      if (sx > -2 * TILE && sx < best) best = sx;
    }
    return Math.round(best);
  }

  /** ekranowe x najbliższej żywej przeszkody danego typu (dev/e2e) */
  private nearestObstacleSx(kind: 'K' | 'n'): number {
    const rn = this.rn;
    if (!rn) return 9999;
    let best = 9999;
    for (const o of rn.obstacles) {
      if (!o.alive || o.kind !== kind) continue;
      const sx = o.x - rn.traveled - RUNNER_PLAYER_X;
      if (sx > -2 * TILE && sx < best) best = sx;
    }
    return Math.round(best);
  }

  private runnerShoot(magic: boolean): void {
    if (magic ? this.magic <= 0 : this.arrows <= 0) return;
    const sim = this.rnSim;
    if (!sim) return;
    const shot = this.arrowPool.find((a) => !a.alive);
    if (!shot) return;
    if (magic) this.magic--;
    else this.arrows--;
    this.emitHud();
    shot.alive = true;
    shot.magic = magic;
    shot.vx = ARROW_SPEED;
    shot.traveled = 0;
    shot.sprite
      .setTexture(magic ? 'arrow-magic' : 'arrow')
      .setPosition(RUNNER_PLAYER_X + 18, sim.y + 6)
      .setFlipX(false)
      .setVisible(true);
    this.sfx(magic ? 'sfx-shoot-magic' : 'sfx-shoot', 0.45, true);
  }

  private updateRunnerArrows(dt: number): void {
    const rn = this.rn;
    if (!rn) return;
    for (const a of this.arrowPool) {
      if (!a.alive) continue;
      const step = a.vx * dt;
      a.sprite.x += step;
      a.traveled += Math.abs(step);
      if (a.magic) this.emTrail.emitParticleAt(a.sprite.x - 6, a.sprite.y, 1);
      if (a.traveled > ARROW_RANGE || a.sprite.x > 660) {
        this.killArrow(a);
        continue;
      }
      const hit = runnerArrowHit(rn, a.sprite.x, a.sprite.y);
      if (!hit) continue;
      if (hit.killed) {
        const idx = rn.obstacles.indexOf(hit.obstacle);
        const s = this.rnObSprites[idx];
        if (s && !this.rnObDead[idx]) {
          this.rnObDead[idx] = true;
          s.play('bat-hit', true);
          s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.setVisible(false));
        }
        this.addScore(ENEMY_SCORE.machacz, a.sprite.x, a.sprite.y);
        this.emHitSpark.explode(8, a.sprite.x, a.sprite.y);
        this.sfx('sfx-hit', 0.5, true);
      } else {
        this.emDust.explode(3, a.sprite.x, a.sprite.y);   // wbita w kaktus
      }
      this.killArrow(a);
    }
  }

  /** sync obrazu z RunnerState (grunt, przeszkody, zbiórki, tło, pościg) */
  private renderRunner(dt: number): void {
    const rn = this.rn;
    const sim = this.rnSim;
    const view = this.rnView;
    if (!rn || !sim || !view) return;
    // parallax napędzany przebytą drogą (kamera stoi)
    for (const l of this.skyLayers) {
      l.ts.tilePositionX = rn.traveled * (l.factor === 0 ? 0 : l.factor * 0.5)
        + (this.time.now / 1000) * l.drift;
    }
    // grunt
    const off = rn.traveled % TILE;
    for (let i = 0; i < this.rnGround.length; i++) {
      const g = this.rnGround[i];
      const sx = i * TILE - off;
      g.setPosition(sx + 8, RUNNER_GROUND_Y + 8);
      g.setVisible(rn.groundAt(rn.traveled + sx + 1));
    }
    // przeszkody
    for (let i = 0; i < rn.obstacles.length; i++) {
      const o = rn.obstacles[i];
      const s = this.rnObSprites[i];
      const sx = o.x - rn.traveled;
      if (sx < -3 * TILE || sx > 42 * TILE) {
        if (!this.rnObDead[i]) s.setVisible(false);
        this.rnObSeen[i] = this.rnObSeen[i] && sx < 0;
        continue;
      }
      if (!o.alive) {
        if (!this.rnObDead[i]) s.setVisible(false);
        continue;
      }
      if (!this.rnObSeen[i] && sx < 41 * TILE) {
        this.rnObSeen[i] = true;
        // 1-3: Samum „sieje pułapki" — obłoczek przy wejściu przeszkody w kadr
        if (this.levelId === '1-3' && this.rnChaser) {
          this.emSmoke.explode(5, 620, o.kind === 'K' ? RUNNER_GROUND_Y - 12 : 17 * TILE + 8);
          this.tweens.add({
            targets: this.rnChaser, y: 112, duration: 180, yoyo: true, ease: 'Sine.out',
          });
        }
      }
      s.setVisible(true);
      if (o.kind === 'K') {
        s.setPosition(sx + 8, RUNNER_GROUND_Y);
      } else {
        s.setPosition(sx + 8, 17 * TILE + 8 + Math.sin(this.time.now / 160 + i) * 3);
      }
    }
    // zbiórki
    for (let i = 0; i < rn.crystals.length; i++) {
      const c = rn.crystals[i];
      const s = this.rnCrystalSprites[i];
      const sx = c.x - rn.traveled;
      s.setVisible(!c.taken && sx > -TILE && sx < 41 * TILE);
      s.setPosition(sx + 8, c.y + 8 + Math.sin(this.time.now / 250 + i) * 2);
    }
    for (let i = 0; i < rn.arrowPacks.length; i++) {
      const a = rn.arrowPacks[i];
      const s = this.rnArrowSprites[i];
      const sx = a.x - rn.traveled;
      s.setVisible(!a.taken && sx > -TILE && sx < 41 * TILE);
      s.setPosition(sx + 8, RUNNER_GROUND_Y - 6);
    }
    // bohaterka
    view.update(dt, sim.y + sim.h, sim.onGround, sim.crouch, sim.vy);
    // pościg: Monsun goni (ryk + szarpnięcie co ~12 s), Samum buja się w locie
    this.rnChaserT += dt;
    if (this.rnChaser) {
      const baseY = this.levelId === '1-3' ? 92 : 104;
      this.rnChaser.y = baseY + Math.sin(this.time.now / 300) * 6;
      if (this.levelId === '2-3' && this.rnChaserT > 12) {
        this.rnChaserT = 0;
        this.sfx('sfx-dragon-roar', 0.4);
        this.cameras.main.shake(120, 0.004);
        this.tweens.add({
          targets: this.rnChaser, x: 84, duration: 260, yoyo: true, ease: 'Sine.inOut',
        });
      }
    }
  }

  /** koniec sekcji: 1-3/2-3 → arena smoka; 3-3 → brama bossa (10 kryształów) */
  private onRunnerDone(): void {
    this.events.emit('hud:runner-end');
    if (this.def.gate) {
      this.buildGateVisual();
      return;
    }
    // przejście do areny: zburz obiekty runnera, zbuduj świat areny
    this.teardownRunner();
    this.buildPlatformWorld();
    this.startRunnerArena();
  }

  private teardownRunner(): void {
    for (const g of this.rnGround) g.destroy();
    this.rnGround = [];
    for (const s of this.rnObSprites) s.destroy();
    this.rnObSprites = [];
    for (const s of this.rnCrystalSprites) s.destroy();
    this.rnCrystalSprites = [];
    for (const s of this.rnArrowSprites) s.destroy();
    this.rnArrowSprites = [];
    this.rnChaser?.destroy();
    this.rnChaser = null;
    this.rnView?.destroy();
    this.rnView = null;
    for (const a of this.arrowPool) this.killArrow(a);
    for (const l of this.rnLines) l.rect.destroy();
    this.rnLines = [];
    this.setMusicRate(1);   // rate muzyki wraca do 1.00 przed areną
    this.rn = null;
    this.rnSim = null;
  }

  /** brama bossa na końcu 3-3 (render; logika w core/GateState) */
  private buildGateVisual(): void {
    const gx = 560;
    const cont = this.add.container(0, 0).setDepth(-35);
    // filary i nadproże z kafli obsydianu (kolumna 17×5: klatki 4/21/38)
    for (const [dx, frames] of [[-24, [4, 21, 21, 38]], [24, [4, 21, 21, 38]]] as const) {
      for (let i = 0; i < frames.length; i++) {
        cont.add(this.add.image(gx + dx, RUNNER_GROUND_Y - 8 - (frames.length - 1 - i) * TILE,
          'terrain-obsidian', frames[i]));
      }
    }
    for (let i = -1; i <= 1; i++) {
      cont.add(this.add.image(gx + i * TILE, RUNNER_GROUND_Y - 8 - 4 * TILE,
        'terrain-obsidian', 4 * 17 + 1));
    }
    // wrota (ciemne) + poświata stanu
    cont.add(this.add.rectangle(gx, RUNNER_GROUND_Y - 32, 32, 64, 0x1a1420));
    this.gateGlow = this.add.rectangle(gx, RUNNER_GROUND_Y - 32, 28, 60, 0xff5a5a, 0.25)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(-34);
    const star = this.add.image(gx, RUNNER_GROUND_Y - 78, 'ui-star');
    cont.add(star);
    this.tweens.add({
      targets: star, y: star.y - 5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    cont.add(this.add.sprite(gx - 40, RUNNER_GROUND_Y - 40, 'crystal', 0).setScale(0.8));
    cont.add(this.add.sprite(gx + 40, RUNNER_GROUND_Y - 40, 'crystal', 1).setScale(0.8));
    this.gateCont = cont;
  }

  /** po zatrzymaniu 3-3: sprawdzenie 10 kryształów (core/GateState) */
  private updateGate(dt: number): void {
    if (!this.gateLogic || !this.rn || this.gateOpening) return;
    const need = gateRequirement(this.save.skrzat);
    const res = this.gateLogic.update(dt, this.crystals, need);
    if (res === 'open') {
      this.gateOpening = true;
      this.gateBlockedT = 0;
      this.gateGlow?.setFillStyle(0x66ff88, 0.4);
      this.sfx('sfx-gate-open', 0.6);
      this.toast(SCENE_MESSAGES.gateOpen, 2400);
      const view = this.rnView;
      if (view) {
        this.tweens.add({
          targets: view.sprite, x: 560, duration: 1200, ease: 'Sine.inOut',
          onComplete: () => this.levelComplete(false),
        });
      } else {
        this.levelComplete(false);
      }
    } else if (res === 'blockedMessage') {
      this.gateBlockedT = 0;
      this.toast(EVENT_MESSAGES.gateNeedsCrystals, 2200);
      this.sfx('sfx-shield-clink', 0.5);
      this.gateGlow?.setFillStyle(0xff5a5a, 0.4);
    } else if (res === 'blocked') {
      // gracz tkwi pod zamkniętą bramą > 3 s → ponów toast (asekuracyjnie:
      // core resetuje sekcję po 2,5 s jak v1, więc to siatka bezpieczeństwa
      // na wypadek zmiany czasów w core — bez zmian w GateState)
      this.gateBlockedT += dt;
      if (this.gateBlockedT > 3) {
        this.gateBlockedT = 0;
        this.toast(EVENT_MESSAGES.gateNeedsCrystals, 2000);
      }
    } else if (res === 'reset') {
      // za mało kryształów: powrót na start sekcji (v1) — snapshot wraca
      this.toast('Za mało kryształów — jeszcze raz po nie!', 2400);
      this.runnerSectionReset();
    }
  }

  /** pełny reset sekcji runnera (śmierć / brama): snapshot + prędkość startowa */
  private runnerSectionReset(): void {
    const rn = this.rn;
    const sim = this.rnSim;
    if (!rn || !sim) return;
    this.arrows = this.snapshot.arrows;
    this.hasCake = this.snapshot.hasCake;
    this.diamondsTotal = this.snapshot.diamondsTotal;
    this.diamondsLevel = 0;
    this.score = this.snapshot.score;
    this.crystals = 0;
    this.magic = 0;
    this.hearts = this.maxHearts;
    rn.reset();
    this.rnFinished = false;
    this.gateOpening = false;
    this.gateBlockedT = 0;
    this.gateGlow?.destroy();
    this.gateGlow = null;
    this.gateCont?.destroy();
    this.gateCont = null;
    sim.y = RUNNER_GROUND_Y - PLAYER_H;
    sim.vy = 0;
    sim.h = PLAYER_H;
    sim.crouch = false;
    sim.onGround = true;
    for (let i = 0; i < this.rnObDead.length; i++) {
      this.rnObDead[i] = false;
      this.rnObSeen[i] = false;
      const s = this.rnObSprites[i];
      const o = rn.obstacles[i];
      if (o.kind === 'n') s.play('bat-fly', true);
      s.setVisible(false);
    }
    for (const a of this.arrowPool) this.killArrow(a);
    if (this.rnView) this.rnView.iframes = 1.5;
    // biegi (spec playtest2): reset → bieg 1, muzyka rate 1.00, chevrony = 1
    this.rnLastGear = 1;
    this.rnMusicRate = 1;
    this.setMusicRate(1);
    this.rnLineSpawnT = 0;
    for (const l of this.rnLines) {
      l.alive = false;
      l.rect.setVisible(false);
    }
    this.events.emit('hud:runner-gear', { gear: 1 });
    this.events.emit('hud:runner-start');
    this.events.emit('hud:runner', { progress: 0 });
    this.emitHud();
  }

  // ── koniec poziomu ──────────────────────────────────────────────────────

  private levelComplete(dragonDefeated: boolean): void {
    if (this.frozen) return;
    // koniec poziomu z niedozyskanym łupem (u złodzieja albo w kopczyku):
    // łup przepada bezpowrotnie — komunikat i dopiero potem Summary
    if ((this.thiefE && this.thiefE.logic.loot) || this.mound) {
      this.thiefE?.destroy();
      this.thiefE = null;
      this.destroyMound();
      this.toast(THIEF_MSG.lootLost, 1800);
      this.frozen = true;
      this.time.delayedCall(1600, () => {
        this.frozen = false;
        this.levelComplete(dragonDefeated);
      });
      return;
    }
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
