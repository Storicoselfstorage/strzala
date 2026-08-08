/**
 * Poprawki z playtestu rodzinnego (zamawiająca: córka, 7 lat):
 *  (a) ŁATWY naprawdę łatwiejszy — przy spawnie znika co drugi kaktus/pas
 *      kolców (Skrzat: 2 z 3); zrzuty 1-1 z tego samego kadru (?px=40)
 *      na ŁATWYM i NORMALNYM + twarda asercja liczby kaktusów (devMark).
 *  (b) Echo przeskakuje hazard naziemny: 2-1, gracz przebiega nad kolcami
 *      `^^^` (kol. 60–62), Echo goni i wykonuje skok (devMark echoJump)
 *      — zrzut w trakcie łuku.
 * Dev-hooki: ?level=, ?px= (kolumna gracza), ?ex= (kolumna Echo).
 */
import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'zrzuty B1: chromium');

interface Dev {
  scene?: string;
  phase?: string;
  playerX?: number;
  cacti?: number;
  spikes?: number;
  echoJump?: boolean;
  echoX?: number;
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

/** zapis z przejrzanym intro i wyciszeniem — GRAJ prowadzi wprost na mapę.
 *  hasCake=false dla testu Echo: złodziej kradnący placek wywołuje echoFlee()
 *  i Echo przestaje podążać (a złodziej w 2-1 spawnuje się tuż przy kolcach). */
function seedSave(difficulty: 'LATWY' | 'NORMALNY', skrzat = false, hasCake = true) {
  return {
    version: 2,
    character: 'TOSIA',
    difficulty,
    skrzat,
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

/** splash → menu → GRAJ → mapa → Level (SPACJA aż Level; ?level= przekierowuje) */
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
  await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');
}

// (a) gęstość kaktusów: ten sam kadr 1-1 (kolumna 40 — kaktus kol. 45 w centrum
// kadru na NORMALNYM, na ŁATWYM go nie ma; mapa ma kaktusy w kol. 18/45/80)

test('1-1 NORMALNY: pełna gęstość kaktusów (3) — zrzut kadru', async ({ page }) => {
  const errors = collectErrors(page);
  await intoLevel(page, seedSave('NORMALNY'), '?level=1-1&px=40');
  expect(await page.evaluate(() => window.__strzala?.cacti)).toBe(3);
  await page.waitForTimeout(700);
  await shot(page, 'playtest-1-1-normalny');
  expect(errors).toEqual([]);
});

test('1-1 ŁATWY: co drugi kaktus pominięty (2) — zrzut tego samego kadru', async ({ page }) => {
  const errors = collectErrors(page);
  await intoLevel(page, seedSave('LATWY'), '?level=1-1&px=40');
  expect(await page.evaluate(() => window.__strzala?.cacti)).toBe(2);
  await page.waitForTimeout(700);
  await shot(page, 'playtest-1-1-latwy');
  expect(errors).toEqual([]);
});

test('1-1 Tryb Skrzat: zostaje 1 z 3 kaktusów', async ({ page }) => {
  const errors = collectErrors(page);
  await intoLevel(page, seedSave('NORMALNY', true), '?level=1-1&px=40');
  expect(await page.evaluate(() => window.__strzala?.cacti)).toBe(1);
  expect(errors).toEqual([]);
});

// (b) skok Echo nad kolcami: 2-1 (kolce `^^^` kol. 60–62 — pas zachowany
// też na ŁATWYM jako pierwszy w kolejności czytania). Gracz startuje przed
// kolcami (px=54), Echo stoi w swoim celu podążania (ex=51). Bieg w prawo
// ciągnie cel Echo za kolce — Echo dogania i skacze; zrzut w trakcie łuku.

test('2-1: Echo przeskakuje kolce w drodze za graczem', async ({ page }) => {
  const errors = collectErrors(page);
  await intoLevel(page, seedSave('LATWY', false, false), '?level=2-1&px=54&ex=51');
  // ŁATWY zachowuje pas kolców 60–62 (pierwszy z dwóch)
  expect(await page.evaluate(() => window.__strzala?.spikes)).toBe(3);
  await page.waitForTimeout(800);   // kamera + ewentualny złodziej znika z kadru

  const jumpSeen = page.waitForFunction(
    () => window.__strzala?.echoJump === true, undefined, { timeout: 10_000 },
  );
  await page.keyboard.down('ArrowRight');
  // skok gracza nad kolcami (ŁATWY ma serca, więc nawet muśnięcie nie resetuje)
  await page.waitForFunction(() => (window.__strzala?.playerX ?? 0) >= 884);
  await tap(page, 'Space');
  await jumpSeen;
  await page.waitForTimeout(130);   // środek łuku
  await shot(page, 'playtest-echo-jump');
  await page.keyboard.up('ArrowRight');

  // Echo wylądowała i przekroczyła pas kolców (kol. 62 → x 1008)
  await page.waitForFunction(() => window.__strzala?.echoJump === false);
  await page.waitForFunction(() => (window.__strzala?.echoX ?? 0) > 1008,
    undefined, { timeout: 5_000 });
  expect(errors).toEqual([]);
});
