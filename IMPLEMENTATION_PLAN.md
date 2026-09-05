# План реализации Phase 2

## Архитектурное решение

Проект остаётся простым self-hosted монолитом:

```text
Internet
  → Nginx или Caddy
    → статическая React/Vite сборка
    → /api → FastAPI
      → SQLAlchemy repositories/services
        → SQLite WAL file
```

Supabase, Firebase и другие BaaS не используются. Frontend остаётся в корне, чтобы не рисковать уже проверенной Phase 1; backend добавляется в `backend/`, постоянные данные — в `data/`.

## Backend

- Python 3.12+.
- FastAPI + Pydantic v2 для versioned REST API `/api/v1`.
- SQLAlchemy 2.x ORM; endpoint-функции не содержат SQL.
- Repository layer отвечает за доступ к данным, service layer — за бизнес-правила.
- Alembic — единственный production migration mechanism.
- SQLite включается с `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- Все timestamps хранятся как UTC и возвращаются timezone-aware ISO 8601.
- Настройки клуба находятся в `app_settings`, а не во frontend-константах.

## Защита booking engine

Создание записи начинается с `BEGIN IMMEDIATE` для SQLite. Write lock берётся до чтения вместимости, блокировок и пересечений и удерживается до INSERT/COMMIT. Поэтому два параллельных запроса на последнее место сериализуются: первый фиксирует запись, второй видит обновлённое состояние и получает `409 GYM_CAPACITY_REACHED`.

Вместимость проверяется sweep-line алгоритмом по всем активным пересекающимся интервалам, а не количеством одинаковых `start_at`. Интервалы считаются полуоткрытыми `[start_at, end_at)`, поэтому окончание одной тренировки в момент начала другой не конфликтует.

В той же транзакции проверяются:

- блокировка зала → `BOOKING_BLOCKED`;
- пересечение персональных тренировок тренера → `TRAINER_NOT_AVAILABLE`;
- пересекающаяся активная запись пользователя → `USER_ALREADY_BOOKED`;
- лимит одновременных посетителей → `GYM_CAPACITY_REACHED`.

## Database entities

`users`, `trainer_profiles`, `trainer_specialties`, `schedule_slots`, `bookings`, `booking_blocks`, `membership_types`, `memberships`, `measurements`, `app_settings`.

SQLite-файл по умолчанию: `data/zhelezny_ryurik.db`. URL задаётся через `DATABASE_URL`; относительный путь разрешается относительно `backend/`.

## API

- `GET /api/v1/health`
- `GET /api/v1/trainers`, `GET /api/v1/trainers/{slug}`
- `GET /api/v1/schedule`, `GET /api/v1/availability`
- `GET/POST /api/v1/bookings`
- `GET /api/v1/bookings/{id}`
- `POST /api/v1/bookings/{id}/cancel`
- `GET /api/v1/profile`
- `GET /api/v1/memberships/current`
- `GET/POST /api/v1/measurements`
- `GET/POST /api/v1/admin/bookings`
- `GET/POST/DELETE /api/v1/admin/booking-blocks`
- `GET/PATCH /api/v1/admin/settings`

## Development authentication

До production auth backend использует только фиксированные server-side seeded identities: Алексей для client endpoints и отдельный seeded administrator для `/admin`. Frontend не передаёт и не выбирает `user_id`; body с произвольным `user_id` API не принимает. В `APP_ENV=production` development auth отключается и запросы требуют будущий production auth adapter.

## Seed

Команда `python -m app.scripts.seed` создаёт фиксированный, повторяемый набор:

- Алексей и development administrator;
- Дима и Ваня с данными из SPEC.md;
- тип абонемента и абонемент Алексея;
- `gym_capacity=8` и остальные gym settings;
- расписание на фиксированную демонстрационную неделю;
- завершённые посещения, будущую запись и измерения.

Seed использует стабильные UUID и upsert-подобные проверки, не запускается автоматически при старте API и отделён от Alembic migrations.

## Frontend integration

- `src/api/client.ts` — base URL, development auth boundary и нормализация ошибок.
- Domain modules: `home.ts`, `schedule.ts`, `trainers.ts`, `bookings.ts`, `profile.ts`, `progress.ts`, `admin.ts`.
- TanStack Query получает все данные через HTTP.
- BookingContext сохраняется только как UI feedback layer; server state и bookings больше не хранятся в reducer.
- После create/cancel mutations инвалидируются `home`, `schedule`, `bookings`, `profile` и `admin` queries.
- Backend error codes преобразуются в естественные русские сообщения.

## Tests и verification

- Repository/service tests на временной SQLite database.
- API tests для основных endpoints.
- Настоящий concurrent test с двумя потоками и двумя независимыми соединениями на последнее место.
- Миграция, seed, server restart persistence, OpenAPI и health.
- Frontend build/lint и browser-flow через работающий API/SQLite.

## Следующая итерация

- Production authentication: phone OTP или email magic link.
- Reverse proxy и Linux service unit.
- PostgreSQL migration при фактической необходимости; service layer и API contracts сохраняются.
- Уведомления, расширенные роли тренера и production monitoring.
