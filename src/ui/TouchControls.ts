/**
 * TouchControls — nakładka dotykowa (PRD 7), osobna scena-overlay uruchamiana
 * raz (z Menu) i żyjąca przez całą sesję. Pokazuje pady tylko, gdy scena
 * 'Level' jest aktywna i wykryto dotyk. NIE dotyka Level/Player.
 *
 * ── KONTRAKT TOUCH-REGISTRY (this.game.registry, zero importów między
 *    Level a TouchControls; integrację w Level robi koordynator) ──────────
 *
 * TouchControls → Level:
 *   'touch.active'        boolean  nakładka widoczna (gracz gra dotykiem)
 *   'touch.left'          boolean  pad ← trzymany
 *   'touch.right'         boolean  pad → trzymany
 *   'touch.down'          boolean  przycisk ŚLIZG trzymany (tylko runner)
 *   'touch.jumpPressed'   number   licznik naciśnięć SKOK
 *   'touch.shootPressed'  number   licznik naciśnięć STRZAŁ
 *   'touch.magicPressed'  number   licznik naciśnięć MAGIA
 *   'touch.usePressed'    number   licznik naciśnięć E (placek/kryjówka)
 *   Liczniki służą do edge-detection: Level pamięta ostatnio widzianą
 *   wartość; wzrost licznika = jedno świeże naciśnięcie (odpowiednik
 *   JustDown — odporne na kolejność update'ów scen i multi-touch).
 *
 * Level → TouchControls:
 *   'touch.runnerMode'    boolean  faza RUNNER → pokaż przycisk ŚLIZG
 *   'touch.ctxUse'        boolean  gracz przy placku/kryjówce → pokaż E
 *
 * Auto-detekcja (PRD 7): pierwszy pointerdown → pokaż pady; pierwszy
 * keydown → schowaj. Multi-touch: input.addPointer(3) (ruch + skok naraz).
 * Strefy dotyku ≥ 64 px CSS — rozmiar przeliczany przez skalę FIT
 * (64 / (displayWidth / 640) w pikselach gry, aktualizowany przy resize).
 */
import Phaser from 'phaser';
import { COL, COLN, FONT_TITLE, FONT_UI } from '../ui/theme';
import { devMark } from '../dev';

type HeldId = 'left' | 'right' | 'down';
type EdgeId = 'jump' | 'shoot' | 'magic' | 'use';

interface ButtonView {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  zone: Phaser.GameObjects.Zone;
  extras: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Text>;
  /** widoczność kontekstowa (ŚLIZG w runnerze, E przy placku) */
  contextual: boolean;
  shown: boolean;
}

const EDGE_KEYS: Record<EdgeId, string> = {
  jump: 'touch.jumpPressed',
  shoot: 'touch.shootPressed',
  magic: 'touch.magicPressed',
  use: 'touch.usePressed',
};

export class TouchControlsScene extends Phaser.Scene {
  private touchWanted = false;
  private overlayShown = false;
  private held: Record<HeldId, ButtonView> = {} as Record<HeldId, ButtonView>;
  private edge: Record<EdgeId, ButtonView> = {} as Record<EdgeId, ButtonView>;
  private zoneHalf = 32;

  constructor() {
    super('TouchControls');
  }

  create() {
    // multi-touch: ruch + skok + strzał jednocześnie
    this.input.addPointer(3);

    const reg = this.game.registry;
    reg.set('touch.active', false);
    reg.set('touch.left', false);
    reg.set('touch.right', false);
    reg.set('touch.down', false);
    for (const key of Object.values(EDGE_KEYS)) {
      if (typeof reg.get(key) !== 'number') reg.set(key, 0);
    }
    if (typeof reg.get('touch.runnerMode') !== 'boolean') reg.set('touch.runnerMode', false);
    if (typeof reg.get('touch.ctxUse') !== 'boolean') reg.set('touch.ctxUse', false);

    // lewy dół: pad ← / → (+ ŚLIZG kontekstowo w runnerze)
    this.held.left = this.button(44, 314, { arrowFrame: 3 });
    this.held.right = this.button(116, 314, { arrowFrame: 1 });
    this.held.down = this.button(80, 254, { arrowFrame: 2, label: 'ŚLIZG', contextual: true });
    // prawy dół: SKOK / STRZAŁ / MAGIA (+ kontekstowy E)
    this.edge.jump = this.button(594, 310, { arrowFrame: 0, label: 'SKOK' });
    this.edge.shoot = this.button(532, 322, { icon: 'arrow', label: 'STRZAŁ' });
    this.edge.magic = this.button(556, 260, { icon: 'arrow-magic', iconTint: COLN.cyan, label: 'MAGIA' });
    this.edge.use = this.button(470, 310, { letter: 'E', label: 'UŻYJ', contextual: true });

    for (const id of Object.keys(this.edge) as EdgeId[]) {
      const b = this.edge[id];
      b.zone.on('pointerdown', () => {
        if (!this.overlayShown || !b.shown) return;
        this.game.registry.inc(EDGE_KEYS[id], 1);
        this.press(b, true);
        this.time.delayedCall(140, () => this.press(b, false));
      });
    }

    // auto-detekcja trybu sterowania (PRD 7)
    this.input.on('pointerdown', () => {
      this.touchWanted = true;
    });
    this.input.keyboard?.on('keydown', () => {
      this.touchWanted = false;
    });

    // strefy ≥ 64 px CSS — przelicznik przez skalę FIT
    this.scale.on('resize', () => this.resizeZones());
    this.resizeZones();
    this.applyVisibility(false);
    devMark({ touchVisible: false });
  }

