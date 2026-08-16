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
import { VictoryScene } from './scenes/Victory';
import { ScoresScene } from './scenes/Scores';
import { CreditsScene } from './scenes/Credits';
import { TouchControlsScene } from './ui/TouchControls';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, RENDER_SCALE } from './ui/hiRes';

// rozmiar LOGICZNY gry — wszystkie współrzędne scen/logiki zostają w 640×360
export const GAME_WIDTH = LOGICAL_WIDTH;
export const GAME_HEIGHT = LOGICAL_HEIGHT;

// Ostrzejsze czcionki: domyślna rozdzielczość rasteryzacji Text = RENDER_SCALE
// (wewnętrzny canvas tekstu ×2, kamera z zoomem ×2 pokazuje go 1:1).
// Phaser 4 nie ma globalnego configu na to, stąd nakładka na fabrykę add.text;
// jawne style.resolution w wywołaniu nadal wygrywa.
const textFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return textFactory.call(this, x, y, text, { resolution: RENDER_SCALE, ...style });
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // bufor renderowania ×RENDER_SCALE (1280×720) — kadr logiczny wciąż 640×360,
  // kamery scen dostają zoom ×RENDER_SCALE (patrz ui/hiRes.ts)
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  backgroundColor: '#0b0b14',
  // pixelArt (nearest), NIE smoothPixelArt — porównanie zrzutów hires-b vs
  // hires-c: smoothPixelArt zmiękcza krawędzie WSZYSTKICH pikseli sprite'ów
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
    VictoryScene, ScoresScene, CreditsScene, TouchControlsScene,
  ],
});

// uchwyt diagnostyczny dla e2e — tylko dev, build produkcyjny go nie zawiera
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}
