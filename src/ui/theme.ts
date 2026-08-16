/**
 * Wspólna oprawa UI: fonty, kolory, panele Kenney (9-slice), tło z parallaxem.
 * Jedno miejsce na spójną paletę (checklista B1: paleta spójna).
 */
import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from './hiRes';

export const FONT_TITLE = '"Press Start 2P"';
export const FONT_UI = '"Pixelify Sans"';

export const COL = {
  gold: '#ffd23f',
  goldDark: '#3a2504',
  cyan: '#35e6ff',
  white: '#ffffff',
  ink: '#22223a',
  dim: '#9a93b8',
  danger: '#ff5a5a',
  pink: '#ff8ac9',
  purple: '#c26bff',
} as const;

export const COLN = {
  gold: 0xffd23f,
  cyan: 0x35e6ff,
  white: 0xffffff,
  danger: 0xff5a5a,
  purple: 0xc26bff,
  dust: 0xd8c090,
  night: 0x0b0b14,
} as const;

export function titleText(
  scene: Phaser.Scene, x: number, y: number, str: string, size = 24,
  color: string = COL.gold,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT_TITLE,
      fontSize: `${size}px`,
      color,
      stroke: COL.goldDark,
      strokeThickness: Math.max(3, Math.round(size / 6)),
    })
    .setOrigin(0.5);
}

export function uiText(
  scene: Phaser.Scene, x: number, y: number, str: string, size = 13,
  color: string = COL.white,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT_UI,
      fontSize: `${size}px`,
      color,
      stroke: COL.ink,
      strokeThickness: 3,
    })
    .setOrigin(0.5);
}

/** panel Kenney (9-slice); brown = ciemniejszy wariant */
export function panel(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, brown = false,
): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(
    x, y, brown ? 'ui-panel-brown' : 'ui-panel', undefined, w, h, 6, 6, 6, 6,
  );
}

export interface Backdrop {
  update(delta: number): void;
}

/** tło świata 1 (kompozycja jak Splash): niebo + dwie warstwy dryfujących chmur */
export function addSkyBackdrop(scene: Phaser.Scene): Backdrop {
  // wymiary LOGICZNE kadru — scene.scale to rozmiar bufora ×2 (hi-res)
  const width = LOGICAL_WIDTH;
  const height = LOGICAL_HEIGHT;
  const sky = scene.add.tileSprite(0, 0, width, height, 'world1-sky').setOrigin(0, 0);
  sky.tileScaleX = height / 128;
  sky.tileScaleY = height / 128;
  const big = scene.add
    .tileSprite(0, height - 101, width, 101, 'world1-clouds-big')
    .setOrigin(0, 0);
  const small = scene.add
    .tileSprite(0, height - 141, width, 48, 'world1-clouds-small')
    .setOrigin(0, 0);
  return {
    update(delta: number) {
      big.tilePositionX += (4 * delta) / 1000;
      small.tilePositionX += (9 * delta) / 1000;
    },
  };
}
