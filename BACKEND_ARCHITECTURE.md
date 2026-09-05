# Backend architecture

## Общая схема

Backend «Железного Рюрика» — один FastAPI-процесс и одна SQL database. Для текущего размера клуба SQLite является production database, а не временным mock-хранилищем.

```text
backend/app/api           HTTP routing и dependencies
backend/app/schemas       Pydantic request/response contracts
backend/app/models        SQLAlchemy persistence models
backend/app/repositories  database queries
backend/app/services      booking и application business rules
backend/app/scripts       seed и backup CLI
backend/migrations        Alembic revisions
backend/tests             service, API и concurrency tests
data/                     SQLite database file
backups/                  timestamped SQLite backups
```

## SQLite connection policy

Каждое соединение получает:

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
```

`foreign_keys` проверяется integration test-ом. WAL позволяет readers работать параллельно с writer, а `busy_timeout` даёт конкурирующему writer время дождаться текущей короткой транзакции.

## Booking transaction

Для SQLite операция создания записи выполняет `BEGIN IMMEDIATE` первым statement. Это получает reserved write lock до чтения текущего состояния. Затем в одной транзакции:

1. читаются `app_settings`;
2. проверяется `booking_blocks`;
3. проверяется занятость выбранного тренера;
4. загружаются активные пересекающиеся bookings;
5. sweep-line алгоритм вычисляет пик одновременного присутствия вместе с новой записью;
6. выполняется INSERT и COMMIT.

Если пик превышает `gym_capacity`, транзакция откатывается с domain exception, API возвращает HTTP 409 и `GYM_CAPACITY_REACHED`.

Для PostgreSQL repository сможет заменить SQLite lock на transaction + advisory lock или serializable/row-lock strategy. Service rules, schemas и endpoints при этом не меняются.

## Interval semantics

Все интервалы полуоткрытые: `[start_at, end_at)`. Пересечение существует, если:

```text
existing.start_at < candidate.end_at
AND existing.end_at > candidate.start_at
```

Отменённые записи вместимость и trainer collision не учитывают.

## Timezone

Business timezone: `Europe/Moscow`. API принимает только timezone-aware ISO 8601 datetime. Перед записью значения переводятся в UTC.

SQLite хранит UTC timestamps как `DATETIME`; SQLAlchemy `UTCDateTime` удаляет offset только после перевода в UTC и восстанавливает `tzinfo=UTC` при чтении. Поэтому бизнес-логика не зависит от timezone операционной системы. На границе frontend данные форматируются в `Europe/Moscow`.

## Migrations

Schema управляется Alembic:

```bash
cd backend
alembic upgrade head
```

`Base.metadata.create_all()` не используется при обычном запуске или production setup. В тестах schema также поднимается Alembic migration-ами.

## Development auth boundary

Development auth возвращает фиксированный seeded user id из server config. Клиент не передаёт `user_id` в create booking/measurement requests. Admin endpoints используют отдельный фиксированный admin identity и проверяют роль. При `APP_ENV=production` этот механизм отключён.

## Backup и restore

`python -m app.scripts.backup` использует `sqlite3.Connection.backup()`, которая создаёт согласованный snapshot активной WAL database. Простое копирование `.db` при работающем приложении не используется.

Восстановление выполняется при остановленном backend: проверить backup, сохранить текущий database file отдельно, заменить файл восстановленной копией и запустить `alembic upgrade head`.

## PostgreSQL migration path

Зависимости от dialect изолированы в database setup и transaction policy. Repository API работает через SQLAlchemy expressions, модели не используют SQLite-only JSON/functions, timestamps нормализованы, бизнес-правила находятся в services. При миграции потребуется новый `DATABASE_URL`, PostgreSQL driver и PostgreSQL transaction lock implementation; frontend и service contracts останутся прежними.
