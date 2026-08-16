import { test, expect, Page } from '@playwright/test';

// NOWA GRA (playtest 3, 16.08.2026): po ukończeniu kampanii rodzina chce
// grać od nowa. Menu → NOWA GRA → potwierdzenie (domyślnie NIE);
// TAK = reset kampanii z zachowaniem tabeli wyników → wybór bohaterki.

declare global {
  interface Window {
    __strzala?: {
      scene?: string;
      confirmOpen?: boolean;
      newGame?: boolean;
    };
  }
}

// zapis po ukończonej kampanii — stan zgłoszony przez gracza (10800 pkt)
const FINISHED_SEED = {
  version: 2,
  character: 'TOSIA',
  difficulty: 'NORMALNY',
  unlocked: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', 'BOSS'],
  levels: { '1-1': { completed: true, best_score: 900, best_time: 61, stars: 3 } },
  dragons_defeated: ['1-2', '1-3', '2-2', '2-3', '3-2'],
  campaign_score: 10800,
  highscores: [{ name: 'TATA', score: 10800, stars: 21 }],
  interludes_seen: ['intro', 'after-1-3', 'after-2-3', 'finale'],
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  return errors;
}

async function waitScene(page: Page, scene: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction((s) => window.__strzala?.scene === s, scene, { timeout });
}

async function intoMenu(page: Page): Promise<void> {
  await page.addInitScript((seed) => {
    localStorage.setItem('strzala2.save', JSON.stringify(seed));
  }, FINISHED_SEED);
  await page.goto('./');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitScene(page, 'Splash', 30_000);
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await waitScene(page, 'Menu');
  await page.waitForTimeout(300);
}

async function openNewGameConfirm(page: Page): Promise<void> {
  await page.keyboard.press('ArrowDown');   // GRAJ → NOWA GRA
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__strzala?.confirmOpen === true);
  await page.waitForTimeout(200);
}

function readSave(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('strzala2.save') ?? 'null'));
}

test('NIE (domyślne) zamyka okno i nie rusza zapisu', async ({ page }) => {
  const errors = collectErrors(page);
  await intoMenu(page);
  await openNewGameConfirm(page);
  await page.screenshot({ path: 'e2e/screenshots/newgame-confirm.png' });

  await page.keyboard.press('Space');   // domyślna selekcja = NIE
  await page.waitForFunction(() => window.__strzala?.confirmOpen === false);
  const save = await readSave(page);
  expect(save.campaign_score).toBe(10800);
  expect(save.unlocked).toContain('BOSS');
  expect(errors).toEqual([]);
});

test('TAK resetuje kampanię, zachowuje wyniki i prowadzi do wyboru bohaterki',
  async ({ page }) => {
    const errors = collectErrors(page);
    await intoMenu(page);
    await openNewGameConfirm(page);

    await page.keyboard.press('ArrowLeft');   // NIE → TAK
    await page.waitForTimeout(150);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__strzala?.newGame === true);
    await waitScene(page, 'CharSelect');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/newgame-charselect.png' });

    const save = await readSave(page);
    expect(save.unlocked).toEqual(['1-1']);
    expect(save.campaign_score).toBe(0);
    expect(save.levels).toEqual({});
    expect(save.dragons_defeated).toEqual([]);
    expect(save.interludes_seen).toEqual([]);   // intro zagra od nowa
    expect(save.highscores).toEqual(FINISHED_SEED.highscores);
    expect(errors).toEqual([]);
  });
