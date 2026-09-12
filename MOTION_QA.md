# Motion QA — «Железный Рюрик»

Дата финального прохода: 2026-09-12.

## Implemented motion system

Motion построен на токенах из `src/styles/motion.css` и синхронных числовых значениях из `src/utils/motion.ts`.

| Категория | Длительность | Назначение |
| --- | ---: | --- |
| direct press | 90 ms | мгновенный физический отклик на касание |
| micro | 120 ms | цвет, рамка, иконка, точка графика |
| UI fast | 180 ms | selection-текст, сегменты, switch thumb |
| UI | 220 ms | moving selection surface, nav indicator, numeric update |
| page fast | 280 ms | modal enter |
| page | 340 ms | parent/detail shared-element relationship |
| reveal fast | 380 ms | резерв для содержательного data reveal |
| reveal | 480 ms | резерв для крупного содержательного resolve |
| loop | 900 ms | только indeterminate progress |

Кривые унифицированы: `standard`, `enter`, `exit`, `emphasized`, `direct`. Bounce/spring-кривых нет. `transition: all`, локальных `.15s ease` и независимых magic-duration в CSS нет.

### Motion inventory

| Location | Trigger | Duration | Easing | Purpose / что объясняет пользователю |
| --- | --- | ---: | --- | --- |
| `::view-transition-old/new(root)` | переход между связанными list/detail экранами | 220 ms | standard | показывает замену текущего экрана; не используется для нижних sibling-tabs |
| `hero-slot-time` в Home/Schedule → Booking | открытие или возврат из деталей слота | 340 ms | emphasized | сохраняет идентичность выбранного времени между списком и деталями |
| `trainer-avatar-*`, `trainer-name-*` | Trainers ↔ Trainer | 340 ms | emphasized | связывает выбранного тренера с его профилем |
| `.button--submitting::after` | booking API pending | 900 ms loop | linear | сообщает, что подтверждение ещё обрабатывается; движется только `transform` |
| `.modal-backdrop` | открытие любого modal | 280 ms | enter | отделяет modal-контекст от экрана |
| `.modal`, `.modal-content` | открытие любого modal | 280 ms | emphasized | показывает появление одного foreground-контекста; 14 px, без bounce |
| `.mobile-nav__indicator` | смена основной вкладки | 220 ms | emphasized | подтверждает новую активную вкладку; page content меняется сразу |
| `.date-strip__selection-surface` | выбор дня | 220 ms | emphasized | сохраняет положение selection при быстрой смене дня |
| date labels | выбор дня | 180 ms | standard | поддерживает moving surface изменением контраста |
| booking option surface/radio | выбор формата или тренера | 220/180 ms | emphasized/standard | подтверждает единственный выбранный radio-state; checkmark появляется сразу |
| chart period surface/labels | выбор периода | 220/180 ms | emphasized/standard | подтверждает период; данные графика обновляются сразу и не блокируют следующий tap |
| `.line-chart__guide` | выбор точки графика | 120 ms | enter | связывает выбранное измерение с осью; tooltip сразу следует за tap |
| `.line-chart__dot` | focus/selection точки | 120 ms | standard | показывает активную точку без morph всей геометрии |
| `.chart-data-disclosure__btn` | клик по кнопке раскрытия таблицы замеров | 90 ms | direct | мгновенный тактильный отклик; блок таблицы `<div className="chart-data-disclosure">` появляется сразу без разворачивающей height-анимации |
| `.source-item__sync-bar` | Health sync pending | 900 ms loop | linear | показывает, какой конкретно источник синхронизируется |
| `.spin-icon`, `.spin-animation` | save/connect/sync pending | 900 ms loop | linear | сообщает о незавершённой async-операции |
| `.time-digit-flip` | реальное изменение ближайшего времени из fresh data | 180 ms | enter | делает замену времени заметной без layout-shift |
| `useCountUp` | реальное изменение сохранённого веса | 220 ms | cubic ease-out | показывает направление обновления значения; не запускается при первом неизвестном значении |
| buttons, nav items, cards, rows | pointer down | 90 ms | direct | подтверждает захват касания до navigation/API |
| links, borders, cards, inputs | hover/focus/selection | 120–220 ms | standard | подтверждает интерактивное или выбранное состояние без spatial motion |
| capacity status/segments | fresh capacity data | 180/220 ms | emphasized/standard | показывает изменившуюся загрузку; обычно меняется один сегмент |
| profile/integration switches | toggle | 180/220 ms | emphasized | показывает бинарное состояние; thumb использует только `transform` |

На одном действии оставлен один доминирующий сигнал: moving selection surface, shared element либо modal content. Цвет/press feedback выступает только короткой поддержкой.

## Removed/reduced animations

