import Phaser from 'phaser';

// Tymczasowa scena scaffoldu — zastąpi ją łańcuch Boot → Preload → Splash (F0).
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'STRZA/ŁA', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#ffd23f',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 40, 'scaffold OK', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#8888aa',
      })
      .setOrigin(0.5);
  }
}
