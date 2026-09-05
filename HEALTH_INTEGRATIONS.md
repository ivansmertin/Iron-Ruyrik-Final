# Архитектура и сквозная реализация интеграции данных здоровья («Железный Рюрик»)

## 1. Обзор сквозной архитектуры

Система интеграции данных здоровья спортивного клуба «Железный Рюрик» реализована по сквозной модульной схеме без моков и без изменения базового стека веб-приложения (React 19 + TypeScript + Vite). Приложение упаковано в нативный мобильный контейнер Capacitor 8 с реальными плагинами для **Apple Health (HealthKit)** на iOS и **Android Health Connect** на Android.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ФИЗИЧЕСКИЕ УСТРОЙСТВА                            │
│  Xiaomi Body Scale S400  │  Apple Watch Ultra  │  Samsung Galaxy Watch / Fit│
└──────────────────────┬───────────────────────────────┬──────────────────────┘
                       │                               │
                       ▼                               ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────────┐
│        ПРИЛОЖЕНИЯ-ДОНОРЫ         │   │          ПРИЛОЖЕНИЯ-ДОНОРЫ           │
│  Mi Fitness (com.xiaomi.wearable)│   │  Mi Fitness / Samsung Health / Zepp  │
│  Zepp Life (com.xiaomi.hm.health)│   │  (com.xiaomi.wearable / shealth)     │
└──────────────────────┬───────────┘   └───────────────────┬──────────────────┘
                       │ (Bluetooth Sync)                  │ (Health Sync)
                       ▼                                   ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────────┐
│     Apple Health (HealthKit)     │   │     Android Health Connect Client    │
│  - HKQuantityType: bodyMass      │   │  - WeightRecord                      │
│  - HKQuantityType: bodyFat%      │   │  - BodyFatRecord                     │
│  - HKQuantityType: leanBodyMass  │   │  - LeanBodyMassRecord                │
│  - Entitlement: healthkit = true │   │  - Permission: START_VIEW_USAGE      │
└──────────────────────┬───────────┘   └───────────────────┬──────────────────┘
                       │                                   │
                       ▼                                   ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────────┐
