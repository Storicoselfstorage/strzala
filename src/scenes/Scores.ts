/**
 * WYNIKI — tabela top 5 z save.highscores (aneks 9.4: IMIĘ ♦ wynik ★ gwiazdki).
 * Puste sloty jako kreski, zero wpisów = elegancki pusty stan.
 * Wejście z Victory: `highlight` = świeży wpis → wiersz miga 3 s (nowy rekord).
 * Powrót: ESC / SPACJA / tap.
 */
import Phaser from 'phaser';
import { HighscoreEntry, loadSave, localStorageAdapter } from '../core/save';
import { addSkyBackdrop, Backdrop, COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark } from '../dev';

export interface ScoresData {
  /** świeży wpis z Victory — do podświetlenia (aneks 9.4: miga 3 s) */
  highlight?: { name: string; score: number };
}

export class ScoresScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private highlight: ScoresData['highlight'] | null = null;

  constructor() {
    super('Scores');
  }

  init(data: ScoresData) {
    this.highlight = data?.highlight ?? null;
  }

  create() {
    this.backdrop = addSkyBackdrop(this);
    const save = loadSave(
      localStorageAdapter() ?? { getItem: () => null, setItem: () => undefined },
    );

    this.add.text(320, 40, 'WYNIKI', {
      fontFamily: FONT_TITLE, fontSize: '20px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.nineslice(320, 192, 'ui-panel', undefined, 432, 236, 6, 6, 6, 6);

    const top: HighscoreEntry[] = [...save.highscores]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (top.length === 0) {
      // pusty stan
      this.add.image(320, 152, 'ui-star').setScale(2).setAlpha(0.85);
      this.add.text(320, 192, 'Tabela czeka na pierwszą łowczynię.', {
        fontFamily: FONT_UI, fontSize: '17px', color: COL.ink,
      }).setOrigin(0.5);
      this.add.text(320, 218, 'Ukończ kampanię i wpisz swoje imię!', {
        fontFamily: FONT_UI, fontSize: '13px', color: COL.ink,
      }).setOrigin(0.5).setAlpha(0.7);
    } else {
      // nagłówek kolumn
      this.add.text(150, 104, 'IMIĘ', {
        fontFamily: FONT_UI, fontSize: '13px', color: COL.ink,
      }).setOrigin(0, 0.5).setAlpha(0.7);
      this.add.text(440, 104, 'WYNIK', {
        fontFamily: FONT_UI, fontSize: '13px', color: COL.ink,
      }).setOrigin(1, 0.5).setAlpha(0.7);
      this.add.text(500, 104, '★', {
        fontFamily: FONT_UI, fontSize: '13px', color: COL.ink,
      }).setOrigin(1, 0.5).setAlpha(0.7);

      let highlighted = -1;
      for (let i = 0; i < 5; i++) {
        const y = 134 + i * 32;
        const entry = top[i];
        this.add.text(126, y, `${i + 1}.`, {
          fontFamily: FONT_TITLE, fontSize: '12px',
          color: i === 0 ? COL.gold : COL.ink,
          stroke: i === 0 ? COL.ink : undefined, strokeThickness: i === 0 ? 3 : 0,
        }).setOrigin(0, 0.5);
        if (entry) {
          // świeży wpis z Victory: pas podświetlenia POD tekstem + miganie 3 s
          const isNew = highlighted < 0 && !!this.highlight
            && entry.name === this.highlight.name
            && entry.score === this.highlight.score;
          const band = isNew
            ? this.add.rectangle(320, y, 400, 26, COLN.gold, 0.25) : null;
          const row = [
            this.add.text(150, y, entry.name, {
              fontFamily: FONT_UI, fontSize: '17px', color: COL.ink,
            }).setOrigin(0, 0.5),
            this.add.text(440, y, String(entry.score), {
              fontFamily: FONT_TITLE, fontSize: '12px', color: COL.goldDark,
            }).setOrigin(1, 0.5),
            this.add.text(500, y, `★${entry.stars}`, {
              fontFamily: FONT_UI, fontSize: '15px', color: COL.goldDark,
            }).setOrigin(1, 0.5),
          ];
          if (band) {
            highlighted = i;
            this.tweens.add({
              targets: [band, ...row], alpha: 0.25, duration: 250,
              yoyo: true, repeat: 5,
            });
          }
        } else {
          this.add.text(150, y, '— — —', {
            fontFamily: FONT_UI, fontSize: '15px', color: COL.ink,
          }).setOrigin(0, 0.5).setAlpha(0.4);
        }
      }
      if (highlighted >= 0) {
        const banner = this.add.text(320, 64, '★ NOWY WPIS W TABELI! ★', {
          fontFamily: FONT_TITLE, fontSize: '12px', color: COL.gold,
          stroke: COL.ink, strokeThickness: 4,
        }).setOrigin(0.5);
        this.tweens.add({
          targets: banner, alpha: 0.4, duration: 350, yoyo: true, repeat: -1,
        });
        devMark({ newRecordRow: highlighted });
      }
    }

    if (save.campaign_score > 0) {
      this.add.text(320, 322, `Wynik bieżącej kampanii: ${save.campaign_score}`, {
        fontFamily: FONT_UI, fontSize: '13px', color: COL.white,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5);
    }

    const hint = this.add.text(320, 344, '[ESC] powrót', {
      fontFamily: FONT_UI, fontSize: '12px', color: COL.dim,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });

    const back = () => {
      this.sound.play('sfx-ui-click', { volume: 0.4 });
      this.scene.start('Menu');
    };
    const kb = this.input.keyboard!;
    kb.once('keydown-ESC', back);
    kb.once('keydown-SPACE', back);
    kb.once('keydown-ENTER', back);
    this.input.once('pointerdown', back);
    devMark({ scene: 'Scores', entries: top.length });
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
