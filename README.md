# Video Chat Room

Веб-приложение для групповых видеозвонков до четырёх участников. Стек: JavaScript, React, Node.js, Socket.IO и WebRTC.

## Требования

- Node.js 22+
- npm 10+

## Запуск

```bash
npm ci
npm run dev
```

Клиент будет доступен по адресу `http://localhost:5173`, сервер — по адресу `http://localhost:3001`. Проверка сервера: `http://localhost:3001/health`.

## Команды

```bash
npm run dev        # клиент и сервер
npm run dev:client # только React/Vite
npm run dev:server # только Node.js/Socket.IO
npm run build      # production-сборка клиента для Chrome, Firefox и Edge 100+
npm run start      # запуск сервера без watch-режима
```

Проект организован как npm workspaces: `client`, `server` и `shared`.
