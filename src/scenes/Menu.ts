import Phaser from 'phaser';

// Menu główne — wersja robocza F0; pełna oprawa (panele Kenney, Autorzy,
// Wyczyść postęp) w F2/F6.
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height * 0.25, 'STRZA/ŁA', {
        fontFamily: '"Press Start 2P"',
        fontSize: '28px',
        color: '#ffd23f',
        stroke: '#3a2504',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const play = this.add
      .text(width / 2, height * 0.55, '▶ GRAJ', {
        fontFamily: '"Pixelify Sans"',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    play.on('pointerdown', () => this.startGame());
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
    this.input.keyboard?.once('keydown-ENTER', () => this.startGame());
  }

  private startGame() {
    this.scene.start('CharSelect');
  }
}
