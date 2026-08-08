/**
 * F3/F4 — światy 2-3 i runnery: zrzuty do oględzin (checklista B1) + sondy
 * mechanik przez dev-hooki (?level=…, ?arena=1, ?rnff=…; window.__strzala).
 *
 * UWAGA (jak slice.spec): Phaser 4 czyści _justDown przy keyup — klawisze
 * akcji wciskamy z przytrzymaniem (tap()).
 */
import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'zrzuty B1: chromium');

interface Dev {
  scene?: string;
  phase?: string;
  crystals?: number;
  playerX?: number;
  dragonState?: string;
  dragonX?: number;
  geyser?: string;
  flames?: number;
  progress?: number;
  runnerDone?: boolean;
  sliding?: boolean;
  nearestN?: number;
  nearestK?: number;
  gateOpening?: boolean;
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

/**
 * Splash → … → Level SPACJĄ, odpornie na kształt przepływu (4.3): Menu,
 * CharSelect, DiffSelect, scenka Interlude (litery po 1 — SPACJA przewija),
 * WorldMap. Dev-param ?level= przekierowuje Level.init na docelowy poziom.
 */
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

async function waitDragonInFrame(page: Page, timeout = 45_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const d = window.__strzala;
      return d !== undefined
        && (d.dragonX ?? 9999) - (d.playerX ?? 0) < 380
        && (d.dragonX ?? 0) > (d.playerX ?? 0) - 380;
    },
    undefined,
    { timeout },
  );
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/screenshots/${name}.png` });
}

// ── ŚWIAT 2 ────────────────────────────────────────────────────────────────

test('2-1: dżungla — gameplay z mostami z lian', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=2-1');
  await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');
  await page.waitForTimeout(600);
  // dobiegnij przed pierwszy most z lian (zzzzzz od kolumny 40 → x 640)
  await runRightUntil(page, 560);
  await page.waitForTimeout(400);
  await shot(page, '2-1-dzungla');
  expect(errors).toEqual([]);
});

test('2-2: arena Ciernia (tarcza z lian, telegraf)', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=2-2&arena=1');
  await page.waitForFunction(() => window.__strzala?.phase === 'ARENA', undefined, { timeout: 20_000 });
  await runRightUntil(page, 2680, 10_000);
  await page.waitForFunction(
    () => {
      const d = window.__strzala;
      return d?.dragonState === 'TELEGRAPH'
        && (d.dragonX ?? 9999) - (d.playerX ?? 0) < 300
        && (d.dragonX ?? 0) > (d.playerX ?? 0) - 300;
    },
    undefined,
    { timeout: 45_000 },
  );
  await shot(page, '2-2-arena-ciern');
  expect(errors).toEqual([]);
});

// ── ŚWIAT 3 ────────────────────────────────────────────────────────────────

test('3-1: jaskinie — gejzer w erupcji', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=3-1');
  await page.waitForFunction(() => window.__strzala?.phase === 'PLATFORM');
  // pierwszy gejzer `g` przy kolumnie ~33 (x 528) — stań przed nim
  await runRightUntil(page, 430);
  await page.waitForFunction(
    () => window.__strzala?.geyser === 'erupt',
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(250);   // kolumna particles w pełni
  await shot(page, '3-1-gejzer');
  expect(errors).toEqual([]);
});

test('3-2: arena Piry — zionięcie pali pas ziemi', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=3-2&arena=1');
  await page.waitForFunction(() => window.__strzala?.phase === 'ARENA', undefined, { timeout: 20_000 });
  await runRightUntil(page, 2990, 10_000);
  await page.waitForFunction(
    () => (window.__strzala?.flames ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  // płomień trwa 1,0 s; odczekaj aż zejdzie flash trafienia (kadr czytelny)
  await page.waitForTimeout(380);
  await shot(page, '3-2-arena-pira');
  expect(errors).toEqual([]);
});

// ── RUNNERY (F4) ───────────────────────────────────────────────────────────

test('1-3: runner — Samum ucieka przodem i sieje pułapki', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=1-3');
  await page.waitForFunction(() => window.__strzala?.phase === 'RUNNER');
  // pierwszy kaktus w kadrze, pasek postępu ruszył
  await page.waitForFunction(
    () => {
      const d = window.__strzala;
      return (d?.progress ?? 0) > 0.02 && (d?.nearestK ?? 9999) < 420;
    },
    undefined,
    { timeout: 15_000 },
  );
  await shot(page, '1-3-runner');
  expect(errors).toEqual([]);
});

test('1-3: arena Samuma po pościgu', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=1-3&arena=1');
  await page.waitForFunction(() => window.__strzala?.phase === 'ARENA', undefined, { timeout: 20_000 });
  await waitDragonInFrame(page);
  await shot(page, '1-3-arena-samum');
  expect(errors).toEqual([]);
});

test('1-3: naturalne przejście runner → arena (sonda rnff)', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=1-3&rnff=0.99');
  await page.waitForFunction(() => window.__strzala?.phase === 'RUNNER');
  // sekcja dobiega końca → scena burzy runner i buduje arenę Samuma
  await page.waitForFunction(
    () => window.__strzala?.phase === 'ARENA',
    undefined,
    { timeout: 25_000 },
  );
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});

test('2-3: runner — ślizg pod Machaczem (sonda bot)', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=2-3');
  await page.waitForFunction(() => window.__strzala?.phase === 'RUNNER');

  // mini-bot: skacz nad kaktusami, aż nietoperz podleci; wtedy ślizg
  const deadline = Date.now() + 45_000;
  let sliding = false;
  let shotDone = false;
  while (Date.now() < deadline && !shotDone) {
    const d = await page.evaluate(() => window.__strzala);
    const nK = d?.nearestK ?? 9999;
    const nN = d?.nearestN ?? 9999;
    if (!sliding && nN < 340 && nN > -20) {
      await page.keyboard.down('ArrowDown');
      sliding = true;
    }
    if (sliding && nN < 34 && nN > -34) {
      // nietoperz dokładnie nad bohaterką w ślizgu
      await shot(page, '2-3-runner-slizg');
      shotDone = true;
      break;
    }
    if (sliding && (nN > 360 || nN < -40)) {
      // nietoperz minięty bez kadru — wstań i próbuj przy następnym
      await page.keyboard.up('ArrowDown');
      sliding = false;
    }
    if (!sliding && nK > 0 && nK < 110) {
      await tap(page, 'Space');
    }
    await page.waitForTimeout(40);
  }
  // stan ślizgu czytamy PRZED puszczeniem [↓] (po keyup sim wstaje od razu)
  const after = await page.evaluate(() => window.__strzala);
  await page.keyboard.up('ArrowDown');
  expect(shotDone).toBe(true);
  expect(after?.phase).toBe('RUNNER');
  expect(after?.sliding).toBe(true);
  expect(errors).toEqual([]);
});

test('2-3: arena Monsuna (tarcza od startu, kryształy `o`)', async ({ page }) => {
  const errors = collectErrors(page);
  await keyboardIntoLevel(page, '?level=2-3&arena=1');
  await page.waitForFunction(() => window.__strzala?.phase === 'ARENA', undefined, { timeout: 20_000 });
  await waitDragonInFrame(page);
  await shot(page, '2-3-arena-monsun');
  expect(errors).toEqual([]);
});

test('3-3: sprint — lawa za plecami, brama na 10 kryształów', async ({ page }) => {
  const errors = collectErrors(page);
  // rnff: przewinięcie sekcji pod bramę (pełny przebieg testuje core + bot 2-3)
  await keyboardIntoLevel(page, '?level=3-3&rnff=0.985');
  await page.waitForFunction(() => window.__strzala?.phase === 'RUNNER');
  await page.waitForFunction(
    () => window.__strzala?.runnerDone === true,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(500);   // brama + komunikat „Brama wymaga 10 kryształów"
  await shot(page, '3-3-brama');
  // bez 10 kryształów: po 2,5 s reset sekcji (GateState)
  await page.waitForFunction(
    () => (window.__strzala?.progress ?? 1) < 0.05
      && window.__strzala?.runnerDone === false,
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(800);
  await shot(page, '3-3-runner-lawa');
  expect(errors).toEqual([]);
});