- Удалена шестиступенчатая launch-choreography главной: она не объясняла состояние и одновременно двигала heading, hero, capacity и news.
- Удалены staggered reveals на Booking, Trainer и Progress; shared-element/selection feedback достаточен.
- Удалены draw-on линии и последовательное появление точек графика.
- Удалён React geometry morph графика: он вызывал `setState` на каждом `requestAnimationFrame` и мешал rapid period switching.
- Удалена анимация delta и checkmark при первичном mount.
- Удалены digit flip загрузки зала, accent-line draw и unmatched `hero-main-card` transition.
- Удалено растягивание switch thumb через `width`; бинарное изменение теперь transform-only.
- Pagination dots больше не меняют ширину и не двигают соседей.
- Skeletons оставлены статичными: форма показывает loading-state без одновременной бесконечной paint-анимации множества блоков.
- Bottom tabs больше не запускают page View Transition; sibling navigation меняется сразу, доминирующий motion — только nav indicator.
- Booking success больше не ждёт 420 ms ради анимации: state и confirmed screen обновляются сразу после ответа API.

## Performance findings

- Удалены все `transition: all` и локальные CSS timing/easing values.
- В motion hot-path нет анимаций `width`, `height`, `top` или `left`.
- Booking shimmer переведён с `left` на `transform`.
- Удалены постоянные `will-change` с pressable/cards/switch/chart tooltip; временный `will-change` остался только на короткоживущем `.time-digit-flip`.
- Удалён `backdrop-filter: blur(12px)` со sticky header и blur с modal backdrop. Modal shadow уменьшен с 80 до 40 px.
- Chart period и DateStrip выполняют одну пару layout-read на смену selection в `useLayoutEffect`, до paint; циклического read/write нет.
- Chart dataset теперь рассчитывается через memoized pure geometry и рендерится один раз на selection вместо 13+ React renders за 220 ms.
- Home ждёт critical Home + Schedule queries перед первой карточкой: состояние `empty → slot` не телепортируется после async request.
- 10 клиентских маршрутов проверены при 390×844: горизонтального overflow нет; в steady state нет самозапускающихся animation names.

Цель 60 fps поддержана архитектурно (compositor-friendly properties, отсутствие frame-by-frame React state и больших blur). Полноценный frame trace на физическом low-end Android не выполнялся — см. ограничения.

## Reduced-motion behavior

`prefers-reduced-motion: reduce` применяется глобально:

- duration tokens становятся `0.01ms`, iteration count — `1`;
- View Transitions полностью отключаются;
- booking shimmer и Health sync bar скрываются;
- time digit flip отключается;
- `useCountUp` возвращает итоговое значение сразу;
- scroll behavior становится `auto`.

State feedback сохраняется через текст (`Записываем…`, `Синхронизация…`), disabled-state, цвет, рамку, checkmark, status/icon и итоговые данные. Large spatial animation в reduced mode отсутствует.

## Native findings

### Android

- Capacitor assets и plugins синхронизированы.
- Исправлены native build blockers: `minSdkVersion` поднят с 24 до 26 для Health Connect; Java/Kotlin targets выровнены на JVM 21 для Capacitor 8.
- Health Connect bridge больше не использует internal alpha-константу и корректно override-ит Capacitor permission method.
- Debug APK собран, установлен и запущен на Android API 35 emulator; Activity resumed, crash/FATAL errors не обнаружены.
- Добавлен `@capacitor/app` back handler: modal закрывается первым Back, затем используется WebView history, на корне приложение выходит.
- Foreground → background → foreground smoke pass завершён без crash.
- Верхний safe area учтён в sticky header, нижний — в navigation/page padding, оба safe area — в modal padding/max-height.
- Modal использует `100dvh` max-height и внутренний scroll, поэтому остаётся доступным при уменьшении visual viewport клавиатурой.

### iOS

- Capacitor assets и SPM plugin graph синхронизированы успешно.
- Safe areas и keyboard-constrained modal покрыты общим CSS.
- Xcode compile/simulator run недоступны в Windows-среде; нативный gesture-back и HealthKit runtime здесь не подтверждены.

## Remaining limitations

- В native production bundle не задан внешний `VITE_API_BASE_URL`; relative `/api/v1` работает в web deployment, но установленный APK показывает корректный no-connection/error state до настройки HTTPS API endpoint.
- Физические low-end Android/iPhone frame traces, thermal throttling и OEM WebView variance не измерялись; выполнены mobile-browser QA и Android API 35 emulator smoke.
- Device-level runtime эмуляция `prefers-reduced-motion` недоступна в использованном in-app browser; покрытие подтверждено по глобальному CSS media block и обеим JS-защитам (`safeStartViewTransition`, `useReducedMotion`).
- iOS build/sign/run требует macOS + Xcode и реального entitlement-профиля HealthKit.

## Validation

- `npm run lint` — passed.
- `npx tsc -b --pretty false` — passed.
- backend `pytest` — 40 passed; concurrent last-place booking test включён.
- `npm run build` — passed.
- `npx cap sync` — Android/iOS passed.
- Android `assembleDebug` — passed; APK создан в `android/app/build/outputs/apk/debug/app-debug.apk`.
- Browser rapid interaction — tabs, days, chart periods, Back, modal close/reopen/Escape passed.
