import { expect, test } from '@playwright/test';

test('two browser contexts can connect, chat, and exchange media with virtual devices', async ({ browser }) => {
  const firstContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const secondContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const anna = await firstContext.newPage();
  const boris = await secondContext.newPage();

  try {
    await anna.goto('/');
    await anna.getByLabel('Ваше имя').fill('Анна Smoke');
    await anna.getByRole('button', { name: 'Создать комнату' }).click();
    await expect(anna.getByText('Вы в комнате')).toBeVisible();
    await expect(anna.getByText(/Микрофон включён/)).toBeVisible();
    await expect(anna.getByText(/Камера включена/)).toBeVisible();

    const roomId = (await anna.locator('.room-code').textContent()).trim();
    await boris.goto(`/room/${roomId}`);
    await boris.getByLabel('Ваше имя').fill('Борис Smoke');
    await boris.getByRole('button', { name: 'Войти в комнату' }).click();

    await expect(boris.getByText('Вы в комнате')).toBeVisible();
    await expect(boris.getByText(/Микрофон включён/)).toBeVisible();
    await expect(boris.getByText(/Камера включена/)).toBeVisible();
    await expect(anna.locator('.participant-meta strong').filter({ hasText: 'Борис Smoke' })).toBeVisible();
    await expect(boris.locator('.participant-meta strong').filter({ hasText: 'Анна Smoke' })).toBeVisible();

    await anna.getByLabel('Сообщение').fill('browser smoke chat message');
    await anna.getByRole('button', { name: 'Отправить' }).click();
    await expect(boris.getByText('browser smoke chat message')).toBeVisible();

    await expect.poll(async () => (
      await anna.locator('.participant-video').count()
      + await boris.locator('.participant-video').count()
    ), { timeout: 15_000 }).toBeGreaterThan(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
