import Phaser from 'phaser';
import { IMAGES, SPRITESHEETS, AUDIO } from '../data/assetManifest';
import { ANIMS } from '../data/animations';
import { VOICE_FILES } from '../data/voiceFiles';
import { applyHiRes, LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../ui/hiRes';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    // kamera hi-res już tutaj — pasek postępu rysuje się przed create()
    applyHiRes(this);
    const width = LOGICAL_WIDTH;
    const height = LOGICAL_HEIGHT;
    const barW = 240;
    const barH = 12;

    this.add
      .text(width / 2, height / 2 - 28, 'STRZA/ŁA', {
        fontFamily: '"Press Start 2P"',
        fontSize: '24px',
        color: '#ffd23f',
      })
      .setOrigin(0.5);

    const frame = this.add.graphics();
    frame.lineStyle(1, 0x8888aa);
    frame.strokeRect(width / 2 - barW / 2, height / 2, barW, barH);
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => {
      bar.clear();
      bar.fillStyle(0xffd23f);
      bar.fillRect(width / 2 - barW / 2 + 2, height / 2 + 2, (barW - 4) * v, barH - 4);
    });

    for (const img of IMAGES) this.load.image(img.key, img.url);
    for (const sheet of SPRITESHEETS) {
      this.load.spritesheet(sheet.key, sheet.url, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
    for (const audio of AUDIO) this.load.audio(audio.key, audio.url);
    // lektor (Babcia Bożenka) — nagrania kwestii dialogowych
    for (const [id, file] of Object.entries(VOICE_FILES)) {
      this.load.audio(`voice:${id}`, `assets/audio/voice/${file}`);
    }
  }

  create() {
    for (const a of ANIMS) {
      this.anims.create({
        key: a.key,
        frames: this.anims.generateFrameNumbers(a.textureKey, {
          start: a.frames.start,
          end: a.frames.end,
        }),
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    }
    this.scene.start('Splash');
  }
}
