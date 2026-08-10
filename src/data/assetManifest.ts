/**
 * Manifest assetów STRZA/ŁA 2.0 — wygenerowany przez pipeline F0 (raw-assets → public/assets).
 * URL-e względne wobec base (bez wiodącego "/") — Phaser: this.load.setPath() nie jest wymagane.
 *
 * Źródła i licencje: patrz CREDITS.md.
 */

export interface ImageAsset {
  key: string;
  url: string;
}

export interface SpritesheetAsset {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
}

export interface AudioAsset {
  key: string;
  url: string;
}

/** Pojedyncze obrazki (nieanimowane lub cięte przez silnik ad hoc). */
export const IMAGES: ImageAsset[] = [
  // pickupy / pułapki
  { key: 'arrow', url: 'assets/sprites/arrow.png' }, // 16×4, drewno+pióra
  { key: 'arrow-magic', url: 'assets/sprites/arrow-magic.png' }, // 16×4, cyjan
  { key: 'placek', url: 'assets/sprites/placek.png' }, // 16×16
  { key: 'heart-pickup', url: 'assets/sprites/heart-pickup.png' }, // 16×16
  { key: 'powerup-shield', url: 'assets/sprites/powerup-shield.png' }, // 16×16
  { key: 'powerup-magnet', url: 'assets/sprites/powerup-magnet.png' }, // 16×16
  { key: 'cactus-small', url: 'assets/sprites/cactus-small.png' }, // 16×16
  { key: 'cactus-big', url: 'assets/sprites/cactus-big.png' }, // 16×32
  { key: 'cactus-bush-big', url: 'assets/sprites/cactus-bush-big.png' }, // 16×32 kolczasty krzak (świat 2)
  { key: 'cactus-lava-big', url: 'assets/sprites/cactus-lava-big.png' }, // 16×32 lawowy kaktus (świat 3)
  { key: 'geyser-base', url: 'assets/sprites/geyser-base.png' }, // 16×16 podstawka gejzera (kolumna = particles)
  { key: 'spikes', url: 'assets/sprites/spikes.png' }, // 16×16 (PA1)
  { key: 'boulder', url: 'assets/sprites/boulder.png' }, // 42×42 (PA1 Rock Head idle)
  { key: 'mound', url: 'assets/sprites/mound.png' }, // 16×16 kopczyk złodzieja (spec playtest2, gen. PA-style)

  // tła — świat 1 (parallax TileSprite)
  { key: 'world1-sky', url: 'assets/bg/world1-sky.png' }, // 384×128
  { key: 'world1-clouds-big', url: 'assets/bg/world1-clouds-big.png' }, // 448×101
  { key: 'world1-clouds-small', url: 'assets/bg/world1-clouds-small.png' }, // 256×48
  // tła — świat 2 „Dżungla Ech" (F3: gradient + 2 warstwy sylwetek, tileable 320)
  { key: 'world2-sky', url: 'assets/bg/world2-sky.png' }, // 64×320 pion. gradient
  { key: 'world2-far', url: 'assets/bg/world2-far.png' }, // 320×192 korony+palmy
  { key: 'world2-near', url: 'assets/bg/world2-near.png' }, // 320×144 pnie+liany
  // tła — świat 3 „Obsydianowa Góra" (F3: mrok + łuna + granie)
  { key: 'world3-sky', url: 'assets/bg/world3-sky.png' }, // 64×320 czerń→żar
  { key: 'world3-far', url: 'assets/bg/world3-far.png' }, // 320×176 grań + rim light
  { key: 'world3-near', url: 'assets/bg/world3-near.png' }, // 320×128 iglice + pęknięcia
  // tła jednolite PA (menu / światy 2-3), 64×64 tile
  { key: 'pa-blue', url: 'assets/bg/pa-blue.png' },
  { key: 'pa-brown', url: 'assets/bg/pa-brown.png' },
  { key: 'pa-gray', url: 'assets/bg/pa-gray.png' },
  { key: 'pa-green', url: 'assets/bg/pa-green.png' },
  { key: 'pa-pink', url: 'assets/bg/pa-pink.png' },
  { key: 'pa-purple', url: 'assets/bg/pa-purple.png' },
  { key: 'pa-yellow', url: 'assets/bg/pa-yellow.png' },

  // UI (Kenney UI Pack Pixel Adventure + dorysowane)
  { key: 'ui-panel', url: 'assets/ui/panel.png' }, // 32×32, 9-slice (border ~5 px)
  { key: 'ui-panel-brown', url: 'assets/ui/panel-brown.png' }, // 32×32, 9-slice
  { key: 'ui-button', url: 'assets/ui/button.png' }, // 16×16 zielony
  { key: 'ui-button-pressed', url: 'assets/ui/button-pressed.png' }, // 16×16
  { key: 'ui-button-round', url: 'assets/ui/button-round.png' }, // 32×32 (pad dotykowy)
  { key: 'ui-button-round-pressed', url: 'assets/ui/button-round-pressed.png' }, // 32×32
  { key: 'ui-heart-full', url: 'assets/ui/heart-full.png' }, // 16×16 HUD
  { key: 'ui-heart-empty', url: 'assets/ui/heart-empty.png' }, // 16×16 HUD
  { key: 'ui-star', url: 'assets/ui/star.png' }, // 16×16 (mapa świata)
  { key: 'ui-lock', url: 'assets/ui/lock.png' }, // 16×16 (mapa świata)

  // particles (Kenney Particle Pack, białe — tintowane w silniku)
  { key: 'p-circle-small', url: 'assets/particles/circle-small.png' }, // 16×16
  { key: 'p-circle-big', url: 'assets/particles/circle-big.png' }, // 24×24
  { key: 'p-dirt', url: 'assets/particles/dirt.png' }, // 16×16 (kurz skoku)
  { key: 'p-spark', url: 'assets/particles/spark.png' }, // 20×20 (iskry tarczy)
  { key: 'p-star', url: 'assets/particles/star.png' }, // 16×16 (konfetti/rekord)
  { key: 'p-smoke', url: 'assets/particles/smoke.png' }, // 24×24
];

