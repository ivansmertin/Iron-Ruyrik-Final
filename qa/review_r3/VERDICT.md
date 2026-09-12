# R3 — BLOCK (M08–M12, общий финальный smoke)

Дата: 2026-09-12. Git HEAD/base накопленного diff: 58875cb896d8d845283eaf61cdc99df3920b1b62. Логический base R3: принятый R2 с remediation по указанию заказчика. Отдельного коммита/воспроизводимого принятого snapshot R2 в истории нет. Target: незакоммиченный M12, source-manifest.json (SHA256 файла 531624EF5090D1855BB433E3AEC937D110D86CD0ABC77A7FC2C6EBC2260A5910). Проверка хешей src после выполнения не выявила изменений. Код приложения и существующие тесты reviewer не менял.

R1/R2 приняты как контекст; R2-01/02/03/05 ниже заново воспроизводятся в target. Это не отменяет прежнюю приёмку, но не позволяет считать remediation сохранённой в переданном срезе.

## P0
Не обнаружены: наблюдаемой потери/повреждения данных нет.

## P1 — устранить внутри текущего блока

1. R3-01 / R2-01. src/pages/BookingPage.tsx:490. При 7/8 POST успешен, refetch возвращает 8/8. На виртуальных 100 и 349 ms вместо confirmed отображается «Все места заняты… выберите другой интервал». Требуется непрерывная 350 ms фиксация успеха при немедленном cache commit. Минимум: presentation confirmed выше live availability, сохранённый slot snapshot. Evidence: last7-results.json, last7-100.png, last7.mjs. Итоговый last7 harness использует один submit; отдельная диагностическая попытка двух синтетических clicks в одном JS task не трактуется как доказательство пользовательского double-submit.

2. R3-02 / R2-03. src/pages/BookingPage.tsx:132,178. /booking/s0?trainer=dima с GET /trainers=[] показывает только unchecked self radio, но submit отправляет trainerSlug:dima. Expected: payload совпадает с явно выбранным доступным вариантом. Минимум: проверить roster/выбор на render и submit, запросить явный валидный выбор. Evidence: trainer-risk-results.json (radios/bookingPayload), empty-roster.png.

3. R3-03 / R2-02. src/pages/SchedulePage.tsx:239. Schedule → Booking → history Back: activeElement BODY, source slot не получает фокус. Expected: восстановление source context и фокуса. Минимум: сохранить source slot/scroll на исходном history entry, согласовать с DateStrip. Evidence: risk-results.json/backFocus, target-history-back.png. Полный resized late-day scroll gate этим коротким smoke не считается закрытым.

4. R3-04 / R2-05. src/styles/index.css:1448,1714. Schedule с trainer filter: reset 75.03×28 CSS px; full/blocked reasons RGB146 при ancestor opacity .65 на RGB17 дают около 3.23:1. Expected ≥44×44 и ≥4.5:1. Минимум: реальная высота reset 44, убрать dimming с читаемых причин. Evidence: a11y-results.json, schedule-a11y.png; screenshot + DOM computed styles, не только CSS inference.

5. R3-05. src/components/ProgressLineChart.tsx:127. Три замера с одним measuredAt получают X 16/160/304, создавая ложный временной интервал. Expected: одинаковые timestamps имеют одну X-координату. Минимум: центрировать общий X при нулевом диапазоне, оставить доступный список/Prev/Next для выбора; изменить test, который сейчас явно требует различающиеся cx. Evidence: browser-results.json/sameTimeX (первые три circle — график), same-time.png; src/__tests__/m08_progress_measurements.test.tsx.

6. R3-06. qa/verify_m12_final_acceptance.mjs:492, MIGRATION_LOG.md:452. Статус PASS зависит только от отсутствия horizontal scroll. Номинальный m12_10_admin_390x844.png — skeleton, m12_07_progress_390x844.png — пустой вес. Fixtures расходятся с API: history вместо weightSeries; admin bookings объект вместо массива; schedule days без date/slots. Скрипт не доказывает заявленные actions, использует optional DOM clicks и sleeps. Expected: matrix/edge/flow evidence с корректными contracts, ожидаемым UI state и привязкой к source hash. Минимум: исправить harness, assertions и статус недоказанных gates, переснять затронутые invalid cells, не автоматически все 40. Final native sync, complete rapid/cache-unmount regressions и часть boundary states остаются недоказаны; старые PASS их не закрывают.

