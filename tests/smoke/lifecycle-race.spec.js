import { expect, test } from '@playwright/test';

async function joinRoom(page, name, roomId) {
  await page.goto(roomId ? `/room/${roomId}` : '/');
  await page.getByLabel('Ваше имя').fill(name);
  await page.getByRole('button', { name: roomId ? 'Войти в комнату' : 'Создать комнату' }).click();
  await expect(page.getByText('Вы в комнате')).toBeVisible();
  return (await page.locator('.room-code').textContent()).trim();
}

async function participantNames(page) {
  return page.locator('.participant-meta strong').allTextContents();
}

test('same display names in two tabs occupy independent participant slots', async ({ browser }) => {
  const firstContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const secondContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    const roomId = await joinRoom(first, 'Одинаковое Имя');
    await joinRoom(second, 'Одинаковое Имя', roomId);

    await expect(first.locator('.participant-tile')).toHaveCount(2);
    await expect(second.locator('.participant-tile')).toHaveCount(2);
    await expect.poll(() => participantNames(first)).toEqual(['Одинаковое Имя (вы)', 'Одинаковое Имя']);
    await expect.poll(() => participantNames(second)).toEqual(['Одинаковое Имя', 'Одинаковое Имя (вы)']);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('room URL updates without reload and invitation copy has success and fallback paths', async ({ browser }) => {
  const successContext = await browser.newContext({ permissions: ['camera', 'microphone', 'clipboard-write'] });
  const successPage = await successContext.newPage();
  const fallbackContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await fallbackContext.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  const fallbackPage = await fallbackContext.newPage();

  try {
    const roomId = await joinRoom(successPage, 'Copy Success');
    await expect(successPage).toHaveURL(new RegExp(`/room/${roomId}$`));
    await successPage.getByRole('button', { name: 'Скопировать приглашение' }).click();
    await expect(successPage.getByText('Ссылка скопирована.')).toBeVisible();

    await joinRoom(fallbackPage, 'Copy Fallback');
    await fallbackPage.getByRole('button', { name: 'Скопировать приглашение' }).click();
    await expect(fallbackPage.getByText('Не удалось скопировать автоматически. Скопируйте ссылку вручную.')).toBeVisible();
    await expect(fallbackPage.getByLabel('Ссылка-приглашение для ручного копирования')).toHaveValue(/\/room\//);
  } finally {
    await successContext.close();
    await fallbackContext.close();
  }
});

test('unknown valid room id creates a room and the same id starts fresh after cleanup', async ({ browser }) => {
  const roomId = `known_${Date.now()}`;
  const firstContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const secondContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await joinRoom(first, 'First Life', roomId);
    await first.getByLabel('Сообщение').fill('message from previous room life');
    await first.getByRole('button', { name: 'Отправить' }).click();
    await expect(first.getByText('message from previous room life')).toBeVisible();
    await first.getByRole('button', { name: 'Выйти' }).click();
    await expect(first.getByRole('button', { name: 'Войти в комнату' })).toBeVisible();

    await joinRoom(second, 'Second Life', roomId);
    await expect(second.locator('.participant-tile')).toHaveCount(1);
    await expect(second.getByText('message from previous room life')).toHaveCount(0);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('reload requires manual re-entry and does not restore participant state', async ({ page }) => {
  const roomId = await joinRoom(page, 'Reload User');

  await page.reload();

  await expect(page).toHaveURL(new RegExp(`/room/${roomId}$`));
  await expect(page.getByRole('heading', { name: 'Вход в комнату' })).toBeVisible();
  await expect(page.getByLabel('Ваше имя')).toHaveValue('');
  await expect(page.locator('.participant-tile')).toHaveCount(0);
});
