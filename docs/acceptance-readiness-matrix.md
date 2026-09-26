# Итоговая матрица приёмки и решение о готовности

Дата: 2026-09-26  
Источники: PRD §4 (требования 1–40), TDD §11 (T01–T23), acceptance-отчёты в `docs/`.

Статусы означают: **PASS** — подтверждено автоматикой или выполненным стендом; **CONDITIONAL** — подтверждено локально, но требует release-стенда для полного Must-критерия; **BLOCKED** — критерий явно блокирует выпуск, пока не выполнен.

## Матрица PRD 1–40

| № | Приоритет | Критерий | Доказательство | Статус |
|---:|:---:|---|---|:---:|
| 1 | Must | Имя до входа и отображение участникам | T01, T02; lifecycle/chat reports | PASS |
| 2 | Must | Создание комнаты и URL | T03; lifecycle report | PASS |
| 3 | Must | Копирование invitation URL и fallback | T03; lifecycle report | PASS |
| 4 | Must | Вход по room URL | T03, T04; smoke | PASS |
| 5 | Must | Неизвестный ID создаёт комнату | T04; lifecycle report | PASS |
| 6 | Must | Угадываемый ID не требует авторизации | T04; room integration | PASS |
| 7 | Must | Атомарный лимит в 4 участника | T05; room-registry tests | PASS |
| 8 | Must | Пятый участник получает ROOM_FULL/retry | T05; integration tests | PASS |
| 9 | Must | Удаление комнаты и истории после последнего выхода | T04, T16; lifecycle report | PASS |
| 10 | Must | WebRTC audio/video | T06, T07; Chromium smoke | CONDITIONAL — реальный LAN/HTTPS стенд обязателен |
| 11 | Must | Адаптивная сетка 1–4 и self-view | T06, T23; desktop/four-participant reports | CONDITIONAL — physical browser matrix |
| 12 | Must | Имя поверх плитки | T06, T23; desktop report | CONDITIONAL — physical browser matrix |
| 13 | Must | Камера и микрофон включены по умолчанию | T06, T17; hardware report | CONDITIONAL — реальные устройства |
| 14 | Must | Вход без камеры/микрофона | T17; hardware report | CONDITIONAL — manual permission/device run |
| 15 | Must | Toggle микрофона и индикация | T06, T07; media tests | CONDITIONAL — real browser confirmation |
| 16 | Must | Иконка выключенного микрофона | T06; UI tests | CONDITIONAL — real browser confirmation |
| 17 | Should | Toggle камеры | T08, T09; media tests | CONDITIONAL |
| 18 | Must | Placeholder при отсутствии видео | T06, T17; UI/media tests | CONDITIONAL |
| 19 | Must | Освобождение физической камеры | T08, T09; hardware report | BLOCKED — нужен LED/USB тест |
| 20 | Must | Потеря устройства и ручное восстановление | T08, T09, T17; hardware report | BLOCKED — нужен реальный device-loss тест |
| 21 | Must | Общий realtime-чат | T10, T11; chat report | PASS |
| 22 | Must | Имя и локальное HH:MM | T10; integration/smoke | PASS |
| 23 | Must | История, pagination и autoscroll | T10, T11; chat-history smoke | PASS |
| 24 | Must | Запрет пустых сообщений | T10; protocol tests | PASS |
| 25 | Should | Системные вход/выход в чате | T13; lifecycle report | PASS |
| 26 | Must | Актуальный список участников | T02, T13; lifecycle/smoke | PASS |
| 27 | Must | Осознанный выход | T13, T16; lifecycle report | PASS |
| 28 | Must | Закрытие вкладки и reload без восстановления | T15; lifecycle smoke | PASS |
| 29 | Must | Несколько вкладок занимают отдельные слоты | T02; lifecycle smoke | PASS |
| 30 | Must | Уникальный внутренний participant ID | T01, T02; lifecycle report | PASS |
| 31 | Must | Обрыв, освобождение слота, manual re-entry | T14, T19; network report | CONDITIONAL — blackhole/restart release check |
| 32 | Must | Нет особых прав создателя | T02–T05; registry rules | PASS |
| 33 | Must | Понятный отказ camera/mic без выхода | T17; hardware report | BLOCKED — browser permission run |
| 34 | Should | STUN недоступен без поломки приложения | T18; STUN report | BLOCKED — strict-NAT staging case |
| 35 | Must | Понятная ошибка недоступного сервера | T19; network report | PASS |
| 36 | Must | Unsupported WebRTC/старый браузер | T19; browser smoke | CONDITIONAL — Firefox/Edge release matrix |
| 37 | Must | Autoplay policy и user gesture | T20; compatibility reports | BLOCKED — manual autoplay matrix |
| 38 | Must | Имя ≤30, без спецсимволов | T01; protocol/security tests | PASS |
| 39 | Must | XSS escaping имени и сообщения | T01, T10, T21; security report | PASS |
| 40 | Should | Message length/flood protection | T10, T21, T22; resource/security reports | PASS |

## Матрица T01–T23

| Тест | Результат | Основание |
|---|---|---|
| T01–T05 | PASS | unit/integration + lifecycle/security reports |
| T06 | CONDITIONAL | Chromium virtual devices pass; physical HTTPS browser matrix pending |
| T07 | PASS | browser negotiation/media tests |
| T08–T09 | BLOCKED | hardware LED, USB disconnect and device contention pending |
| T10–T13 | PASS | chat and lifecycle reports |
| T14–T16 | PASS | integration/lifecycle tests; network blackhole remains manual follow-up |
| T17 | BLOCKED | real permission/device matrix pending |
| T18 | BLOCKED | strict NAT/STUN staging case pending; no TURN is expected |
| T19 | CONDITIONAL | automated failure screens pass; HTTPS/restart release check pending |
| T20 | BLOCKED | manual autoplay matrix pending |
| T21 | PASS | security integration and proxy tests |
| T22 | CONDITIONAL | short load smoke passes; 10-room/40-participant, 1 GB, 4-hour soak not run |
| T23 | BLOCKED | physical LAN latency ≤500 ms measurement and release browser matrix pending |

## Решение о готовности

**Решение: NO-GO для production release.** Реализованный код и локальная автоматическая проверка проходят, но выпуск блокируют незавершённые Must-проверки на реальном HTTPS/LAN стенде: T06/T08/T09/T17/T20/T23 и связанные PRD 10, 11–16, 18–20, 33, 37. Дополнительно T18 и T22 остаются ограничениями среды.

Это решение не скрывает непройденные тесты отчётами. До GO необходимо выполнить физическую матрицу из `docs/acceptance-testbed.md`, записать результаты Chrome/Firefox/Edge, HTTPS/NAT/autoplay, device-loss/LED и LAN latency, затем обновить статусы этой таблицы. Ограничения без TURN, in-memory истории и ручного rollback уже согласованы и описаны в `docs/operations-runbook.md`.

## Общие проверки текущего коммита

`npm run lint`, `npm test` (116 unit + 13 integration), `npm run build` и `npm run test:smoke -- --workers=1` (13/13) проходят.
