import { expect, test } from '@playwright/test';

async function joinRoom(page, name, roomId) {
  await page.goto(roomId ? `/room/${roomId}` : '/');
  await page.getByLabel('Ваше имя').fill(name);
  await page.getByRole('button', { name: roomId ? 'Войти в комнату' : 'Создать комнату' }).click();
  await expect(page.getByText('Вы в комнате')).toBeVisible();
  return (await page.locator('.room-code').textContent()).trim();
}

async function sendChat(page, text) {
  await page.getByLabel('Сообщение').fill(text);
  await page.getByRole('button', { name: 'Отправить' }).click();
}

test('late join receives ordered chat history while active sends continue', async ({ browser }) => {
  const annaContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const borisContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const anna = await annaContext.newPage();
  const boris = await borisContext.newPage();

  try {
    const roomId = await joinRoom(anna, 'History Anna');
    await sendChat(anna, 'history before late join');

    const joining = joinRoom(boris, 'History Boris', roomId);
    await sendChat(anna, 'history during late join');
    await joining;

    const borisMessages = boris.locator('.chat-message p');
    await expect(borisMessages.filter({ hasText: 'history before late join' })).toHaveCount(1);
    await expect(borisMessages.filter({ hasText: 'history during late join' })).toHaveCount(1);

    const visibleText = await boris.locator('.chat-messages').innerText();
    expect(visibleText.indexOf('history before late join')).toBeLessThan(visibleText.indexOf('history during late join'));
  } finally {
    await annaContext.close();
    await borisContext.close();
  }
});

test('chat renders HTML as text with a valid timestamp and confirmed delivery', async ({ page }) => {
  await joinRoom(page, 'HTML User');
  await sendChat(page, '<b>safe & visible</b>');

  const message = page.locator('.chat-message').filter({ hasText: '<b>safe & visible</b>' });
  await expect(message).toHaveCount(1);
  await expect(message.locator('b')).toHaveCount(0);
  await expect(message.locator('small')).toHaveCount(0);

  const timestamp = await message.locator('time').getAttribute('datetime');
  expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
});

test('long chat history uses a visible window and can reveal older messages', async ({ page }) => {
  await joinRoom(page, 'Long History');

  for (let index = 1; index <= 90; index += 1) {
    await sendChat(page, `long history message ${String(index).padStart(2, '0')}`);
  }

  await expect(page.locator('.chat-message p').filter({ hasText: 'long history message 90' })).toBeVisible();
  await expect(page.locator('.chat-message p').filter({ hasText: 'long history message 01' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Показать предыдущие сообщения' }).click();

  await expect(page.locator('.chat-message p').filter({ hasText: 'long history message 01' })).toBeVisible();
});