/** Arkusze klatek (animacje + tilesety cięte na kafle). */
export const SPRITESHEETS: SpritesheetAsset[] = [
  // Tosia wariant A — Ranger Girl ×2 (klatki 0–11 idle, 12–17 run)
  { key: 'tosia-ranger', url: 'assets/sprites/tosia-ranger.png', frameWidth: 32, frameHeight: 32 }, // 18 kl.

  // Tosia wariant B (fallback B1) — Ninja Frog recolor malinowy
  { key: 'tosia-frog-idle', url: 'assets/sprites/tosia-frog-idle.png', frameWidth: 32, frameHeight: 32 }, // 11 kl.
  { key: 'tosia-frog-run', url: 'assets/sprites/tosia-frog-run.png', frameWidth: 32, frameHeight: 32 }, // 12 kl.
  { key: 'tosia-frog-jump', url: 'assets/sprites/tosia-frog-jump.png', frameWidth: 32, frameHeight: 32 }, // 1 kl.
  { key: 'tosia-frog-fall', url: 'assets/sprites/tosia-frog-fall.png', frameWidth: 32, frameHeight: 32 }, // 1 kl.
  { key: 'tosia-frog-hit', url: 'assets/sprites/tosia-frog-hit.png', frameWidth: 32, frameHeight: 32 }, // 7 kl.

  // Vega — Huntress, wspólny box 100×68, stopy na y=67 w każdej klatce
  { key: 'vega-idle', url: 'assets/sprites/vega-idle.png', frameWidth: 100, frameHeight: 68 }, // 8 kl.
  { key: 'vega-run', url: 'assets/sprites/vega-run.png', frameWidth: 100, frameHeight: 68 }, // 8 kl.
  { key: 'vega-jump', url: 'assets/sprites/vega-jump.png', frameWidth: 100, frameHeight: 68 }, // 2 kl.
  { key: 'vega-fall', url: 'assets/sprites/vega-fall.png', frameWidth: 100, frameHeight: 68 }, // 2 kl.
  { key: 'vega-attack1', url: 'assets/sprites/vega-attack1.png', frameWidth: 100, frameHeight: 68 }, // 5 kl.
  { key: 'vega-hit', url: 'assets/sprites/vega-hit.png', frameWidth: 100, frameHeight: 68 }, // 3 kl.

  // Złodziejaszek — Mask Dude 1:1
  { key: 'thief-idle', url: 'assets/sprites/thief-idle.png', frameWidth: 32, frameHeight: 32 }, // 11 kl.
  { key: 'thief-run', url: 'assets/sprites/thief-run.png', frameWidth: 32, frameHeight: 32 }, // 12 kl.
  { key: 'thief-jump', url: 'assets/sprites/thief-jump.png', frameWidth: 32, frameHeight: 32 }, // 1 kl.
  { key: 'thief-fall', url: 'assets/sprites/thief-fall.png', frameWidth: 32, frameHeight: 32 }, // 1 kl.
  { key: 'thief-hit', url: 'assets/sprites/thief-hit.png', frameWidth: 32, frameHeight: 32 }, // 7 kl.

  // Vabank — Mask Dude recolor szop (skala ×1,25 w silniku)
  { key: 'vabank-idle', url: 'assets/sprites/vabank-idle.png', frameWidth: 32, frameHeight: 32 }, // 11 kl.

  // Echo — małpa (Jungle Monkey)
  { key: 'echo-idle', url: 'assets/sprites/echo-idle.png', frameWidth: 32, frameHeight: 32 }, // 18 kl.
  { key: 'echo-run', url: 'assets/sprites/echo-run.png', frameWidth: 32, frameHeight: 32 }, // 8 kl.
  { key: 'echo-jump', url: 'assets/sprites/echo-jump.png', frameWidth: 32, frameHeight: 32 }, // 4 kl.

  // Wrogowie (PA2) — UWAGA: różne rozmiary klatek!
  { key: 'enemy-snail-walk', url: 'assets/sprites/enemy-snail-walk.png', frameWidth: 38, frameHeight: 24 }, // 10 kl.
  { key: 'enemy-snail-idle', url: 'assets/sprites/enemy-snail-idle.png', frameWidth: 38, frameHeight: 24 }, // 15 kl.
  { key: 'enemy-snail-hit', url: 'assets/sprites/enemy-snail-hit.png', frameWidth: 38, frameHeight: 24 }, // 5 kl.
  { key: 'enemy-slime-idle-run', url: 'assets/sprites/enemy-slime-idle-run.png', frameWidth: 44, frameHeight: 30 }, // 10 kl.
  { key: 'enemy-slime-hit', url: 'assets/sprites/enemy-slime-hit.png', frameWidth: 44, frameHeight: 30 }, // 5 kl.
  { key: 'enemy-bat-flying', url: 'assets/sprites/enemy-bat-flying.png', frameWidth: 46, frameHeight: 30 }, // 7 kl.
  { key: 'enemy-bat-hit', url: 'assets/sprites/enemy-bat-hit.png', frameWidth: 46, frameHeight: 30 }, // 5 kl.
  { key: 'enemy-fatbird-idle', url: 'assets/sprites/enemy-fatbird-idle.png', frameWidth: 40, frameHeight: 48 }, // 8 kl.
  { key: 'enemy-fatbird-fall', url: 'assets/sprites/enemy-fatbird-fall.png', frameWidth: 40, frameHeight: 48 }, // 4 kl.
  { key: 'enemy-fatbird-hit', url: 'assets/sprites/enemy-fatbird-hit.png', frameWidth: 40, frameHeight: 48 }, // 5 kl.
  { key: 'enemy-bunny-idle', url: 'assets/sprites/enemy-bunny-idle.png', frameWidth: 34, frameHeight: 44 }, // 8 kl. (przysiad = telegraf)
  { key: 'enemy-bunny-run', url: 'assets/sprites/enemy-bunny-run.png', frameWidth: 34, frameHeight: 44 }, // 12 kl.
  { key: 'enemy-bunny-jump', url: 'assets/sprites/enemy-bunny-jump.png', frameWidth: 34, frameHeight: 44 }, // 1 kl.
  { key: 'enemy-bunny-fall', url: 'assets/sprites/enemy-bunny-fall.png', frameWidth: 34, frameHeight: 44 }, // 1 kl.
  { key: 'enemy-bunny-hit', url: 'assets/sprites/enemy-bunny-hit.png', frameWidth: 34, frameHeight: 44 }, // 5 kl.

  // Smoki — arkusz 1360×512: 12 kolumn ×113 px, 8 wierszy ×64 px (96 klatek,
  // indeks = wiersz*12 + kolumna; 4 px marginesu z prawej Phaser ignoruje).
  // Mapa wierszy: patrz komentarz w animations.ts.
  { key: 'dragon-miraz', url: 'assets/sprites/dragon-miraz.png', frameWidth: 113, frameHeight: 64 },
  { key: 'dragon-samum', url: 'assets/sprites/dragon-samum.png', frameWidth: 113, frameHeight: 64 },
  { key: 'dragon-ciern', url: 'assets/sprites/dragon-ciern.png', frameWidth: 113, frameHeight: 64 },
  { key: 'dragon-monsun', url: 'assets/sprites/dragon-monsun.png', frameWidth: 113, frameHeight: 64 },
  { key: 'dragon-pira', url: 'assets/sprites/dragon-pira.png', frameWidth: 113, frameHeight: 64 },
  { key: 'dragon-obsydian', url: 'assets/sprites/dragon-obsydian.png', frameWidth: 113, frameHeight: 64 },

  // Pickupy animowane (Treasure Hunters Blue Diamond, recolory)
  { key: 'crystal', url: 'assets/sprites/crystal.png', frameWidth: 24, frameHeight: 24 }, // 4 kl., cyjan
  { key: 'diamond', url: 'assets/sprites/diamond.png', frameWidth: 24, frameHeight: 24 }, // 4 kl., biel

  // Pułapki animowane (PA1)
  { key: 'saw', url: 'assets/sprites/saw.png', frameWidth: 38, frameHeight: 38 }, // 8 kl.
  { key: 'platform-falling', url: 'assets/sprites/platform-falling.png', frameWidth: 32, frameHeight: 10 }, // 4 kl.
  // znikająca platforma-liana (recolor platform-falling na pnącze — świat 2)
  { key: 'platform-liana', url: 'assets/sprites/platform-liana.png', frameWidth: 32, frameHeight: 10 }, // 4 kl.
  // pochodnia (monkey-jungle) — dekoracja świata 3
  { key: 'torch', url: 'assets/sprites/torch.png', frameWidth: 32, frameHeight: 32 }, // 4 kl.

  // Kafle terenu (cięte jako spritesheet 16×16; indeks = wiersz*kolumny + kolumna)
  // terrain-pa: 22×11 kafli. Kluczowe: trawa-góra (6,0)-(8,0); ziemia-środek (7,1);
  // kamień szary (0,0)-(2,2); złota belka-most 1-kratkowa (17,1)-(19,1).
  { key: 'terrain-pa', url: 'assets/tiles/terrain-pa.png', frameWidth: 16, frameHeight: 16 },
  // terrain-sand (recolor pustynny, ×0.5): 17×5 kafli. piasek-góra (0,0)-(2,0);
  // piasek-środek (1,1); krawędzie (0,1)/(2,1); dół (0,2)-(2,2); kolumna (4,0)-(4,2);
  // platforma 1-kratkowa (0,4)-(2,4), solo (4,4).
  { key: 'terrain-sand', url: 'assets/tiles/terrain-sand.png', frameWidth: 16, frameHeight: 16 },
  // terrain-jungle (monkey-jungle, złożony w TEN SAM układ 17×5 co terrain-sand)
  { key: 'terrain-jungle', url: 'assets/tiles/terrain-jungle.png', frameWidth: 16, frameHeight: 16 },
  // terrain-obsidian (recolor terrain-sand: grafit + żar) — układ 17×5 jw.
  { key: 'terrain-obsidian', url: 'assets/tiles/terrain-obsidian.png', frameWidth: 16, frameHeight: 16 },
  // palms: siatka 48×48, rząd 0: back-palma kołysząca kl. 0-3, back-lewa kl. 4, back-prawa kl. 5;
  // rząd 1: front-korony kl. 6-9, pień+trawa (tileset 48×48) kl. 10.
  { key: 'palms', url: 'assets/tiles/palms.png', frameWidth: 48, frameHeight: 48 },

  // Strzałki UI (pad dotykowy / menu): klatki 0=góra, 1=prawo, 2=dół, 3=lewo
  { key: 'ui-arrows', url: 'assets/ui/arrows.png', frameWidth: 16, frameHeight: 16 },
];