│     HealthKitPlugin.swift        │   │       HealthConnectPlugin.kt         │
│  (Capacitor Native Plugin)       │   │     (Capacitor Native Plugin)        │
│  - HKSampleQuery                 │   │  - ReadRecordsRequest                │
│  - sourceRevision bundleId       │   │  - dataOrigin.packageName            │
│  - device name & model           │   │  - device metadata                   │
└──────────────────────┬───────────┘   └───────────────────┬──────────────────┘
                       │                                   │
                       └───────────────────┬───────────────┘
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    JavaScript Native Bridge (healthBridge.ts)               │
│  - registerPlugin<NativeHealthBridgePlugin>('NativeHealthBridge')           │
│  - Запрос разрешений по принципу Least Privilege (Read-Only)                │
│  - Очередь отложенной синхронизации при обрыве сети (Offline Queue)         │
│  - Нулевое логирование значений замеров (Privacy by Design)                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ POST /api/v1/health/measurements/import
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Backend Ingestion (HealthService)                     │
│  - Source Mapping: bundle ID / package name -> Xiaomi / Garmin / Samsung    │
│  - Normalization: kg, percent, UTC ISO-8601                                 │
│  - Deduplication: Exact source_record_id + Temporal Window (±120s, Δ<=0.05) │
│  - Manual Protection: пользовательские замеры защищены от перезаписи        │
│  - Incremental Cursor: sync_cursor в health_sync_connections                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 UI «Мой прогресс» (ProgressPage & Modal)                    │
│  - Карточки текущих показателей с бейджами источников (Xiaomi, Apple, Ручной│
│  - График динамики со спарклайнами и тултипами provenance                   │
│  - Модальное окно «Источники данных» с ручной синхронизацией и настройками   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Нативный слой (Native Shell & Plugins)

### 2.1. Конфигурация Capacitor (`capacitor.config.ts`)
- **App ID**: `ru.ironryrik.app`
- **App Name**: `Железный Рюрик`
- **Web Directory**: `dist`
- **Платформы**: iOS (`ios/App`) и Android (`android/app`)

### 2.2. iOS HealthKit (`ios/App/App/`)
1. **Entitlements** (`App.entitlements`):
   ```xml
   <key>com.apple.developer.healthkit</key>
   <true/>
   <key>com.apple.developer.healthkit.access</key>
   <array/>
   ```
2. **Разрешения в Info.plist**:
   - `NSHealthShareUsageDescription`: «Приложению «Железный Рюрик» необходим доступ к чтению веса, процента жира и мышечной массы для отображения вашего спортивного прогресса.»
   - Принцип **Least Privilege**: ключ `NSHealthUpdateUsageDescription` намеренно **отсутствует**, приложение запрашивает доступ строго на чтение (`toShare: nil`).
3. **Реализация плагина** (`HealthKitPlugin.swift`):
   - Экспортирует JS-мост `NativeHealthBridge`.
   - Запрашивает `HKQuantityType`: `bodyMass`, `bodyFatPercentage`, `leanBodyMass`.
   - Читает сэмплы через `HKSampleQuery` с предикатом по диапазону дат (`sinceDays` / `since`).
   - Извлекает метаданные происхождения: `sample.sourceRevision.source.bundleIdentifier`, `sample.device.name`, `sample.device.model`, `sample.device.manufacturer`.
   - Конвертирует процент жира из долей (`0.0..1.0`) в проценты (`0..100%`).
   - Предоставляет метод открытия настроек iOS `openSystemHealthSettings`.

### 2.3. Android Health Connect (`android/app/`)
1. **Манифест** (`AndroidManifest.xml`):
   - Разрешения на чтение:
     ```xml
     <uses-permission android:name="android.permission.health.READ_WEIGHT" />
     <uses-permission android:name="android.permission.health.READ_BODY_FAT" />
     <uses-permission android:name="android.permission.health.READ_LEAN_BODY_MASS" />
     ```
   - Запросы пакета Health Connect:
     ```xml
     <queries>
         <package android:name="com.google.android.apps.healthdata" />
         <intent>
             <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
         </intent>
     </queries>
     ```
   - Activity Alias для диалога объяснения разрешений:
     ```xml
     <activity-alias
         android:name="ViewPermissionUsageActivity"
         android:exported="true"
         android:targetActivity=".MainActivity"
         android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
         <intent-filter>
             <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
         </intent-filter>
     </activity-alias>
     ```
2. **Зависимости** (`build.gradle`):
   - `androidx.health.connect:connect-client:1.1.0-alpha11`
   - `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0`
3. **Реализация плагина** (`HealthConnectPlugin.kt`):
   - Проверяет статус SDK через `HealthConnectClient.getSdkStatus(context)` (`SDK_AVAILABLE`, `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED`).
   - Запрашивает разрешения через официальный контракт `PermissionController.createRequestPermissionResultContract()`.
   - Читает `WeightRecord`, `BodyFatRecord`, `LeanBodyMassRecord` через корутины.
   - Извлекает метаданные: `record.metadata.dataOrigin.packageName`, `record.metadata.id`, `record.metadata.device`.
   - Поддерживает безопасный переход в настройки Health Connect через `ACTION_HEALTH_CONNECT_SETTINGS` с откатом к `ACTION_APPLICATION_DETAILS_SETTINGS`.

---

## 3. Таблица валидации устройств экосистемы Xiaomi

Умные весы Xiaomi (включая популярные линейки Mi Body Composition Scale 2 и Xiaomi Body Composition Scale S400) не имеют открытого прямого облачного REST API для сторонних фитнес-клубов. Их интеграция строится через экосистемные приложения-агрегаторы:

| Линейка устройств | Экосистемное приложение | Канал доставки на iOS | Канал доставки на Android | Определяемый Bundle ID / Package | Поддерживаемые метрики в клубе | Ограничения и особенности |
|---|---|---|---|---|---|---|
| **Xiaomi Smart Scale 2** | Mi Fitness (Xiaomi Wear) / Zepp Life | Apple Health (HealthKit) | Android Health Connect | `com.xiaomi.wearable`<br>`com.xiaomi.hm.health` | Вес (`weight`) | Только вес; биоимпеданс отсутствует в базовой модели |
| **Mi Body Composition Scale 2** | Mi Fitness / Zepp Life | Apple Health (HealthKit) | Android Health Connect | `com.xiaomi.wearable`<br>`com.xiaomi.hm.health` | Вес (`weight`),<br>Жир (`body_fat_percentage`),<br>Безжировая масса (`lean_body_mass`) | Синхронизируется при взвешивании босиком; требуется включение синхронизации в настройках Mi Fitness |
| **Xiaomi Scale S400** | Mi Fitness | Apple Health (HealthKit) | Android Health Connect | `com.xiaomi.wearable` | Вес (`weight`),<br>Жир (`body_fat_percentage`),<br>Мышечная масса (`lean_body_mass`) | Двухчастотный биоимпеданс S400 передает в агрегатор стандартные показатели состава тела; расширенные клинические индексы остаются внутри Mi Fitness |
| **Amazfit / Zepp Scales** | Zepp (бывший Amazfit) | Apple Health (HealthKit) | Android Health Connect | `com.huami.midong`<br>`com.huami.watch.hmwatchmanager` | Вес (`weight`),<br>Жир (`body_fat_percentage`),<br>Безжировая масса (`lean_body_mass`) | Пакет Huami сопоставляется с провайдером Xiaomi/Zepp в правилах маппинга |

### Маппинг пакетов (`source_mapping.py`):
```python
BUNDLE_TO_PROVIDER = {
    # Xiaomi / Huami / Zepp
    "com.xiaomi.wearable": HealthSourceProvider.XIAOMI,
    "com.xiaomi.hm.health": HealthSourceProvider.XIAOMI,
    "com.huami.midong": HealthSourceProvider.XIAOMI,
    # Garmin
    "com.garmin.connect": HealthSourceProvider.GARMIN,
    "com.garmin.connectmobile": HealthSourceProvider.GARMIN,
    # Samsung Health
    "com.sec.android.app.shealth": HealthSourceProvider.SAMSUNG_HEALTH,
    # Withings
    "com.withings.wiscale2": HealthSourceProvider.WITHINGS,
}
```

---

## 4. Пайплайн пакетного импорта и защита ручных данных

### 4.1. Схема пакетного запроса (`POST /api/v1/health/measurements/import`)
```json
{
  "provider": "apple_health",
  "sync_cursor": "2026-09-05T14:30:00Z",
  "records": [
    {
      "source_record_id": "9B7B9E26-D0FE-4C81-A5F2-2244B2EF312A",
      "metric_type": "weight",
      "value": 78.4,
      "unit": "kg",
      "measured_at": "2026-09-05T08:15:00Z",
      "source_app": "com.xiaomi.wearable",
      "source_device": "Xiaomi Body Composition Scale S400",
      "origin_platform": "ios"
    }
  ]
}
```

### 4.2. Алгоритм дедупликации и идемпотентности
1. **Точная дедупликация (External ID Matching)**:
   - Проверяется ключ `(user_id, source_provider, source_record_id)`.
   - Если запись существует:
     - Если измеренное значение и время совпадают — запись пропускается как дубликат (`duplicates_count += 1`).
     - Если данные обновились — запись обновляется без создания дублирующего ID.
2. **Временное квантование (Temporal Fingerprint Fallback)**:
   - Если `source_record_id` отсутствует или передан от другого провайдера, система ищет существующие замеры того же показателя в окне $\pm 120$ секунд со значением, совпадающим в пределах погрешности ($\Delta \le 0.05$ кг для веса, $\Delta \le 0.1\%$ для жира).
3. **Защита ручных замеров (Manual Non-Overwrite Guarantee)**:
   - Если кандидат на дедупликацию совпадает по времени и значению с существующей ручной записью (`source_provider == 'manual'`), **автоматический импорт не затирает и не удаляет ручной замер**.
   - Ручной замер сохраняет наивысший суверенитет пользователя.
4. **Изоляция частичных сбоев (Partial Failure Isolation)**:
   - Сбой в обработке одной записи из пачки (например, недопустимое отрицательное значение веса или невалидная дата) изолируется:
   - Запись фиксируется в массиве `errors: [{ index: 3, source_record_id: "...", error: "..." }]`.
   - Валидные записи успешно сохраняются в БД.
5. **Сохранение курсора (`sync_cursor`)**:
   - При успешном завершении пачки поле `sync_cursor` обновляется в записи `HealthSyncConnection`, предотвращая повторную передачу всего исторического архива в будущих сессиях.

---

## 5. Типизированная модель ошибок (`HealthBridgeErrorCode`)

Фронтенд и мобильный мост работают со строгой системой категорий ошибок:

| Код ошибки | Описание | Поведение интерфейса |
|---|---|---|
| `UNAVAILABLE` | Служба здоровья недоступна на данном устройстве (например, планшет без HealthKit или запуск в Safari) | Показывается предупреждение с предложением вести ручные замеры или собрать нативное приложение |
| `UPDATE_REQUIRED` | Служба Google Health Connect требует обновления или установки из Google Play | Кнопка действия «Обновить Health Connect» с переходом в системный маркет |
| `PERMISSION_DENIED` | Пользователь отклонил системный запрос прав | Баннер «Доступ ограничен» и кнопка прямого перехода в системные «Настройки» |
| `NOT_DETERMINED` | Разрешения еще не запрашивались | Отображение карточки объяснения Least Privilege и кнопка «Разрешить доступ» |
| `TIMEOUT` | Таймаут ответа системного хранилища здоровья | Кнопка «Повторить синхронизацию» с экспоненциальным backoff |
| `NETWORK_OFFLINE` | Сеть недоступна во время отправки данных на бэкенд | Данные помещаются в `localStorage (iron_ryrik_offline_health_queue)` и автоматически отправляются при восстановлении связи (`navigator.onLine`) |
| `IMPORT_FAILED` | Ошибка валидации на бэкенде | Отображение информативного сообщения с сохранением целостности БД |

---

## 6. Чек-лист тестирования на физических устройствах

### 6.1. Тестирование на реальном iPhone (iOS 17+)
1. **Подготовка сборки**:
   - Выполнить `npm run build` и `npx cap sync ios`.
   - Открыть `ios/App/App.xcworkspace` в Xcode.
   - В разделе *Signing & Capabilities* выбрать ваш *Development Team* (убедиться, что capability *HealthKit* активна).
   - Подключить iPhone кабелем и запустить сборку (*Cmd + R*).
2. **Проверка прав Least Privilege**:
   - Открыть экран «Мой прогресс» $\rightarrow$ «Источники».
   - Нажать «Подключить» у Apple Health.
   - Проверить появление карточки клуба с объяснением запрашиваемых прав.
   - Нажать «Разрешить доступ» $\rightarrow$ проверить появление системного модального окна iOS HealthKit.
   - Убедиться, что в окне запрашиваются только переключатели: *Масса тела*, *Процент жира в организме*, *Безжировая масса тела* (только чтение, без секции «Разрешить запись»).
3. **Проверка синхронизации замеров**:
   - Открыть стандартное приложение «Здоровье» на iPhone.
   - Добавить замер веса (например, `79.2 кг`) и жира (`15.2%`). Либо выполнить реальное взвешивание на весах Xiaomi через Mi Fitness.
   - Вернуться в приложение «Железный Рюрик», нажать кнопку «Синхронизировать» (иконка обновления).
   - Проверить статус: `Синхронизация завершена: +2 новых измерения`.
   - Проверить обновление карточки веса и добавление точки на спарклайн с provenance-подписью `Apple Health` (или `Xiaomi`).
4. **Проверка идемпотентности**:
   - Нажать кнопку «Синхронизировать» еще 3-4 раза подряд.
   - Убедиться, что количество записей в истории и на графике не удвоилось (`Данные актуальны: новых измерений нет`).
5. **Проверка отзыва разрешений**:
   - Открыть «Настройки» iPhone $\rightarrow$ «Здоровье» $\rightarrow$ «Доступ к данным и устройства» $\rightarrow$ «Железный Рюрик» $\rightarrow$ выключить все тумблеры.
   - Вернуться в приложение $\rightarrow$ нажать «Синхронизировать» $\rightarrow$ проверить корректную обработку и переход в настройки по кнопке шестеренки.

### 6.2. Тестирование на реальном Android-устройстве (Android 14+)
1. **Подготовка сборки**:
   - Выполнить `npm run build` и `npx cap sync android`.
   - Открыть проект `android` в Android Studio.
   - Подключить Android-смартфон по USB с включенной «Отладкой по USB».
   - Запустить приложение на устройстве.
2. **Проверка службы Health Connect**:
   - На Android 14 Health Connect встроен в систему (*Настройки* $\rightarrow$ *Безопасность и конфиденциальность* $\rightarrow$ *Health Connect*).
   - На Android 13 и ниже убедиться, что приложение Google Health Connect установлено из Play Store.
3. **Проверка авторизации**:
   - В приложении открыть «Источники данных» $\rightarrow$ Health Connect $\rightarrow$ «Подключить».
   - Проверить появление системного диалога Health Connect Permissions.
   - Выбрать «Разрешить все» (или только «Вес»).
   - Убедиться, что при частичном выборе приложение корректно отображает статус: `Частичный доступ (weight)`.
4. **Проверка офлайн-очереди**:
   - Включить «Режим полета» на смартфоне.
   - Выполнить замер и нажать «Синхронизировать».
   - Проверить баннер: `Отсутствует интернет-соединение. Записи сохранены в локальную очередь`.
   - Отключить режим полета.
   - Запустить повторную синхронизацию $\rightarrow$ убедиться, что отложенная очередь успешно отправлена на бэкенд и сохранена.
5. **Проверка неразрушающего отключения**:
   - В модалке нажать «Отключить».
   - Прочитать предупреждение о сохранении исторических замеров.
   - Подтвердить отключение.
   - Проверить экран «Мой прогресс»: ранее импортированные точки графика и карточки сохранены в профиле.

---

## 7. Результаты валидации качества кодовой базы

- **Backend Pytest**: `23/23 passed` (100% успех: дедупликация, 5-кратная идемпотентность, защита ручных замеров, изоляция частичных сбоев, маппинг Xiaomi/Garmin/Samsung).
- **Frontend Lint**: `eslint .` выполнен с кодом `0` (0 ошибок, 0 предупреждений).
- **Frontend Build**: `tsc -b && vite build` выполнен за 1.51s, сгенерирован production-бандл.
- **Capacitor Sync**: `npx cap sync` синхронизировал веб-директорию `dist/` с нативными проектами `ios/App` и `android/app`.