  private button(x: number, y: number, opts: {
    arrowFrame?: number;
    icon?: string;
    iconTint?: number;
    letter?: string;
    label?: string;
    contextual?: boolean;
  }): ButtonView {
    const img = this.add.image(x, y, 'ui-button-round').setScale(1.6).setAlpha(0.55).setDepth(10);
    const extras: ButtonView['extras'] = [];
    if (opts.arrowFrame !== undefined) {
      extras.push(this.add.image(x, y - 1, 'ui-arrows', opts.arrowFrame)
        .setScale(1.4).setAlpha(0.9).setDepth(11));
    }
    if (opts.icon) {
      const ic = this.add.image(x, y - 1, opts.icon).setRotation(-Math.PI / 4)
        .setScale(1.8).setAlpha(0.95).setDepth(11);
      if (opts.iconTint !== undefined) ic.setTint(opts.iconTint);
      extras.push(ic);
    }
    if (opts.letter) {
      extras.push(this.add.text(x, y - 1, opts.letter, {
        fontFamily: FONT_TITLE, fontSize: '14px', color: COL.ink,
      }).setOrigin(0.5).setAlpha(0.9).setDepth(11));
    }
    if (opts.label) {
      extras.push(this.add.text(x, y + 25, opts.label, {
        fontFamily: FONT_UI, fontSize: '11px', color: COL.white,
        stroke: COL.ink, strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0.8).setDepth(11));
    }
    const zone = this.add.zone(x, y, 64, 64).setInteractive();
    // shown=true, bo obiekty rodzą się widoczne — pierwsze applyVisibility(false)
    // musi je realnie schować (setButtonShown ma early-return na shown)
    return { x, y, img, zone, extras, contextual: opts.contextual === true, shown: true };
  }

  private allButtons(): ButtonView[] {
    return [...Object.values(this.held), ...Object.values(this.edge)];
  }

  /** strefa dotyku w px gry: co najmniej 64 px CSS po przeliczeniu skali FIT */
  private resizeZones(): void {
    const scale = Math.max(0.001, this.scale.displaySize.width / this.scale.gameSize.width);
    const size = Math.max(48, Math.ceil(64 / scale) + 8);
    this.zoneHalf = size / 2;
    for (const b of this.allButtons()) {
      b.zone.setSize(size, size);
      const area = b.zone.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      if (area) area.setSize(size, size);
    }
  }

  private press(b: ButtonView, down: boolean): void {
    b.img.setTexture(down ? 'ui-button-round-pressed' : 'ui-button-round');
    b.img.setAlpha(down ? 0.9 : 0.55);
  }

  private setButtonShown(b: ButtonView, shown: boolean): void {
    if (b.shown === shown) return;
    b.shown = shown;
    b.img.setVisible(shown);
    b.zone.setVisible(shown);
    if (b.zone.input) b.zone.input.enabled = shown;
    for (const e of b.extras) e.setVisible(shown);
    if (!shown) this.press(b, false);
  }

  private applyVisibility(show: boolean): void {
    this.overlayShown = show;
    const reg = this.game.registry;
    reg.set('touch.active', show);
    const runner = reg.get('touch.runnerMode') === true;
    const ctxUse = reg.get('touch.ctxUse') === true;
    this.setButtonShown(this.held.left, show);
    this.setButtonShown(this.held.right, show);
    this.setButtonShown(this.held.down, show && runner);
    this.setButtonShown(this.edge.jump, show);
    this.setButtonShown(this.edge.shoot, show);
    this.setButtonShown(this.edge.magic, show);
    this.setButtonShown(this.edge.use, show && ctxUse);
    if (!show) {
      reg.set('touch.left', false);
      reg.set('touch.right', false);
      reg.set('touch.down', false);
    }
  }

  update() {
    const levelActive = this.scene.isActive('Level');
    const show = this.touchWanted && levelActive;
    if (show !== this.overlayShown) {
      this.applyVisibility(show);
      if (show) this.scene.bringToTop();
      devMark({ touchVisible: show });
    } else if (show) {
      // kontekstowe przyciski mogą się zmieniać w trakcie gry
      this.setButtonShown(this.held.down, this.game.registry.get('touch.runnerMode') === true);
      this.setButtonShown(this.edge.use, this.game.registry.get('touch.ctxUse') === true);
    }
    if (!show) return;

    // przyciski trzymane: skan wszystkich aktywnych pointerów (multi-touch,
    // działa też przy zsunięciu palca z przycisku)
    const reg = this.game.registry;
    for (const id of Object.keys(this.held) as HeldId[]) {
      const b = this.held[id];
      if (!b.shown) {
        if (reg.get(`touch.${id}`) !== false) reg.set(`touch.${id}`, false);
        continue;
      }
      let hit = false;
      for (const p of this.input.manager.pointers) {
        if (!p.isDown) continue;
        if (Math.abs(p.x - b.x) <= this.zoneHalf && Math.abs(p.y - b.y) <= this.zoneHalf) {
          hit = true;
          break;
        }
      }
      if (reg.get(`touch.${id}`) !== hit) reg.set(`touch.${id}`, hit);
      const pressedNow = b.img.texture.key === 'ui-button-round-pressed';
      if (pressedNow !== hit) this.press(b, hit);
    }
  }
}
