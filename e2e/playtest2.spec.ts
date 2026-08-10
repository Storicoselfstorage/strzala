/**
 * Playtest 2 (spec design-spec-playtest2.md) — weryfikacja wizualna B1:
 *  (1) runner: system 4 biegów — chevrony `»` w HUD, linie prędkości od
 *      biegu 2, fanfara (dźwięk poza asercją); zrzuty biegu 3 i 4;
 *  (2) złodziej 2.0: zawrotka na krawędzi mapy (NIGDY poza mapę) — zrzut;
 *  (3) kopczyk z łupem po 20 s pościgu — zrzut + odkopanie (pełny zwrot).
 * Dev-hooki: window.__strzala (gear, nearestK/G, thiefState/X/Bounces,
 * mound/moundX, arrows).
 */
import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'zrzuty B1: chromium');

interface Dev {
  scene?: string;
  phase?: string;
  playerX?: number;
  progress?: number;
  gear?: number;
  rnV?: number;
  nearestK?: number;
  nearestN?: number;
  nearestG?: number;
  thiefActive?: boolean;
  thiefState?: string;
  thiefX?: number;
  thiefBounces?: number;
  thiefLoot?: boolean;
  mound?: boolean;
  moundX?: number;
  arrows?: number;
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

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/screenshots/${name}.png` });
}

/** hasCake=false w teście złodzieja: kradzież placka wyzwala echoFlee →
 *  aktywne kolce `!` na trasie do kopczyka (niepotrzebne ryzyko śmierci) */
function seedSave(difficulty: 'LATWY' | 'NORMALNY' = 'NORMALNY', hasCake = true) {
  return {
    version: 2,
    character: 'TOSIA',
    difficulty,
    skrzat: false,
    muted: true,
    unlocked: ['1-1'],
    levels: {},
    dragons_defeated: [],
    echo_lina: false,
    total_diamonds: 0,
    arrows: 12,
    has_cake: hasCake,
    campaign_score: 0,
    highscores: [],
    seen_tutorials: [
      'go', 'jump', 'crystal', 'cactus', 'shoot', 'thief', 'echo',
      'arena', 'runner', 'magic',
    ],
    interludes_seen: ['intro'],
  };
}

/** splash → … → Level SPACJĄ (?level= przekierowuje Level.init) */
async function intoLevel(
  page: Page,
  save: ReturnType<typeof seedSave>,
  query: string,
): Promise<void> {
  await page.addInitScript((s) => {
    localStorage.setItem('strzala2.save', JSON.stringify(s));
  }, save);
  await page.goto(`./${query}`);
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => window.__strzala?.scene === 'Splash', undefined,
    { timeout: 30_000 });
  await page.waitForTimeout(300);
  for (let i = 0; i < 40; i++) {
    const scene = await page.evaluate(() => window.__strzala?.scene);
    if (scene === 'Level') break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => window.__strzala?.scene === 'Level', undefined,
    { timeout: 5_000 });
}

/**
 * Mini-bot runnera: skacze nad kaktusami i dziurami (1-3 nie ma Machaczy),
 * ślizga się pod nietoperzem; utrzymuje przebieg do chwili zrzutu.
 */
async function runnerBotStep(page: Page, sliding: { on: boolean }): Promise<void> {
  const d = await page.evaluate(() => window.__strzala);
  const nK = d?.nearestK ?? 9999;
  const nG = d?.nearestG ?? 9999;
  const nN = d?.nearestN ?? 9999;
  if (!sliding.on && nN < 300 && nN > -20) {
    await page.keyboard.down('ArrowDown');
    sliding.on = true;
  }
  if (sliding.on && (nN > 340 || nN < -40)) {
    await page.keyboard.up('ArrowDown');
    sliding.on = false;
  }
  if (!sliding.on && ((nK > 0 && nK < 120) || (nG > -10 && nG < 90))) {
    await tap(page, 'Space');
  }
  await page.waitForTimeout(40);
}

test('runner 2-3: bieg 3 — chevrony »»» i linie prędkości (zrzut)', async ({ page }) => {
  const errors = collectErrors(page);
  await intoLevel(page, seedSave(), '?level=2-3&rnff=0.55');
  await page.waitForFunction(() => window.__strzala?.phase === 'RUNNER');
  // rnff=0.55 → progress za progiem 50%: bieg 3 od pierwszej klatki, rampa ≤ ~2 s
  await page.waitForFunction(() => (window.__strzala?.gear ?? 0) >= 3, undefined,
    { timeout: 10_000 });
  const sliding = { on: false };
  const deadline = Date.now() + 20_000;
  let shotDone = false;
  while (Date.now() < deadline && !shotDone) {
    await runnerBotStep(page, sliding);
    const d = await page.evaluate(() => window.__strzala);
    // rampa zakończona (v ≥ 260 z 272), bieg 3, bez przeszkody tuż przed nosem
    if ((d?.gear ?? 0) === 3 && (d?.rnV ?? 0) >= 260
        && (d?.nearestK ?? 9999) > 140 && (d?.nearestN ?? 9999) > 360) {
      await shot(page, 'playtest2-runner-bieg3');
      shotDone = true;
    }
  }
  if (sliding.on) await page.keyboard.up('ArrowDown');
  expect(shotDone).toBe(true);
  expect(errors).toEqual([]);
});

test('runner 3-3: bieg 4 — chevrony »»»» (zrzut) + reset sekcji → bieg 1', async ({ page }) => {
  const errors = collectErrors(page);
  await intoLevel(page, seedSave(), '?level=3-3&rnff=0.78');
  await page.waitForFunction(() => window.__strzala?.phase === 'RUNNER');
  await page.waitForFunction(() => (window.__strzala?.gear ?? 0) === 4, undefined,
    { timeout: 10_000 });
  const sliding = { on: false };
  const deadline = Date.now() + 20_000;
  let shotDone = false;
  while (Date.now() < deadline && !shotDone) {
    await runnerBotStep(page, sliding);
    const d = await page.evaluate(() => window.__strzala);
    if ((d?.gear ?? 0) === 4 && (d?.rnV ?? 0) >= 300
        && (d?.nearestK ?? 9999) > 140 && (d?.nearestN ?? 9999) > 360
        && (d?.nearestG ?? 9999) > 120) {
      await shot(page, 'playtest2-runner-bieg4');
      shotDone = true;
    }
  }
  if (sliding.on) await page.keyboard.up('ArrowDown');
  expect(shotDone).toBe(true);
  // dalej bez sterowania: śmierć na przeszkodzie ALBO brama bez 10 kryształów —
  // obie ścieżki kończą się resetem sekcji: bieg 1, progress 0, muzyka 1.00
  await page.waitForFunction(
    () => (window.__strzala?.progress ?? 1) < 0.05
      && (window.__strzala?.gear ?? 9) === 1,
    undefined,
    { timeout: 40_000 },
  );
  expect(errors).toEqual([]);
});

test('złodziej 2.0: kradzież plecaka, zawrotka na krawędzi, kopczyk i odkopanie', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  // ŁATWY: serca poza areną + przerzedzone kaktusy → bezpieczny marsz do kopczyka
  await intoLevel(page, seedSave('LATWY', false), '?level=1-1&thief=1');
  await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');

  // złodziej podchodzi do stojącej bohaterki i kradnie CAŁY plecak;
  // start 1-1 (x≈40) leży tuż przy lewej krawędzi → zawrotka niemal od razu
  await page.waitForFunction(() => window.__strzala?.thiefActive === true,
    undefined, { timeout: 20_000 });
  await page.waitForFunction(
    () => (window.__strzala?.thiefBounces ?? 0) >= 1,
    undefined, { timeout: 25_000 },
  );
  await shot(page, 'playtest2-zlodziej-zawrotka');
  expect(await page.evaluate(() => window.__strzala?.thiefLoot)).toBe(true);
  expect(await page.evaluate(() => window.__strzala?.arrows)).toBe(0);

  // bohaterka STOI: każde mijanie = unik-podskok złodzieja nad jej głową
  // (przelot nie łapie — złapanie wymaga wyczucia/strzały), pościg trwa
  // aż do zakopania łupu. NIGDY poza mapę: próbkowanie pozycji ~4 s.
  for (let i = 0; i < 50; i++) {
    const d = await page.evaluate(() => window.__strzala);
    if (d?.thiefActive) {
      expect(d.thiefX ?? 0).toBeGreaterThanOrEqual(0);
      expect(d.thiefX ?? 0).toBeLessThanOrEqual(1600 - 16);
    }
    await page.waitForTimeout(80);
  }

  // po 20 s łącznego flee: dig 1,2 s → kopczyk (bez TTL) + marker $ na krawędzi
  await page.waitForFunction(() => window.__strzala?.mound === true,
    undefined, { timeout: 40_000 });
  const moundX = (await page.evaluate(() => window.__strzala?.moundX)) ?? 0;
  expect(moundX).toBeGreaterThan(0);

  // marsz do kopczyka — okna skoków wg mapy 1-1 (kaktus kol. 18 + dziura
  // 20–23; dziura 55–58; kaktus kol. 81 — tylko przeszkody PRZED kopczykiem)
  const jumpWindows: Array<[number, number]> = [[222, 276], [812, 870], [1236, 1282]];
  await page.keyboard.down('ArrowRight');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const d = await page.evaluate(() => window.__strzala);
    const px = d?.playerX ?? 0;
    if (px >= moundX - 60) break;
    for (const [a, b] of jumpWindows) {
      if (px > a && px < b && moundX > b + 50) await tap(page, 'Space');
    }
    await page.waitForTimeout(20);
  }
  await page.keyboard.up('ArrowRight');

  // kopczyk w kadrze obok bohaterki — zrzut (▲ miga, iskierka łupu)
  await page.waitForTimeout(350);
  await shot(page, 'playtest2-kopczyk');

  // dojście krok po kroku + stanie na kopczyku 0,8 s → pełny zwrot (bez +50)
  const arrowsBefore = (await page.evaluate(() => window.__strzala?.arrows)) ?? -1;
  let shotAtMound = false;
  const digDeadline = Date.now() + 25_000;
  let dug = false;
  while (Date.now() < digDeadline && !dug) {
    const d = await page.evaluate(() => window.__strzala);
    if (d?.mound === false) {
      dug = true;
      break;
    }
    const px = d?.playerX ?? 0;
    const diff = moundX - px;
    if (Math.abs(diff) > 8) {
      const key = diff > 0 ? 'ArrowRight' : 'ArrowLeft';
      await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(220, Math.max(30, Math.abs(diff) * 2)));
      await page.keyboard.up(key);
    } else {
      if (!shotAtMound) {
        // bohaterka na kopczyku — zrzut z paskiem postępu odkopywania
        await page.waitForTimeout(300);
        await shot(page, 'playtest2-kopczyk-odkopywanie');
        shotAtMound = true;
      }
      await page.waitForTimeout(400);   // stój — postęp odkopywania rośnie
    }
  }
  expect(dug).toBe(true);
  // pełny zwrot: wraca dokładnie skradzione 12 strzał
  expect(await page.evaluate(() => window.__strzala?.arrows)).toBe(arrowsBefore + 12);
  expect(errors).toEqual([]);
});