/** Audio — WSZYSTKO odtwarzalne na iPad Safari (m4a/AAC + krótkie WAV). */
export const AUDIO: AudioAsset[] = [
  // muzyka (Juhani Junkala, CC0) — mapping: patrz raport F0 / CREDITS.md
  { key: 'music-menu', url: 'assets/audio/music-menu.m4a' }, // Chiptune Adventures — Stage Select
  { key: 'music-world1', url: 'assets/audio/music-world1.m4a' }, // Chiptune Adventures — Stage 1
  { key: 'music-world2', url: 'assets/audio/music-world2.m4a' }, // Chiptune Adventures — Stage 2
  { key: 'music-world3', url: 'assets/audio/music-world3.m4a' }, // Retro Game Music Pack — Level 3
  { key: 'music-dragon', url: 'assets/audio/music-dragon.m4a' }, // Retro Game Music Pack — Level 2
  { key: 'music-boss', url: 'assets/audio/music-boss.m4a' }, // Chiptune Adventures — Boss Fight
  { key: 'music-victory', url: 'assets/audio/music-victory.m4a' }, // Retro Game Music Pack — Ending

  // SFX (512 Sound Effects, CC0) — wszystkie < 100 KB, zostawione jako WAV
  { key: 'sfx-jump', url: 'assets/audio/sfx-jump.wav' },
  { key: 'sfx-land', url: 'assets/audio/sfx-land.wav' },
  { key: 'sfx-crystal', url: 'assets/audio/sfx-crystal.wav' },
  { key: 'sfx-diamond', url: 'assets/audio/sfx-diamond.wav' },
  { key: 'sfx-shoot', url: 'assets/audio/sfx-shoot.wav' },
  { key: 'sfx-shoot-magic', url: 'assets/audio/sfx-shoot-magic.wav' },
  { key: 'sfx-hit', url: 'assets/audio/sfx-hit.wav' },
  { key: 'sfx-shield-clink', url: 'assets/audio/sfx-shield-clink.wav' },
  { key: 'sfx-heart-loss', url: 'assets/audio/sfx-heart-loss.wav' },
  { key: 'sfx-theft-alarm', url: 'assets/audio/sfx-theft-alarm.wav' },
  { key: 'sfx-echo-whistle', url: 'assets/audio/sfx-echo-whistle.wav' },
  { key: 'sfx-dragon-roar', url: 'assets/audio/sfx-dragon-roar.wav' },
  { key: 'sfx-shield-explode', url: 'assets/audio/sfx-shield-explode.wav' },
  { key: 'sfx-fanfare', url: 'assets/audio/sfx-fanfare.wav' },
  { key: 'sfx-ui-click', url: 'assets/audio/sfx-ui-click.wav' },
  { key: 'sfx-gate-open', url: 'assets/audio/sfx-gate-open.wav' },
];
