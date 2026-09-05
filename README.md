# Железный Рюрик

Production-oriented приложение частного тренажёрного зала «Железный Рюрик» в Великом Новгороде. React-интерфейс работает с собственным FastAPI backend и постоянной SQLite database: расписание, запись и отмена, вместимость, тренеры, абонемент, история, измерения и компактная админ-панель больше не зависят от mock state.

## Stack

- React 19, TypeScript strict, Vite, React Router, TanStack Query;
- собственная CSS-система и Lucide icons;
- Python 3.12+, FastAPI, Pydantic v2;
- SQLAlchemy 2.x и repository/service layers;
- Alembic migrations;
- SQLite в WAL mode с foreign keys и безопасными online backups.

Supabase, Firebase и другие BaaS не используются.

## Первый запуск

Backend (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m app.scripts.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend в другом терминале:

```powershell
npm install
npm run dev
```

Vite проксирует `/api` на `http://127.0.0.1:8000`. OpenAPI доступен по адресу `http://127.0.0.1:8000/api/docs`, health check — `/api/v1/health`.

## Проверки

```powershell
cd backend
.\.venv\Scripts\python -m pytest --basetemp=.pytest_temp

cd ..
npm run build
npm run lint
```

Backend suite включает реальный двухпоточный race-тест последнего места с независимыми соединениями SQLite.

## Основные routes

- `/` — главная;
- `/schedule` — расписание и выбор времени;
- `/booking/:id` — подтверждение или отмена;
- `/trainers`, `/trainers/dima`, `/trainers/vanya` — тренеры;
- `/progress` — измерения;
- `/profile` — профиль, абонемент и история;
- `/admin` — управление записями, блокировками и вместимостью;
- неизвестный адрес — 404.

REST API имеет префикс `/api/v1`; полный список зафиксирован в [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Структура

```text
backend/
  app/api/           HTTP endpoints и dev-auth dependencies
  app/models/        SQLAlchemy models
  app/schemas/       Pydantic contracts
  app/repositories/  доступ к данным
  app/services/      бизнес-правила и транзакции
  app/scripts/       seed и backup
  migrations/        Alembic revisions
  tests/             booking/concurrency tests
data/                SQLite database file (не коммитится)
src/
  api/               единый HTTP client, domain API modules, mappers
  components/        общие UI-компоненты
  features/          локальное UI-состояние
  pages/             route-level экраны
  styles/            tokens и responsive CSS
  types/             TypeScript domain types
```

## Configuration и временная dev-auth

Скопируйте `.env.example` в `.env`, если нужны нестандартные значения. `DATABASE_URL` задаётся относительным URL, production origins — через `FRONTEND_ORIGINS`.

В development API использует две фиксированные server-side seeded identity: Алексея и администратора. Frontend не передаёт `user_id`. Это только временная граница до собственной production-аутентификации; при `APP_ENV=production` dev-auth не работает и API возвращает `401 AUTH_REQUIRED`.

## Seed, database и backup

`python -m app.scripts.seed` безопасно повторяем и не запускается автоматически. Схема меняется только через `python -m alembic upgrade head`; `create_all()` в production path не используется.

Согласованный backup активной WAL database:

```powershell
cd backend
.\.venv\Scripts\python -m app.scripts.backup
```

Файл появится в `backups/zhelezny_ryurik_YYYY-MM-DD_HHMMSS.db`. Для восстановления остановите backend, сохраните текущий `data/zhelezny_ryurik.db`, замените его проверенной копией, затем выполните `alembic upgrade head` и запустите API.

## Production topology

На Linux VPS рекомендуется обслуживать Vite static build и `/api` через Nginx или Caddy. Uvicorn слушает только `127.0.0.1:8000` и не выставляется напрямую в интернет. SQLite-файл и backups должны находиться на постоянном диске с отдельной политикой резервного копирования.

## Следующий этап

- собственная production-auth с сессиями и rate limiting;
- Nginx/Caddy и systemd unit;
- production monitoring и регулярный backup schedule;
- уведомления;
- миграция на PostgreSQL только при реальной нагрузке — API и service layer для этого уже отделены от DAL.

Подробности: [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [SPEC.md](SPEC.md).
