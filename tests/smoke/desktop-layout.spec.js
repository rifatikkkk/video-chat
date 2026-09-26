import { expect, test } from '@playwright/test';

for (const width of [1024, 1280, 1440]) {
  test(`desktop layout remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Создайте комнату' })).toBeVisible();
    await expect(page.getByLabel('Ваше имя')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать комнату' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    const longName = 'Очень длинное имя участника для проверки desktop layout 1234567890'.slice(0, 60);
    await page.getByLabel('Ваше имя').fill(longName);
    await expect(page.getByLabel('Ваше имя')).toHaveValue(longName);
    await page.screenshot({ path: `docs/screenshots/task-67-home-${width}.png`, fullPage: true });
  });
}
