import Phaser from 'phaser';
import { devMark } from '../dev';

export class SplashScene extends Phaser.Scene {
  private layers: Array<{ sprite: Phaser.GameObjects.TileSprite; speed: number }> = [];

  constructor() {
    super('Splash');
  }

  create() {
    const { width, height } = this.scale;
    this.layers = [];

    // Niebo rozciągnięte na cały ekran; chmury dokowane do dołu (duże z tyłu).
    const sky = this.add.tileSprite(0, 0, width, 128, 'world1-sky').setOrigin(0, 0);
    sky.setScale(1, height / 128);
    const cloudsBig = this.add
      .tileSprite(0, height - 101, width, 101, 'world1-clouds-big')
      .setOrigin(0, 0);
    const cloudsSmall = this.add
      .tileSprite(0, height - 101 - 40, width, 48, 'world1-clouds-small')
      .setOrigin(0, 0);
    this.layers.push({ sprite: cloudsBig, speed: 4 }, { sprite: cloudsSmall, speed: 9 });

    this.add
      .text(width / 2, height * 0.32, 'STRZA/ŁA', {
        fontFamily: '"Press Start 2P"',
        fontSize: '40px',
        color: '#ffd23f',
        stroke: '#3a2504',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.32 + 36, 'Łowczynie Smoków', {
        fontFamily: '"Pixelify Sans"',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#22223a',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(width / 2, height * 0.6, 'Dotknij, by zacząć', {
        fontFamily: '"Pixelify Sans"',
        fontSize: '16px',
        color: '#8ef6ff',
        stroke: '#22223a',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: prompt,
      alpha: 0.25,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Pierwszy gest odblokowuje audio (iOS/Safari) — dopiero wtedy startuje muzyka.
    const begin = () => {
      if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
        this.sound.context.resume().catch(() => undefined);
      }
      if (this.cache.audio.exists('music-menu') && !this.sound.get('music-menu')) {
        this.sound.play('music-menu', { loop: true, volume: 0.6 });
      }
      this.scene.start('Menu');
    };
    this.input.once('pointerdown', begin);
    this.input.keyboard?.once('keydown', begin);
    devMark({ scene: 'Splash' });
  }

  update(_time: number, delta: number) {
    for (const layer of this.layers) {
      layer.sprite.tilePositionX += (layer.speed * delta) / 1000;
    }
  }
}
