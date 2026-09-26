# Video Chat Room: runbook запуска и эксплуатации

## 1. Локальный запуск

Требования: Node.js 22+, npm 10+.

```bash
npm ci
npm run check:versions
npm run dev
```

Клиент: `http://localhost:5173`; сервер: `http://localhost:3001`. Health/readiness: `/healthz`, `/health`, `/readyz`. Для ручного звонка отключите VPN, если он блокирует loopback, и разрешите камеру/микрофон.

Перед PR запускаются `npm run lint`, `npm test`, `npm run build` и `npm run test:smoke`.

## 2. Production-конфигурация

Production использует собранный `client/dist`, nginx из [deploy/nginx/video-chat.conf](../deploy/nginx/video-chat.conf) и ровно один Node.js-процесс.

Поддерживаемые переменные сервера:

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `PORT` | `3001` | внутренний HTTP-порт Node.js |
| `PUBLIC_ORIGIN` | пусто | comma-separated allowlist браузерных Origin; для выпуска — только HTTPS origin |
| `STUN_URLS` | `stun:stun.l.google.com:19302` | STUN/TURN URLs для WebRTC |
| `MAX_PARTICIPANTS` | `4` | фиксированный лимит комнаты; другое значение отклоняется |
| `SHUTDOWN_GRACE_MS` | `10000` | grace-период планового shutdown, 1000–60000 мс |

Сборка и запуск:

```bash
npm ci
npm run check:versions
npm run build
set PUBLIC_ORIGIN=https://video.example.com
npm run start --workspace @video-chat/server
```

Не запускайте вторую копию Node.js: registry, участники, история и Socket.IO membership находятся только в RAM одного процесса.

## 3. HTTPS и reverse proxy

Домен и TLS должны завершаться в nginx. HTTP перенаправляется на HTTPS; `/socket.io/` проксируется с Upgrade/Connection, SPA-маршруты получают `index.html`, а `/healthz`, `/readyz` и `/metrics` не попадают под SPA fallback. В production проверьте:

```bash
curl -fsS https://video.example.com/healthz
curl -fsS https://video.example.com/readyz
```

`PUBLIC_ORIGIN` должен совпадать с origin страницы. CSP разрешает только same-origin scripts/styles/media и `wss:`; Permissions-Policy разрешает camera/microphone только `self`. Доступ к `/metrics` ограничьте сетевым ACL или auth на уровне окружения.

## 4. Ресурсы и ограничения

- Лимит процесса: 1 GB RAM; целевая ёмкость — до 10 комнат/40 участников.
- Одна комната: максимум 4 участника, рекомендуемая активная длительность — до 4 часов.
- История хранится только в RAM и удаляется после последнего выхода или restart.
- При нехватке budget новые сообщения получают `SERVER_BUSY`; уже принятая история не удаляется и не обрезается.
- `RATE_LIMITED` означает превышение token bucket; повтор выполняется вручную после задержки.
- Backpressure для медленного клиента в этой версии не реализован и находится в backlog; SlowConsumerGuard разрывает перегруженное Socket.IO-соединение, не очищая чужие комнаты.
- STUN используется без TURN; отдельная недостижимая NAT-пара может быть недоступна, остальные P2P-пары и чат продолжаются.

Нагрузочный генератор без WebRTC: `npm run load:test`. Он принимает `LOAD_ROOMS`, `LOAD_PARTICIPANTS`, `LOAD_MESSAGES`, `LOAD_DURATION_MS`, `LOAD_SLOW_CLIENT_MS` и печатает ack latency и pre/post-cleanup `/metrics`.

## 5. Плановый restart и rollback

1. Остановите приём новых входов через readiness/deployment orchestration и дождитесь drain.
2. Отправьте `SIGTERM` Node.js-процессу. Клиенты получают `server:closing`, существующие sockets закрываются после grace-периода.
3. Убедитесь, что `/readyz` возвращает `503`, старый процесс завершён и порт свободен.
4. Запустите совместимую пару client/server и проверьте `/healthz`, `/readyz`, вход в комнату и чат.

Rollback — это возврат **обоих** артефактов client и server к предыдущему совместимому commit/image, затем повтор health/readiness и smoke-проверки. Не запускайте старую и новую Node.js-копии одновременно. После restart старые комнаты и история не восстанавливаются; пользователи должны войти в новую комнату вручную.

## 6. Наблюдаемость и инциденты

`/metrics` отдаёт aggregate rooms/participants, heap/RSS, event-loop lag, history bytes/entries, join failures и rate limits. Не логируйте display names, chat text, SDP, ICE candidates или room IDs; nginx-конфигурация использует redacted access log.

При проблеме:

1. Проверьте `/healthz` и `/readyz`, затем RSS/heap и event-loop lag.
2. Проверьте nginx WebSocket Upgrade, TLS certificate и `PUBLIC_ORIGIN`.
3. Снимите агрегированные metrics и CI/load-test JSON; не собирайте содержимое переписки или SDP.
4. Для graceful recovery примените плановый shutdown; не удаляйте RAM-историю вручную в попытке «освободить место».
