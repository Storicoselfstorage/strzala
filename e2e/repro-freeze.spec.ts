import { test, expect, Page } from '@playwright/test';

// Regresja zgłoszona przez graczy (08.08.2026): po ukończeniu 1-1 wejście
// w 1-2 z mapy świata wieszało grę. Kluczowa różnica vs dotychczasowe e2e:
// DRUGI start sceny Level w tej samej sesji (restart po shutdownie).

declare global {
  interface Window {
    __strzala?: { scene?: string; level?: string };
  }
}

const SEED = {
  version: 2,
  character: 'TOSIA',
  difficulty: 'NORMALNY',
  unlocked: ['1-1', '1-2'],
  levels: { '1-1': { completed: true, best_score: 310, best_time: 95, stars: 2 } },
  interludes_seen: ['intro'],
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  return errors;
}

async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
}

async function waitScene(page: Page, scene: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction((s) => window.__strzala?.scene === s, scene, { timeout });
}

async function seededIntoWorldMap(page: Page): Promise<void> {
  await page.addInitScript((seed) => {
    localStorage.setItem('strzala2.save', JSON.stringify(seed));
  }, SEED);
  await page.goto('./');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitScene(page, 'Splash', 30_000);
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await waitScene(page, 'Menu');
  await page.keyboard.press('Space');
  await waitScene(page, 'WorldMap');
  await page.waitForTimeout(400);
}

/** SPACJA na mapie; jak selekcja nie stoi na węźle grywalnym — spróbuj strzałek */
async function startFromWorldMap(page: Page, level: string): Promise<void> {
  for (const moves of [0, 1, -1, 2]) {
    for (let i = 0; i < Math.abs(moves); i++) {
      await tap(page, moves > 0 ? 'ArrowRight' : 'ArrowLeft');
      await page.waitForTimeout(150);
    }
    await tap(page, 'Space');
    await page.waitForTimeout(1500);
    const m = await Promise.race([
      page.evaluate(() => window.__strzala),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('MAIN THREAD ZAWIESZONY po SPACJI na mapie')), 4000)),
    ]);
    if (m?.scene === 'Level' && m.level === level) return;
    if (m?.scene === 'Level') throw new Error(`wystartował ${m.level}, oczekiwano ${level}`);
  }
  throw new Error(`nie udało się wystartować ${level} z mapy świata`);
}

async function assertAlive(page: Page): Promise<void> {
  const s1 = await page.locator('#game canvas').screenshot();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  const s2 = await page.locator('#game canvas').screenshot();
  expect(Buffer.compare(s1, s2), 'canvas ma się animować (gra żyje)').not.toBe(0);
}

test('sonda B: mapa świata → 1-2 (zapis po ukończonym 1-1)', async ({ page }) => {
  const errors = collectErrors(page);
  await seededIntoWorldMap(page);
  await startFromWorldMap(page, '1-2');
  await assertAlive(page);
  expect(errors).toEqual([]);
});

test('sonda C: 1-1 → pauza → menu → mapa → 1-2 (drugi start Level)', async ({ page }) => {
  const errors = collectErrors(page);
  await seededIntoWorldMap(page);

  // pierwszy start Level (1-1): selekcja może stać na 1-2 — celuj w 1-1
  for (const moves of [-1, 0, 1]) {
    for (let i = 0; i < Math.abs(moves); i++) {
      await tap(page, moves > 0 ? 'ArrowRight' : 'ArrowLeft');
      await page.waitForTimeout(150);
    }
    await tap(page, 'Space');
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => window.__strzala);
    if (m?.scene === 'Level') break;
  }
  let m = await page.evaluate(() => window.__strzala);
  expect(m?.scene).toBe('Level');

  // chwila gry, potem pauza → MENU (WZNÓW/OD NOWA/MENU — 2× w dół)
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');
  await tap(page, 'P');
  await page.waitForTimeout(400);
  await tap(page, 'ArrowDown');
  await tap(page, 'ArrowDown');
  await tap(page, 'Space');
  await waitScene(page, 'Menu', 10_000);

  // GRAJ → mapa → 1-2 (drugi start sceny Level w tej sesji)
  await page.keyboard.press('Space');
  await waitScene(page, 'WorldMap');
  await page.waitForTimeout(400);
  await startFromWorldMap(page, '1-2');

  // diagnostyka stanu silnika (zrzut przed asercją żywotności)
  const diag = await page.evaluate(() => {
    const g = (window as unknown as { __game?: any }).__game;
    if (!g) return { err: 'brak __game' };
    const scenes = g.scene.scenes.map((s: any) => ({
      key: s.sys.settings.key,
      status: s.sys.settings.status,
      active: s.sys.settings.active,
      visible: s.sys.settings.visible,
    })).filter((s: any) => s.status > 0);
    const lvl = g.scene.getScene('Level');
    return {
      fps: Math.round(g.loop.actualFps),
      animsPaused: g.anims.paused,
      scenes,
      level: lvl ? {
        physicsPaused: lvl.physics?.world?.isPaused,
        timePaused: lvl.time?.paused,
        timeScaleTweens: lvl.tweens?.timeScale,
        timeScaleTime: lvl.time?.timeScale,
        sysPaused: lvl.sys.isPaused(),
      } : null,
    };
  });
  console.log('DIAG:', JSON.stringify(diag, null, 1));
  console.log('BŁĘDY KONSOLI:', JSON.stringify(errors));
  await page.screenshot({ path: 'e2e/screenshots/repro-c-state.png' });

  await assertAlive(page);
  m = await page.evaluate(() => window.__strzala);
  expect(m?.level).toBe('1-2');
  expect(errors).toEqual([]);
});
