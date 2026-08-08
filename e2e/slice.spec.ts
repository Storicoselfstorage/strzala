/**
 * Pionowy wycinek B1 — przejście klawiaturą splash→menu→charselect→poziom
 * + zrzuty ekranu do bramki wizualnej (e2e/screenshots/).
 * Dev-hooki: window.__strzala (tylko vite DEV), query param ?level=&arena=&thief=.
 *
 * UWAGA: Phaser 4 czyści _justDown przy keyup — page.keyboard.press() (down+up
 * w tej samej klatce) gubi JustDown, więc klawisze akcji wciskamy z przytrzymaniem.
 */
import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// zrzuty robimy na chromium (bramka B1); webkit pokrywa smoke.spec
test.skip(({ browserName }) => browserName !== 'chromium', 'zrzuty B1: chromium');

interface Dev {
  scene?: string;
  phase?: string;
  crystals?: number;
  thiefActive?: boolean;
  thiefX?: number;
  playerX?: number;
  dragonState?: string;
  dragonX?: number;
  dragonHits?: number;
  pauseOpened?: boolean;
  interludeId?: string;
  selected?: string;
  touchVisible?: boolean;
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

/** wciśnięcie rozciągnięte na >1 klatkę gry (JustDown musi zdążyć) */
async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
}

async function waitScene(page: Page, scene: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction(
    (s) => window.__strzala?.scene === s,
    scene,
    { timeout },
  );
}

/** przewiń scenkę fabularną: SPACJA aż scena przestanie być Interlude */
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

/** splash → menu → charselect (Tosia) → diffselect (NORMALNY) →
 *  intro (świeży profil) → mapa świata → Level */
async function keyboardIntoLevel(page: Page, query = ''): Promise<void> {
  await page.goto(`./${query}`);
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitScene(page, 'Splash', 30_000);
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await waitScene(page, 'Menu');
  await page.keyboard.press('Space');
  await waitScene(page, 'CharSelect');
  await page.keyboard.press('Space');
  await waitScene(page, 'DiffSelect');
  await page.keyboard.press('Space');
  await waitScene(page, 'Interlude');
  await skipInterlude(page);
  await waitScene(page, 'WorldMap');
  await page.keyboard.press('Space');
  await waitScene(page, 'Level');
}

/** biegnij w prawo aż playerX osiągnie próg (potem puszcza klawisz) */
async function runRightUntil(page: Page, x: number, timeout = 15_000): Promise<void> {
  await page.keyboard.down('ArrowRight');
  try {
    await page.waitForFunction(
      (threshold) => (window.__strzala?.playerX ?? 0) >= threshold,
      x,
      { timeout },
    );
  } finally {
    await page.keyboard.up('ArrowRight');
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/screenshots/${name}.png` });
}

test('menu i wybór bohaterki — zrzuty', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitScene(page, 'Splash', 30_000);
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await waitScene(page, 'Menu');
  await page.waitForTimeout(700);
  await shot(page, 'menu');

  await page.keyboard.press('Space');
  await waitScene(page, 'CharSelect');
  await page.waitForTimeout(700);
  await shot(page, 'charselect');
  expect(errors).toEqual([]);
});

test('poziom 1-1: start, pickup, bieg z kurzem', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page);
  await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');
  await page.waitForTimeout(800);               // intro toast na ekranie
  await shot(page, '1-1-start');

  // pickup: kryształy tuż na prawo od startu (mCCC)
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(
    () => (window.__strzala?.crystals ?? 0) > 0,
    undefined,
    { timeout: 8000 },
  );
  await shot(page, '1-1-pickup');

  // bieg z kurzem — zrzut w trakcie biegu, PRZED kaktusem (kolumna 18)
  await page.waitForFunction(
    () => (window.__strzala?.playerX ?? 0) >= 235,
    undefined,
    { timeout: 8000 },
  );
  await shot(page, '1-1-bieg');
  await page.keyboard.up('ArrowRight');
  expect(errors).toEqual([]);
});

test('poziom 1-1: złodziej z sygnalizacją', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=1-1&thief=1');
  // podejdź (bezpiecznie przed kaktusem) i czekaj aż złodziej będzie w kadrze
  await runRightUntil(page, 200);
  await page.waitForFunction(
    () => window.__strzala?.thiefActive === true,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForFunction(
    () => {
      const d = window.__strzala;
      return d !== undefined && (d.thiefX ?? -1) >= 0
        && (d.thiefX ?? 0) - (d.playerX ?? 0) < 200;
    },
    undefined,
    { timeout: 15_000 },
  );
  await shot(page, '1-1-zlodziej');
  expect(errors).toEqual([]);
});

test('arena Miraża: telegraf, trafienie, pauza', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=1-2&arena=1');
  await page.waitForFunction(
    () => window.__strzala?.phase === 'ARENA',
    undefined,
    { timeout: 20_000 },
  );

  // wejdź głębiej w arenę, żeby smok patrolem wszedł w kadr
  await runRightUntil(page, 2500, 10_000);

  // telegraf: FSM w TELEGRAPH i smok blisko gracza (w kadrze)
  await page.waitForFunction(
    () => {
      const d = window.__strzala;
      return d?.dragonState === 'TELEGRAPH'
        && (d.dragonX ?? 9999) - (d.playerX ?? 0) < 260
        && (d.dragonX ?? 0) > (d.playerX ?? 0) - 260;
    },
    undefined,
    { timeout: 45_000 },
  );
  await shot(page, 'arena-telegraf');

  // trafienie: spamuj X (z przytrzymaniem) aż licznik trafień wzrośnie
  const deadline = Date.now() + 30_000;
  let hit = false;
  while (Date.now() < deadline && !hit) {
    await tap(page, 'x');
    try {
      await page.waitForFunction(
        () => (window.__strzala?.dragonHits ?? 0) > 0,
        undefined,
        { timeout: 350 },
      );
      hit = true;
    } catch {
      // jeszcze nie — strzelaj dalej
    }
  }
  expect(hit).toBe(true);
  await shot(page, 'arena-trafienie');

  // pauza
  await tap(page, 'p');
  await page.waitForFunction(
    () => window.__strzala?.pauseOpened === true,
    undefined,
    { timeout: 5000 },
  );
  await page.waitForTimeout(400);
  await shot(page, 'pauza');
  expect(errors).toEqual([]);
});
