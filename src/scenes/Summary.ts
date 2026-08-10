/**
 * Podsumowanie poziomu: gwiazdki (ukończenie / komplet kryształów / bez strat),
 * liczniki nabijane od zera, WIN_MESSAGES; zapis postępu przez core/save.ts.
 * DALEJ → mapa świata (aneks 4.3); po 1-3 i 2-3 najpierw scenka przejścia,
 * po BOSS finał → tabela wyników. BOSS odblokowuje się dopiero po 3-3
 * + komplet 5 smoków (aneks 4.2).
 */
import Phaser from 'phaser';
import { loadSave, localStorageAdapter, SaveData, writeSave } from '../core/save';
import { LEVEL_ORDER, DRAGONS, DragonId } from '../data/levels';
import { WIN_MESSAGES } from '../data/texts';
import { speakText } from '../ui/speak';
import { addSkyBackdrop, Backdrop, COL, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark } from '../dev';

export interface SummaryData {
  levelId: string;
  score: number;
  time: number;
  stars: number;
  crystals: number;
  crystalTotal: number;
  diamonds: number;
  arrows: number;
  hasCake: boolean;
  diamondsTotal: number;
  dragonDefeated: boolean;
  dragonId: DragonId | null;
}

export class SummaryScene extends Phaser.Scene {
  private data_!: SummaryData;
  private backdrop!: Backdrop;

  constructor() {
    super('Summary');
  }

  init(data: SummaryData) {
    this.data_ = data;
  }

