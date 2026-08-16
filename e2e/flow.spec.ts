/**
 * Przepływ ekranów 2.0 (aneks 4.3) + sterowanie dotykowe (PRD 7).
 * Zrzuty do bramki wizualnej: worldmap, interlude-intro, scores, credits,
 * touch-overlay. Wszystkie testy z asercją zero błędów konsoli.
 */
import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'zrzuty B1: chromium');

interface Dev {
  scene?: string;
  phase?: string;
  interludeId?: string;
  line?: number;
  selected?: string;
  unlocked?: number;
  defeatedDragons?: number;
  touchVisible?: boolean;
  entries?: number;
}

declare global {
  interface Window { __strzala?: Dev }
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

async function waitScene(page: Page, scene: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction(
    (s) => window.__strzala?.scene === s,
    scene,
    { timeout },
  );
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/screenshots/${name}.png` });
}

/** Phaser 4 zlewa keydowny z tej samej klatki — klawisze menu z odstępem */
async function pressPaced(page: Page, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
}

async function skipInterlude(page: Page): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const scene = await page.evaluate(() => window.__strzala?.scene);
    if (scene !== 'Interlude') return;
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
  }
  throw new Error('Interlude nie zakończyło się w czasie');
}

/** ./ → splash → menu (SPACJA na splashu) */
async function intoMenu(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitScene(page, 'Splash', 30_000);
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await waitScene(page, 'Menu');
}

/** zapis rozgrzanej kampanii: 1-1 i 1-2 zrobione, Miraż pokonany */
const SEED_SAVE = {
  version: 2,
  character: 'TOSIA',
  difficulty: 'NORMALNY',
  skrzat: false,
  muted: true,
  unlocked: ['1-1', '1-2', '1-3'],
  levels: {
    '1-1': { completed: true, best_score: 940, best_time: 68, stars: 3 },
    '1-2': { completed: true, best_score: 1620, best_time: 141, stars: 2 },
  },
  dragons_defeated: ['1-2'],
  echo_lina: false,
  total_diamonds: 3,
  arrows: 12,
  has_cake: true,
  campaign_score: 2560,
  highscores: [
    { name: 'TOSIA', score: 4210, stars: 21 },
    { name: 'VEGA', score: 2870, stars: 14 },
  ],
  seen_tutorials: [],
  interludes_seen: ['intro'],
};

async function seedSave(page: Page): Promise<void> {
  await page.addInitScript((s) => {
    localStorage.setItem('strzala2.save', JSON.stringify(s));
  }, SEED_SAVE);
}

test('świeży profil: menu → intro → mapa świata → poziom 1-1', async ({ page }) => {
  const errors = collectErrors(page);
  await intoMenu(page);
  await page.keyboard.press('Space');            // GRAJ
  await waitScene(page, 'CharSelect');
  await page.keyboard.press('Space');
  await waitScene(page, 'DiffSelect');
  await page.keyboard.press('Space');

  // scenka intro (maszyna do pisania) — zrzut w trakcie pisania
  await waitScene(page, 'Interlude');
  expect(await page.evaluate(() => window.__strzala?.interludeId)).toBe('intro');
  await page.waitForTimeout(1000);
  await shot(page, 'interlude-intro');

  await skipInterlude(page);
  await waitScene(page, 'WorldMap');
  expect(await page.evaluate(() => window.__strzala?.selected)).toBe('1-1');

  await page.keyboard.press('Space');            // start wybranego węzła
  await waitScene(page, 'Level');
  await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');
  expect(errors).toEqual([]);
});

test('istniejący zapis: GRAJ → od razu mapa świata (węzły + Eskadra)', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await intoMenu(page);
  await page.keyboard.press('Space');            // GRAJ — bez wyboru bohaterki
  await waitScene(page, 'WorldMap');
  // wskazany pierwszy nieukończony węzeł; Miraż w Eskadrze pokonany
  expect(await page.evaluate(() => window.__strzala?.selected)).toBe('1-3');
  expect(await page.evaluate(() => window.__strzala?.defeatedDragons)).toBe(1);
  await page.waitForTimeout(900);
  await shot(page, 'worldmap');

  // powrót do menu działa
  await page.keyboard.press('Escape');
  await waitScene(page, 'Menu');
  expect(errors).toEqual([]);
});

test('WYNIKI: tabela top 5 z zapisu', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await intoMenu(page);
  await pressPaced(page, 'ArrowDown', 'ArrowDown', 'ArrowDown');   // WYNIKI (za NOWĄ GRĄ)
  await page.keyboard.press('Space');
  await waitScene(page, 'Scores');
  expect(await page.evaluate(() => window.__strzala?.entries)).toBe(2);
  await page.waitForTimeout(600);
  await shot(page, 'scores');
  await page.keyboard.press('Escape');
  await waitScene(page, 'Menu');
  expect(errors).toEqual([]);
});

test('AUTORZY: przewijana lista kredytów', async ({ page }) => {
  const errors = collectErrors(page);
  await intoMenu(page);
  await pressPaced(page, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown');   // AUTORZY
  await page.keyboard.press('Space');
  await waitScene(page, 'Credits');
  await page.waitForTimeout(700);
  await shot(page, 'credits');
  await page.keyboard.press('Escape');
  await waitScene(page, 'Menu');
  expect(errors).toEqual([]);
});

test.describe('dotyk (emulacja hasTouch)', () => {
  test.use({ hasTouch: true });

  test('pady pokazują się po dotyku w grze, znikają po klawiszu', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page);
    await intoMenu(page);
    await page.keyboard.press('Space');          // GRAJ → mapa świata
    await waitScene(page, 'WorldMap');
    await pressPaced(page, 'ArrowLeft', 'ArrowLeft');   // wybór 1-1 (grywalny)
    await page.keyboard.press('Space');
    await waitScene(page, 'Level');
    await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');

    // pierwszy dotyk (środek pola gry, z dala od przycisków) → pady widoczne
    await page.touchscreen.tap(640, 400);
    await page.waitForFunction(() => window.__strzala?.touchVisible === true);
    await page.waitForTimeout(400);
    await shot(page, 'touch-overlay');

    // pierwszy klawisz → pady znikają
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => window.__strzala?.touchVisible === false);
    await page.keyboard.up('ArrowRight');
    expect(errors).toEqual([]);
  });
});
