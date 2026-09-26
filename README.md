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

Клиент будет доступен по адресу `http://localhost:5173`, сервер — по адресу `http://localhost:3001`. Проверки сервера: `http://localhost:3001/healthz` и `http://localhost:3001/readyz`.

## Команды

```bash
npm run dev        # клиент и сервер
npm run dev:client # только React/Vite
npm run dev:server # только Node.js/Socket.IO
npm run check:versions # проверка согласованности версий workspaces
npm run build      # production-сборка клиента для Chrome, Firefox и Edge 100+
npm run start      # запуск сервера без watch-режима
npm run lint       # статическая проверка JavaScript и JSX
npm test           # unit и Socket.IO integration-проверки
```

Проект организован как npm workspaces: `client`, `server` и `shared`.

## Размещение

Production-схема с HTTPS reverse proxy, одним Node.js-процессом и SPA fallback описана в [docs/deployment-reverse-proxy.md](docs/deployment-reverse-proxy.md).

## CI

GitHub Actions workflow `.github/workflows/ci.yml` выполняет `npm ci`, проверку версий workspace-пакетов, lint, unit/integration tests и production build. По каждому запуску сохраняется артефакт `ci-report`.
