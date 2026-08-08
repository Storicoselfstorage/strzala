/**
 * BOSS Obsydian + finał (Victory/Scores) + integracja dotyku — zrzuty do
 * oględzin (checklista B1) + sondy przez dev-hooki (?level=BOSS, ?arena=1,
 * ?dhp=…, ?magic=…; window.__strzala).
 *
 * UWAGA (jak worlds.spec): Phaser 4 czyści _justDown przy keyup — klawisze
 * akcji wciskamy z przytrzymaniem (tap()).
 */
import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'zrzuty B1: chromium');

interface Dev {
  scene?: string;
  phase?: string;
  level?: string;
  playerX?: number;
  playerY?: number;
  dragonState?: string;
  dragonX?: number;
  dragonHits?: number;
  dragonHp?: number;
  bossPhase?: number;
  shieldUp?: boolean;
  p2Platforms?: boolean;
  taunt?: string;
  touchVisible?: boolean;
  nameLen?: number;
  committed?: boolean;
  newRecordRow?: number;
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

async function keyboardIntoLevel(page: Page, query = ''): Promise<void> {
  await page.goto(`./${query}`);
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitScene(page, 'Splash', 30_000);
  await page.waitForTimeout(300);
  for (let i = 0; i < 40; i++) {
    const scene = await page.evaluate(() => window.__strzala?.scene);
    if (scene === 'Level') return;
    await page.keyboard.press('Space');
    await page.waitForTimeout(230);
  }
  await waitScene(page, 'Level', 5_000);
}

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

// ── BOSS: fazy Obsydiana (aneks 8.4.3) ─────────────────────────────────────

test('BOSS faza 1: tarcza od startu + Vabank na łbie', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=BOSS&arena=1');
  await page.waitForFunction(() => window.__strzala?.phase === 'ARENA', undefined, { timeout: 20_000 });
  const d0 = await page.evaluate(() => window.__strzala);
  expect(d0?.level).toBe('BOSS');
  expect(d0?.bossPhase).toBe(1);
  expect(d0?.shieldUp).toBe(true);
  // smok fazy 1 dojeżdża do x1−26 kol (~1808) — dobiegnij, by wszedł w kadr
  await runRightUntil(page, 1660);
  await page.waitForFunction(
    () => {
      const d = window.__strzala;
      return (d?.dragonX ?? 9999) - (d?.playerX ?? 0) < 240;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(400);
  await shot(page, 'boss-faza1');
  expect(errors).toEqual([]);
});

test('BOSS: platformówka wejściowa + naturalny trigger areny', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=BOSS');
  await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');
  await page.waitForTimeout(600);   // intro-toast poziomu
  await shot(page, 'boss-wejscie');
  // bot: biegnij w prawo, skacz przed pasami kolców `^^^` (kol. 15-17, 41-43);
  // trigger `>` (kol. 64) domyka ścianę i startuje arenę — bez ?arena=1
  await page.keyboard.down('ArrowRight');
  const deadline = Date.now() + 30_000;
  let entered = false;
  try {
    while (Date.now() < deadline) {
      const d = await page.evaluate(() => window.__strzala);
      if (d?.phase === 'ARENA') {
        entered = true;
        break;
      }
      const x = d?.playerX ?? 0;
      if ((x > 170 && x < 235) || (x > 585 && x < 650)) await tap(page, 'Space');
      await page.waitForTimeout(40);
    }
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  expect(entered).toBe(true);
  expect(errors).toEqual([]);
});

test('BOSS faza 2: dymek Vabanka + znikające platformy', async ({ page }) => {
  const errors = collectErrors(page);
  // dev: ?dhp=12 → HP na progu fazy 2 (18→12 na Normalnym)
  await keyboardIntoLevel(page, '?level=BOSS&arena=1&dhp=12');
  await page.waitForFunction(() => window.__strzala?.bossPhase === 2, undefined, { timeout: 20_000 });
  const d0 = await page.evaluate(() => window.__strzala);
  expect(d0?.p2Platforms).toBe(true);
  expect(d0?.taunt).toContain('SMOKA');   // VABANK_TAUNTS.phase2
  await page.waitForTimeout(600);   // platformy wskoczyły, dymek na ekranie
  await shot(page, 'boss-faza2-dymek');
  // sinusoidalny lot: poczekaj aż smok przyleci nad platformy przy graczu
  await page.waitForFunction(
    () => (window.__strzala?.dragonX ?? 9999) < 1350,
    undefined,
    { timeout: 30_000 },
  );
  await shot(page, 'boss-faza2-lot');
  expect(errors).toEqual([]);
});

test('BOSS faza 3: szarża przez arenę', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=BOSS&arena=1&dhp=6');
  await page.waitForFunction(() => window.__strzala?.bossPhase === 3, undefined, { timeout: 20_000 });
  const d0 = await page.evaluate(() => window.__strzala);
  expect(d0?.taunt).toContain('zdenerwował');   // VABANK_TAUNTS.phase3
  // pierwsza szarża rusza po ~3,2 s i pędzi w stronę gracza (20 kol/s)
  await page.waitForFunction(
    () => window.__strzala?.dragonState === 'CHARGE'
      && (window.__strzala?.dragonX ?? 9999) < 1500,
    undefined,
    { timeout: 30_000 },
  );
  await shot(page, 'boss-faza3-szarza');
  expect(errors).toEqual([]);
});

// ── Finał: zwycięstwo → Summary → Interlude(finale) → Victory → Scores ─────

test('BOSS: zwycięstwo, wpis imienia i tabela z nowym wpisem', async ({ page }) => {
  const errors = collectErrors(page);
  // dev: 1 HP + 3 magiczne strzały (przebijają tarczę zawsze — aneks 8.4.2)
  await keyboardIntoLevel(page, '?level=BOSS&arena=1&dhp=1&magic=3');
  await page.waitForFunction(() => window.__strzala?.phase === 'ARENA', undefined, { timeout: 20_000 });
  // podbiegnij w zasięg strzału (40 kolumn) i strzelaj magiczną [Z]
  await runRightUntil(page, 1400, 20_000);
  for (let i = 0; i < 8; i++) {
    await tap(page, 'z');
    const dev = await page.evaluate(() => window.__strzala);
    if ((dev?.dragonHits ?? 0) > 0 || dev?.phase === 'VICTORY') break;
    await page.waitForTimeout(700);
  }
  await page.waitForFunction(
    () => window.__strzala?.phase === 'VICTORY',
    undefined,
    { timeout: 25_000 },
  );
  await page.waitForTimeout(450);   // rozpad + salwy konfetti 'p-star'
  await shot(page, 'boss-zwyciestwo');

  // Summary (auto po ~3,4 s) → SPACJA → Interlude('finale') → Victory
  await waitScene(page, 'Summary', 10_000);
  await page.waitForTimeout(400);
  for (let i = 0; i < 30; i++) {
    const scene = await page.evaluate(() => window.__strzala?.scene);
    if (scene === 'Victory') break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(220);
  }
  await waitScene(page, 'Victory', 5_000);
  await page.waitForTimeout(700);   // fajerwerki w pętli

  // wpis imienia: litery z klawiatury fizycznej (3–8 znaków), ENTER zatwierdza
  for (const ch of 'TOSIA') await tap(page, ch.toLowerCase());
  await page.waitForFunction(() => window.__strzala?.nameLen === 5);
  await shot(page, 'victory-wpis-imienia');
  await page.keyboard.press('Enter');

  await waitScene(page, 'Scores', 5_000);
  await page.waitForFunction(() => (window.__strzala?.newRecordRow ?? -1) >= 0);
  await page.waitForTimeout(300);
  await shot(page, 'scores-z-wpisem');
  expect(errors).toEqual([]);
});

// ── Dotyk (PRD 7): pady w grze + skok z pada ───────────────────────────────

test.describe('sterowanie dotykowe', () => {
  test.use({ hasTouch: true });

  test('pady pojawiają się w grze, skok działa z pada', async ({ page }) => {
    const errors = collectErrors(page);
    await keyboardIntoLevel(page, '?level=1-1');
    await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');

    const box = await page.locator('#game canvas').boundingBox();
    expect(box).not.toBeNull();
    const sx = box!.width / 640;
    const sy = box!.height / 360;
    const gameTap = async (gx: number, gy: number) => {
      await page.touchscreen.tap(box!.x + gx * sx, box!.y + gy * sy);
    };

    // pierwszy dotyk (neutralne pole) → auto-detekcja pokazuje pady (PRD 7)
    await gameTap(320, 200);
    await page.waitForFunction(() => window.__strzala?.touchVisible === true);
    await page.waitForTimeout(300);
    await shot(page, 'touch-pady');

    // skok z pada SKOK (594, 310 w px gry) — licznik registry → JustDown
    const before = await page.evaluate(() => window.__strzala?.playerY ?? 0);
    await gameTap(594, 310);
    await page.waitForFunction(
      (y0) => (window.__strzala?.playerY ?? 9999) < y0 - 8,
      before,
      { timeout: 3_000 },
    );
    // pady nadal widoczne (dotyk pozostaje trybem sterowania)
    const still = await page.evaluate(() => window.__strzala?.touchVisible);
    expect(still).toBe(true);
    expect(errors).toEqual([]);
  });
});
