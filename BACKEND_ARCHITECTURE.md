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

## SQLite connection policy & lifecycle

Каждое соединение SQLite в приложении конфигурируется с параметрами:

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
PRAGMA synchronous=FULL;
```

- `journal_mode=WAL`: позволяет concurrent readers не блокировать writer, а writer не блокировать readers.
- `foreign_keys=ON`: гарантирует ссылочную целостность связей между таблицами на уровне СУБД (проверяется integration test-ами).
- `busy_timeout=5000`: задаёт таймаут ожидания освобождения базы при конкурентных транзакциях (5 секунд), предотвращая `sqlite3.OperationalError: database is locked`.
- `synchronous=FULL`: подтверждённые транзакции синхронизируются на диск, чтобы не терять последние бронирования при сбое питания или ОС.

### Database Path Resolution & Docker Volumes

Путь к базе данных вычисляется централизованно в `app/config.py`:
- `resolved_database_url`: преобразует относительные пути относительно базовой директории приложения (`backend/`), формирует корректный абсолютный SQLite URL для текущей ОС и поддерживает `:memory:`.
- **Автосоздание директории**: перед инициализацией движка вызывается `parent.mkdir(parents=True, exist_ok=True)`, что предотвращает ошибки отсутствия каталога `data/`.
- **Обязательность Docker Volume**: в контейнере SQLite-файл располагается в `/app/data/zhelezny_ryurik.db`. Директории `/app/data` и `/app/backups` объявлены как `VOLUME` в Dockerfile и примонтированы в `docker-compose.yml` (`./data:/app/data`, `./backups:/app/backups`). Без монтирования томов данные зала будут безвозвратно уничтожены при пересоздании контейнера (`docker compose down && docker compose up`).

## Startup & Fail-Fast Health Checks

При запуске приложения в асинхронном `lifespan`:
1. Создаётся SQLAlchemy engine с пулом соединений и настройками SQLite.
2. Проверяется точное совпадение записей `alembic_version` с packaged Alembic heads. Немигрированная или устаревшая schema останавливает startup.
3. На время работы удерживается advisory lock, поэтому restore не может выполняться параллельно с backend на Windows или Linux.
4. При остановке приложения (`shutdown`) sync engine диспозится, закрывая соединения и освобождая lock.

## Bootstrap vs Seed Strategy

- **`bootstrap.py` (`python -m app.scripts.bootstrap`)**:
  - Идемпотентный системный бутстрап для production и Docker.
  - Проверяет и создаёт только обязательные системные настройки (`AppSetting(id=1)`: вместимость зала, шаг слота, окно бронирования).
  - **НЕ создаёт** тестовых пользователей, демо-клиентов и фиктивных бронирований.
  - Безопасен для многократного выполнения при каждом запуске контейнера в Docker CMD.
- **`seed_dev.py` / `seed.py` (`python -m app.scripts.seed_dev`)**:
  - Предназначен **исключительно** для локальной разработки и ручного тестирования.
  - Заполняет базу демо-тренерами, тестовым клиентом Алексеем, демо-бронированиями и новостями.
  - Никогда не запускается в production и исключён из Docker CMD.

## Migrations

Schema управляется строго через Alembic:

```bash
cd backend
alembic upgrade head
```

- Вектор миграций строго линеен; drift между моделями SQLAlchemy и схемой БД контролируется через `alembic check` (exit code 0 в CI/тестах).
- `Base.metadata.create_all()` **не используется** ни в production, ни в тестах — схема всегда разворачивается через `alembic upgrade head`.
- В Docker запуск миграций выполняется автоматически перед стартом сервера: `alembic upgrade head && python -m app.scripts.bootstrap && exec uvicorn ...`.

## Development auth boundary

Development auth возвращает фиксированный seeded user id из server config. Клиент не передаёт `user_id` в create booking/measurement requests. Admin endpoints используют отдельный фиксированный admin identity и проверяют роль. При `APP_ENV=production` этот механизм отключён (`DEV_AUTH_ENABLED=false`).

## Backup и restore

### Резервное копирование (`python -m app.scripts.backup`)
1. Использует официальный SQLite Online Backup API (`sqlite3.Connection.backup()`).
2. Создаёт консистентный, бинарно целостный snapshot даже при активных транзакциях и WAL-файле.
3. Имя файла формируется с меткой времени `zhelezny_ryurik_YYYY-MM-DD_HHMMSS.db` в директории `backups/`, исключая перезапись предыдущих бэкапов.
4. Сразу после создания скрипт проводит валидацию:
   - `PRAGMA integrity_check` (должен вернуть `ok`);
   - проверка наличия таблицы `alembic_version` и актуальности ревизии;
   - подсчёт количества записей в таблицах.
5. Соединения открываются и закрываются строго с `try ... finally: conn.close()` во избежание блокировок файлов на Windows/Linux.

### Восстановление (`python -m app.scripts.restore <path_to_backup> --confirm`)
1. Выполняется в режиме cold restore (backend остановлен).
2. Требует обязательный флаг подтверждения `--confirm` для защиты от случайной перезаписи.
3. Проводит pre-flight валидацию файла бэкапа (`PRAGMA integrity_check` и проверка `alembic_version`).
4. Автоматически создаёт WAL-aware предохранительный snapshot текущей базы (`pre_restore_YYYYMMDD_HHMMSS.db`) перед внесением любых изменений.
5. **Очистка stale WAL**: перед копированием удаляет ассоциированные файлы журнала (`.db-wal` и `.db-shm`), предотвращая воспроизведение устаревших WAL-фреймов поверх восстановленной базы.
6. Атомарно заменяет целевую БД заранее проверенным staging-файлом и повторно проверяет восстановленный файл.

## PostgreSQL migration path

Зависимости от dialect изолированы в database setup и transaction policy. Repository API работает через SQLAlchemy expressions, модели не используют SQLite-only JSON/functions, timestamps нормализованы, бизнес-правила находятся в services. При миграции потребуется новый `DATABASE_URL`, PostgreSQL driver и PostgreSQL transaction lock implementation; frontend и service contracts останутся прежними.

## Test infrastructure & database isolation

- **Application Factory**: FastAPI приложение создаётся через фабрику `create_app(settings=..., session_factory=...)` с async lifespan для корректного владения и teardown ресурсов. Экземпляр `app` экспортируется на уровне модуля для ASGI-серверов.
- **Lazy Database Initialization**: SQLAlchemy `engine` и `sessionmaker` не создаются при импорте модулей. Engine конкретного приложения создаётся при старте lifespan и освобождается при shutdown.
- **Dependency Injection**: `get_session` и auth dependencies получают session factory и settings из `request.app.state`. Тестовый `create_app` принимает ту же session factory, что используют fixtures; `dependency_overrides` для подмены БД не требуется.
- **Изоляция dev/prod окружения**: Тесты не обращаются к dev базе данных (`data/zhelezny_ryurik.db`) и не модифицируют её.
- **Alembic в тестах**: Схема тестовой базы поднимается через программно переданный URL и `alembic upgrade head`, без изменения process environment; модели синхронизированы по типам и длинам полей (`alembic check`).
