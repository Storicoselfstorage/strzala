import Phaser from 'phaser';
import { applyHiRes } from '../ui/hiRes';

// Najpierw fonty (teksty w Preload/Splash muszą się rysować już pixelową czcionką).
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    applyHiRes(this);
    const fonts = [
      document.fonts.load('16px "Press Start 2P"'),
      document.fonts.load('16px "Pixelify Sans"'),
    ];
    Promise.all(fonts)
      .catch(() => undefined)
      .then(() => this.scene.start('Preload'));
  }
}
