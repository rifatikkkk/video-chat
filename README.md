# Video Chat Room

Веб-приложение для групповых видеозвонков до четырёх участников. Стек: JavaScript, React, Node.js, Socket.IO и WebRTC.

## Требования

- Node.js 22+
- npm 10+
- современный десктопный браузер с поддержкой WebRTC;
- камера и микрофон для проверки медиасценария.

## Быстрый запуск

```bash
npm ci
npm run dev
```

После запуска откройте клиент: [http://localhost:5173](http://localhost:5173).

Сервисы:

- клиент: `http://localhost:5173`;
- сервер: `http://localhost:3001`;
- health: [http://localhost:3001/healthz](http://localhost:3001/healthz);
- readiness: [http://localhost:3001/readyz](http://localhost:3001/readyz);
- metrics: [http://localhost:3001/metrics](http://localhost:3001/metrics).

Ожидаемые ответы: `/healthz` — `{"status":"ok"}`, `/readyz` — `{"status":"ready"}`.

## Ручная проверка звонка

1. Откройте клиент в первой вкладке, введите имя и нажмите «Создать комнату».
2. Скопируйте ссылку комнаты.
3. Откройте ссылку во второй вкладке или отдельном окне.
4. Введите другое имя и войдите в комнату.
5. Разрешите браузеру доступ к камере и микрофону.
6. Проверьте видео, микрофон, камеру, список участников, чат и выход из комнаты.
7. Обновите страницу: потребуется повторно ввести имя — это ожидаемое поведение.

Для локальной разработки используется `localhost`, поэтому HTTPS не требуется. Если VPN или антивирус блокирует loopback-подключения, временно отключите VPN или добавьте Node.js/браузер в разрешения.

## Отдельный запуск

Если нужно запустить процессы в разных терминалах:

```bash
npm run dev:server
npm run dev:client
```

Если порт `3001` уже занят, остановите старый Node.js-процесс перед повторным запуском. Порт клиента Vite по умолчанию — `5173`.

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
npm run test:smoke # browser smoke с виртуальными camera/microphone
```

Проект организован как npm workspaces: `client`, `server` и `shared`.

Перед отправкой изменений рекомендуется выполнить:

```bash
npm run check:versions
npm run lint
npm test
npm run build
npm run test:smoke -- --workers=1
```

## Размещение

Production-схема с HTTPS reverse proxy, одним Node.js-процессом и SPA fallback описана в [docs/deployment-reverse-proxy.md](docs/deployment-reverse-proxy.md).

Полный runbook запуска, конфигурации, обновления и отката: [docs/operations-runbook.md](docs/operations-runbook.md).

Журнал репетиции выпуска и отката: [docs/acceptance-release-rollback-rehearsal.md](docs/acceptance-release-rollback-rehearsal.md).

Итоговая матрица приёмки и решение о готовности: [docs/acceptance-readiness-matrix.md](docs/acceptance-readiness-matrix.md).

## CI

GitHub Actions workflow `.github/workflows/ci.yml` выполняет `npm ci`, проверку версий workspace-пакетов, lint, unit/integration tests, production build и browser smoke. По каждому запуску сохраняется артефакт `ci-report`; browser smoke дополнительно сохраняет Playwright-отчёт.

Browser smoke использует Chromium с виртуальными camera/microphone и двумя браузерными контекстами. Он проверяет connect, chat и media tile, но не заменяет аппаратные проверки реальной камеры/микрофона.
