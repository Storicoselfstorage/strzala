import { test, expect } from '@playwright/test';

test('gra bootuje: canvas widoczny, zero błędów konsoli', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('./');
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);

  await page.screenshot({
    path: `e2e/screenshots/boot-${testInfo.project.name}.png`,
  });
  expect(errors).toEqual([]);
});