  create() {
    const d = this.data_;
    this.backdrop = addSkyBackdrop(this);
    this.saveProgress(d);

    this.add.nineslice(320, 196, 'ui-panel-brown', undefined, 380, 252, 6, 6, 6, 6);
    this.add.text(320, 42, `POZIOM ${d.levelId} ZALICZONY!`, {
      fontFamily: FONT_TITLE, fontSize: '16px', color: COL.gold,
      stroke: COL.goldDark, strokeThickness: 4,
    }).setOrigin(0.5);

    // gwiazdki wpadają kolejno
    for (let i = 0; i < 3; i++) {
      const star = this.add.image(320 + (i - 1) * 44, 104, 'ui-star')
        .setScale(0).setTint(i < d.stars ? 0xffd23f : 0x333044);
      this.tweens.add({
        targets: star, scale: i < d.stars ? 2 : 1.5, angle: 360,
        delay: 300 + i * 380, duration: 420, ease: 'Back.out',
      });
    }

    // liczniki nabijają się od zera przez ~1 s
    const rows: Array<{ label: string; value: number; suffix?: string; color: string }> = [
      { label: 'KRYSZTAŁY', value: d.crystals, suffix: `/${d.crystalTotal}`, color: COL.cyan },
      { label: 'DIAMENTY', value: d.diamonds, color: COL.white },
      { label: 'WYNIK', value: d.score, color: COL.gold },
    ];
    let y = 152;
    for (const row of rows) {
      this.add.text(228, y, row.label, {
        fontFamily: FONT_UI, fontSize: '15px', color: COL.dim,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0, 0.5);
      const val = this.add.text(412, y, '0', {
        fontFamily: FONT_TITLE, fontSize: '13px', color: row.color,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(1, 0.5);
      const counter = { v: 0 };
      this.tweens.add({
        targets: counter, v: row.value, duration: 900, delay: 400, ease: 'Sine.out',
        onUpdate: () => val.setText(`${Math.round(counter.v)}${row.suffix ?? ''}`),
      });
      y += 30;
    }

    if (d.dragonDefeated && d.dragonId) {
      const name = DRAGONS[d.dragonId].name;
      const port = this.add.sprite(238, 252, `dragon-${d.dragonId.toLowerCase()}`, 9)
        .setScale(0.7);
      this.tweens.add({ targets: port, scale: 0.8, duration: 500, yoyo: true, repeat: -1 });
      this.add.text(268, 252, `${name} dołącza do Eskadry!`, {
        fontFamily: FONT_UI, fontSize: '15px', color: COL.gold,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0, 0.5);
    } else {
      const msg = WIN_MESSAGES[1 + Math.floor(Math.random() * (WIN_MESSAGES.length - 1))];
      speakText(this, msg);
      this.add.text(320, 252, msg, {
        fontFamily: FONT_UI, fontSize: '15px', color: COL.gold,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5);
    }

    const prompt = this.add.text(320, 296, '► [SPACJA] dalej ◄', {
      fontFamily: FONT_UI, fontSize: '15px', color: COL.cyan,
      stroke: COL.ink, strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });

    const go = () => {
      this.sound.stopByKey('music-victory');
      this.routeNext(d.levelId);
    };
    this.input.keyboard!.once('keydown-SPACE', go);
    this.input.keyboard!.once('keydown-ENTER', go);
    this.input.once('pointerdown', go);
    devMark({ scene: 'Summary', level: d.levelId, stars: d.stars });
  }

  /**
   * DALEJ (aneks 4.3): zawsze przez mapę świata; po 1-3/2-3 najpierw
   * scenka przejściowa (raz), po BOSS finał → Victory (feta + wpis imienia)
   * → tabela wyników.
   */
  private routeNext(levelId: string): void {
    if (levelId === 'BOSS') {
      this.scene.start('Interlude', { id: 'finale', next: 'Victory' });
      return;
    }
    const interludeId = levelId === '1-3' ? 'after-1-3'
      : levelId === '2-3' ? 'after-2-3' : null;
    if (interludeId) {
      const st = localStorageAdapter();
      const seen = st ? loadSave(st).interludes_seen.includes(interludeId) : false;
      if (!seen) {
        this.scene.start('Interlude', { id: interludeId, next: 'WorldMap' });
        return;
      }
    }
    this.scene.start('WorldMap');
  }

  /** aneks 4.2: BOSS wymaga ukończonego 3-3 ORAZ 5 pokonanych smoków */
  private bossUnlockable(save: SaveData): boolean {
    const dragonLevels = ['1-2', '1-3', '2-2', '2-3', '3-2'];
    return save.levels['3-3']?.completed === true
      && dragonLevels.every((l) => save.dragons_defeated.includes(l));
  }

  private saveProgress(d: SummaryData): void {
    const st = localStorageAdapter();
    if (!st) return;
    const save = loadSave(st);
    const idx = LEVEL_ORDER.indexOf(d.levelId as typeof LEVEL_ORDER[number]);
    const next = idx >= 0 && idx + 1 < LEVEL_ORDER.length ? LEVEL_ORDER[idx + 1] : null;
    if (next && next !== 'BOSS' && !save.unlocked.includes(next)) save.unlocked.push(next);
    const prev = save.levels[d.levelId];
    save.levels[d.levelId] = {
      completed: true,
      best_score: Math.max(prev?.best_score ?? 0, d.score),
      best_time: prev?.best_time && prev.best_time > 0
        ? Math.min(prev.best_time, d.time) : d.time,
      stars: Math.max(prev?.stars ?? 0, d.stars),
    };
    if (d.dragonDefeated && !save.dragons_defeated.includes(d.levelId)) {
      save.dragons_defeated.push(d.levelId);
    }
    // BOSS: warunek z aneksu 4.2 sprawdzany po KAŻDYM ukończeniu (także
    // powtórce poziomu ze smokiem, który wcześniej uciekł)
    if (this.bossUnlockable(save) && !save.unlocked.includes('BOSS')) {
      save.unlocked.push('BOSS');
    }
    // bank plecaka (aneks 8.5)
    save.total_diamonds = d.diamondsTotal;
    save.arrows = d.arrows;
    save.has_cake = d.hasCake;
    save.campaign_score += d.score;
    writeSave(st, save);
  }

  update(_t: number, delta: number) {
    this.backdrop.update(delta);
  }
}
