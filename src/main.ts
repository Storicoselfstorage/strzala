import Phaser from 'phaser';
import { BootScene } from './scenes/Boot';
import { PreloadScene } from './scenes/Preload';
import { SplashScene } from './scenes/Splash';
import { MenuScene } from './scenes/Menu';
import { CharSelectScene } from './scenes/CharSelect';
import { DiffSelectScene } from './scenes/DiffSelect';
import { WorldMapScene } from './scenes/WorldMap';
import { InterludeScene } from './scenes/Interlude';
import { LevelScene } from './scenes/Level';
import { HUDScene } from './scenes/HUD';
import { PauseScene } from './scenes/Pause';
import { SummaryScene } from './scenes/Summary';
import { ScoresScene } from './scenes/Scores';
import { CreditsScene } from './scenes/Credits';
import { TouchControlsScene } from './ui/TouchControls';

export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0b14',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 640 },
      debug: false,
    },
  },
  scene: [
    BootScene, PreloadScene, SplashScene, MenuScene,
    CharSelectScene, DiffSelectScene, WorldMapScene, InterludeScene,
    LevelScene, HUDScene, PauseScene, SummaryScene,
    ScoresScene, CreditsScene, TouchControlsScene,
  ],
});