7. R3-07. MIGRATION_LOG.md:462; src/main.tsx, src/components/Modal.tsx. Native safe area/keyboard/permissions/верхний Back не подтверждены на M12; adb не видит устройств. Browser Escape/history, source и jsdom не являются device PASS. Минимум: актуальный device build identifier + evidence маршрутов, modal LIFO, keyboard, permission/sync и pending context; убрать неподтверждённый PASS до evidence. Это evidence block, не утверждение нативной регрессии.

## P2

- R3-08, owner Antigravity/Frontend. src/styles/index.css:3773: Admin 320, длинное ФИО в колонке 77.42 px распадается на 7 строк, строка info 150.25 px; «Самостоятельно» имеет scrollWidth 98 при width 77.42. Без горизонтального overflow страницы, но плотность и читаемость нарушены. Минимум: адаптивная раскладка статуса/имени, перенос trainer label. Закрытие: скриншот 320 с длинным ФИО и полностью читаемыми непересекающимися полями при компактной строке. Evidence: admin-long320.png, browser-results.json/adminGeometry. Аналогичная проблема видна в предоставленном m10_admin_long_names_320x740.png.
- R3-09, owner Antigravity/Docs. docs/issues/ISSUE-BACKEND-TRAINER-SLOT-AVAILABILITY.md ошибочно говорит, что backend не проверяет пересечение тренера: service проверяет trainer_has_overlap, suite это подтверждает. MOTION_QA.md остаётся от 07.09; MIGRATION_LOG описывает details/summary, которых chart больше не использует. Минимум: точечно согласовать документацию и отделить отсутствие availability preview от существующего booking guard. Закрытие: утверждения соответствуют текущему source/evidence.

## Подтверждено и ограничения

- Build PASS, frontend 135/135 PASS (14 файлов), команды выполнены один раз. Lint первоначально EPERM .pytest_cache; retry с исключением недоступных pytest cache/temp directories PASS. Backend первоначально 34 setup permission errors, 6 pass; retry с отдельными qa/review_r3 pytest cache/temp — 40/40 PASS, Starlette deprecation warning. Полные логи рядом; ошибки окружения не выдаются за source regression.
- Независимый browser smoke: все 10 состояний на 390 (включая booking create/details); screenshots визуально просмотрены. Приоритетные Progress 320/430, Profile 390, Admin 360 и long row 320. Не переснимались все 40 views.
- Действительные startViewTransition/ready во всех трёх связях (Home slot, Schedule slot, Trainer identity); уникальные имена в измеренном DOM. No-VT navigation и reduced-motion navigation проходят; router может вызвать VT и при reduced motion, CSS отключает анимацию. Это не blanket video/rapid/native PASS. Browser contexts записывались в video/; отдельная frame-by-frame video оценка не завершена.
- Manual 77.5 → invalidation → hero/readout 77.5/date/source и 4 точки. Home→Schedule→booking/cancel→Profile; Trainer→Schedule→Booking; Admin error внутри dialog сохраняет имя, retry success закрывает dialog, capacity обновляется. Это fixtures в review harness, не fake product data и не изменение реального backend.
- Profile history 12; Escape возвращает фокус к «Вся история», inert true→false. Обычные nominal измеренные targets ≥44; исключение Schedule reset отдельно воспроизведено. Нельзя переносить nominal результат на всю edge matrix.
- По source сохраняются QueryClient lifetime, BookingProvider общий ancestor, React Router 7 и equivalent routes, существующая архитектура запросов; no backend/package diff. CountUp undefined first value/StrictMode cleanup, LBM terminology, отсутствие canonical fallback и UI 3/3, HTML chart controls вне aria-hidden SVG сохранены. Unit first-async assertion проверяет конечное значение через waitFor, а не первый кадр; полного first-frame PASS не заявляем.
- Известные отдельные долги: backend fabricated activity summary (скрыт в UI), отсутствие персонального availability preview, auth prototype boundary; LBM terminology contract не новая функция. Cancellation 4h/capacity/trainer server policies не менялись; backend suite прошёл. Точное субминутное legacy rounding не перепроверялось и не объявляется закрытым.

Следующий проход R3: только fix diff R3-01–09 и relevant regression evidence, плюс остающиеся обязательные gates. Перед следующим блоком нужен PASS или PASS WITH P2. Новый дизайн, UI kit, auth scope и backend refactor не требуются.
